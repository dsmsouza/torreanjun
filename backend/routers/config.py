import os
import shutil
import uuid
import threading
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from routers.auth import get_current_admin

from database.connection import get_db, engine, SessionLocal
from services import operacional as op_service
from models.models import ClienteMapping
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/config", 
    tags=["Configurações"]
)

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Banco de Dados", "torre_anjun.db"))

# ─────────────────────────────────────────────────────────────────
# Sistema de Jobs com Log em Tempo Real
# ─────────────────────────────────────────────────────────────────
_JOBS: dict[str, dict] = {}  # job_id → {status, logs, error}

from services import otimizador_planilha

UPLOAD_OTIMIZADOR_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "otimizados"))
os.makedirs(UPLOAD_OTIMIZADOR_DIR, exist_ok=True)

def _new_job() -> str:
    job_id = str(uuid.uuid4())[:8]
    _JOBS[job_id] = {
        "status": "running",
        "progress": 0,
        "logs": [],
        "error": None,
        "result": None,
        "stats": {}
    }
    return job_id

def _log(job_id: str, msg: str, kind: str = "info"):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    if job_id in _JOBS:
        _JOBS[job_id]["logs"].append({"ts": ts, "msg": msg, "kind": kind})

def _progress(job_id: str, progress: float, stats: dict = None):
    if job_id in _JOBS:
        _JOBS[job_id]["progress"] = progress
        if stats:
            if "stats" not in _JOBS[job_id]:
                _JOBS[job_id]["stats"] = {}
            _JOBS[job_id]["stats"].update(stats)

def _done(job_id: str, result: dict):
    if job_id in _JOBS:
        _JOBS[job_id]["status"] = "done"
        _JOBS[job_id]["result"] = result
        _JOBS[job_id]["progress"] = 100

def _fail(job_id: str, error: str):
    if job_id in _JOBS:
        _JOBS[job_id]["status"] = "error"
        _JOBS[job_id]["error"] = error
        _JOBS[job_id]["logs"].append({"ts": datetime.datetime.now().strftime("%H:%M:%S"), "msg": f"❌ Erro: {error}", "kind": "error"})

@router.get("/ingestao-status/{job_id}")
def get_ingestao_status(job_id: str):
    """Retorna o status, logs e progresso de um job de ingestão em andamento."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return job

@router.post("/otimizar-planilha")
async def post_otimizar_planilha(
    file: UploadFile = File(...),
    atualizar_sistema: bool = Form(True),
    data_operacao: Optional[str] = Form(None),
    num_semana: Optional[str] = Form(None),
    modo: Optional[str] = Form("central")
):
    """Recebe planilha pesada (300MB+), reduz em streaming e já atualiza diretamente a base do sistema."""
    try:
        modo_clean = (modo or "central").strip().lower()
        job_id = _new_job()
        ext = os.path.splitext(file.filename or "")[1].lower() or ".xlsx"
        temp_input = os.path.join(UPLOAD_OTIMIZADOR_DIR, f"entrada_{job_id}{ext}")
        
        # Salva o arquivo em pedaços de 1MB para nunca estourar a memória RAM durante o upload
        _log(job_id, f"📥 Recebendo arquivo '{file.filename}' em streaming seguro...", "info")
        with open(temp_input, "wb") as f_dst:
            while chunk := await file.read(1024 * 1024):
                f_dst.write(chunk)
                
        tamanho_mb = round(os.path.getsize(temp_input) / (1024 * 1024), 2)
        _log(job_id, f"📁 Arquivo salvo no servidor ({tamanho_mb} MB). Iniciando processamento...", "info")

        def _run():
            try:
                _log(job_id, "🔍 Iniciando leitura das 18 colunas selecionadas...", "info")
                if modo_clean == "no_dia":
                    _log(job_id, "⚡ Visão 'No Dia (D0)': Mantendo 100% das linhas e pontos vazios (excluindo apenas colunas extras)...", "info")
                else:
                    _log(job_id, "🧹 Visão 'Central de Coletas': Filtrando pontos vazios, SP-R-TFK001 e ANJUN na Coluna P...", "info")
                _log(job_id, "📅 Inspecionando datas na Coluna M...", "info")

                def cb(prog):
                    total = prog.get("linhas_totais", 0)
                    mantidas = prog.get("linhas_mantidas", 0)
                    descartadas = prog.get("linhas_descartadas", 0)
                    _log(job_id, f"⚡ Processadas {total:,} linhas | Mantidas: {mantidas:,} | Descartadas: {descartadas:,}", "info")
                    _progress(job_id, 0, stats=prog)

                res = otimizador_planilha.processar_otimizacao_streaming(
                    caminho_entrada=temp_input,
                    diretorio_saida=UPLOAD_OTIMIZADOR_DIR,
                    job_id=job_id,
                    callback_progresso=cb,
                    modo=modo_clean
                )

                _log(job_id, f"✅ Otimização concluída com sucesso em {res['tempo_total_segundos']}s!", "success")
                _log(job_id, f"📊 Total Linhas Lidas: {res['linhas_totais']:,} | Mantidas: {res['linhas_mantidas']:,} | Descartadas: {res['linhas_descartadas']:,}", "success")
                if res.get("data_detectada"):
                    _log(job_id, f"📅 Data Identificada na Coluna M: {res['data_detectada']}", "success")
                _log(job_id, f"📉 Redução de peso: de {res['tamanho_original_mb']} MB para {res['tamanho_final_mb']} MB ({res['reducao_pct']}% menor)", "success")

                # Se solicitado, já atualiza a base operacional do sistema diretamente
                if atualizar_sistema:
                    _log(job_id, "🚀 Integrando dados diretamente na base da Torre ANJUN...", "info")
                    
                    # A data detectada na Coluna M tem precedência absoluta
                    dt_detectada = res.get("data_detectada")
                    dt_raw = dt_detectada or (data_operacao.strip() if data_operacao else None) or datetime.datetime.now().strftime("%Y-%m-%d")

                    # Padronizar formato para DD/MM/YYYY
                    if "-" in dt_raw:
                        try:
                            d_obj = datetime.datetime.strptime(dt_raw[:10], "%Y-%m-%d")
                            dt_br = d_obj.strftime("%d/%m/%Y")
                            sem_final = str(d_obj.isocalendar()[1])
                        except Exception:
                            dt_br = dt_raw
                            sem_final = num_semana or "41"
                    else:
                        dt_br = dt_raw
                        sem_final = num_semana or "41"

                    _log(job_id, f"📅 Data Operacional confirmada: {dt_br} (Semana {sem_final})", "info")

                    db = SessionLocal()
                    try:
                        caminho_otimizado_csv = os.path.join(UPLOAD_OTIMIZADOR_DIR, res["arquivo_csv"])
                        caminho_otimizado_xlsx = os.path.join(UPLOAD_OTIMIZADOR_DIR, res["arquivo_xlsx"])
                        caminho_usar = caminho_otimizado_csv if os.path.exists(caminho_otimizado_csv) else caminho_otimizado_xlsx

                        # 0. Reconciliação Retroativa de Pacotes (identifica códigos de barras existentes e atualiza status no dia de origem)
                        try:
                            from services.reconciliacao_pacotes import reconciliar_planilha_otimizada_csv
                            _log(job_id, "🔄 Verificando pacotes já existentes no banco para atualização retroativa de status...", "info")
                            res_rec = reconciliar_planilha_otimizada_csv(
                                db=db,
                                caminho_csv=caminho_otimizado_csv,
                                dia_planilha=dt_br,
                                semana_planilha=f"SEMANA {sem_final}",
                                callback_log=lambda m: _log(job_id, m, "success")
                            )
                            # Indicadores do dia passam a usar somente os pacotes coletados neste dia (sem contagem dupla)
                            csv_proprio = (res_rec or {}).get("csv_dia_proprio")
                            if csv_proprio and os.path.exists(csv_proprio):
                                caminho_usar = csv_proprio
                        except Exception as e_rec:
                            _log(job_id, f"⚠️ Aviso na reconciliação de pacotes: {e_rec}", "info")

                        # 1. Atualizar Criação de Pedidos (Alimenta o Cockpit D-1 em "Fluxo de Novas Solicitações")
                        _log(job_id, "📊 Atualizando Cockpit D-1 (Fluxo de Novas Solicitações)...", "info")
                        res_criacao = op_service.processar_planilha_criacao_pedidos(
                            db=db,
                            data_operacao=dt_br,
                            num_semana=sem_final,
                            caminho_arquivo=caminho_usar
                        )

                        # 2. Atualizar Dropoff Operacional (Minidrops, Histórico da Torre e SLAs)
                        _log(job_id, "🏪 Atualizando Dropoff e histórico de MDs da Torre ANJUN...", "info")
                        res_dropoff = op_service.processar_ingestao_dropoff(
                            db=db,
                            data_operacao=dt_br,
                            num_semana=sem_final,
                            caminho_arquivo=caminho_usar
                        )

                        res["ingestao_sistema"] = {
                            "criacao": res_criacao,
                            "dropoff": res_dropoff,
                            "data_operacao": dt_br,
                            "semana": sem_final
                        }
                        _log(job_id, f"🎉 Sistema 100% atualizado para {dt_br}! Cockpit D-1 e Minidrops alimentados com sucesso.", "success")
                    finally:
                        db.close()

                    # 3. Sincronizar automaticamente com o Dashboard Online (GitHub / Vercel)
                    try:
                        import sys as _sys
                        import subprocess as _sp
                        _log(job_id, "☁️ Sincronizando dados e histórico completo com o Dashboard Online (Vercel)...", "info")
                        script_snap = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts", "exportar_snapshot_online.py"))
                        if os.path.exists(script_snap):
                            _sp.run([_sys.executable, script_snap, "--push"], timeout=300)
                            _log(job_id, "🌐 Dashboard Online atualizado e publicado na nuvem com sucesso!", "success")
                    except Exception as e_snap:
                        _log(job_id, f"⚠️ Aviso na publicação online automática: {e_snap}", "info")

                _progress(job_id, 100, stats=res)
                _done(job_id, res)
            except Exception as e:
                _fail(job_id, f"Falha no processamento: {e}")
            finally:
                if os.path.exists(temp_input):
                    try:
                        os.remove(temp_input)
                    except Exception:
                        pass

        threading.Thread(target=_run, daemon=True).start()
        return {"job_id": job_id, "status": "started", "tamanho_original_mb": tamanho_mb}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/download-otimizado/{job_id}/{formato}")
def download_planilha_otimizada(job_id: str, formato: str):
    """Permite download do arquivo otimizado em .xlsx ou .csv."""
    formato_clean = formato.lower().strip()
    if formato_clean not in ("xlsx", "csv"):
        raise HTTPException(status_code=400, detail="Formato inválido. Use 'xlsx' ou 'csv'.")
        
    nome_arquivo = f"planilha_otimizada_{job_id}.{formato_clean}"
    caminho_arquivo = os.path.join(UPLOAD_OTIMIZADOR_DIR, nome_arquivo)
    
    if not os.path.exists(caminho_arquivo):
        raise HTTPException(status_code=404, detail="Arquivo otimizado não encontrado ou expirado.")
        
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if formato_clean == "xlsx" else "text/csv"
    return FileResponse(
        caminho_arquivo,
        media_type=media_type,
        filename=f"planilha_otimizada_{job_id}.{formato_clean}"
    )



@router.get("/backup")
def get_backup(current_admin: dict = Depends(get_current_admin)):
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Banco de dados não encontrado.")
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_torre_anjun_{timestamp}.db"
    
    # Salvar cópia local na pasta historico
    historico_dir = os.path.join(os.path.dirname(DB_PATH), "historico")
    os.makedirs(historico_dir, exist_ok=True)
    shutil.copy2(DB_PATH, os.path.join(historico_dir, filename))
    
    return FileResponse(
        path=DB_PATH,
        media_type="application/octet-stream",
        filename=filename
    )

@router.post("/restore")
async def post_restore(db_file: UploadFile = File(...), current_admin: dict = Depends(get_current_admin)):
    # Validate extension
    if not db_file.filename.endswith(".db"):
        raise HTTPException(status_code=400, detail="Formato de arquivo inválido. Deve ser um arquivo .db.")
    
    import time
    temp_db_path = DB_PATH + ".restore"
    
    try:
        # 1. Write to temp file first
        with open(temp_db_path, "wb") as buffer:
            shutil.copyfileobj(db_file.file, buffer)
            
        # 2. Dispose of engine to release connection pool
        engine.dispose()
        
        # 3. Try to replace the database file with retries (for Windows locks)
        success = False
        last_error = None
        for attempt in range(5):
            try:
                # Remove WAL/SHM files if WAL mode was used
                for suffix in ["", "-wal", "-shm"]:
                    p = DB_PATH + suffix if suffix else DB_PATH
                    if os.path.exists(p):
                        os.remove(p)
                
                # Rename temp to main
                os.rename(temp_db_path, DB_PATH)
                success = True
                break
            except Exception as ex:
                last_error = ex
                time.sleep(0.2)
                
        if not success:
            if os.path.exists(temp_db_path):
                os.remove(temp_db_path)
            raise last_error or RuntimeError("Não foi possível substituir o arquivo do banco de dados.")
            
        return {"status": "success", "message": "Banco de dados restaurado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao restaurar banco de dados: {e}")


@router.post("/clean")
def post_clean(db: Session = Depends(get_db)):
    try:
        tables = [
            "historico_torre",
            "detalhe_md_historico",
            "detalhe_cliente_historico",
            "detalhe_cliente_md_historico",
            "detalhe_pico_historico",
            "detalhe_lacres_historico",
            "backlog_aging",
            "avaliacao_md",
            "ocorrencias_md",
            "justificativas_diarias",
            "penalidades_md",
            "md_observacoes_fixas"
        ]
        
        # Disable foreign keys temporarily and truncate
        db.execute(text("PRAGMA foreign_keys = OFF;"))
        for table in tables:
            db.execute(text(f"DELETE FROM {table};"))
        db.execute(text("PRAGMA foreign_keys = ON;"))
        
        # Reclaim space
        # db.execute(text("VACUUM;"))  # Removed: cannot VACUUM from within a transaction in SQLite
        db.commit()
        
        return {"status": "success", "message": "Tabelas históricas limpas com sucesso!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao limpar banco de dados: {e}")


@router.post("/importar-dropoff")
def post_importar_dropoff(
    data_operacao: str = Form(...),
    num_semana: str = Form(...),
    file_operacional: UploadFile = File(...)
):
    try:
        file_operacional_bytes = file_operacional.file.read()
        job_id = _new_job()

        def _run():
            db = SessionLocal()
            try:
                _log(job_id, "📂 Lendo planilha Operacional (Dropoff)...", "info")
                _log(job_id, "🔍 Mapeando colunas e validando dados...", "info")
                _log(job_id, "📊 Calculando volumes, backlog e SLA para MDs...", "info")
                _log(job_id, "💾 Gravando histórico no banco de dados...", "info")
                res = op_service.processar_ingestao_dropoff(
                    db=db,
                    data_operacao=data_operacao,
                    num_semana=num_semana,
                    file_operacional_bytes=file_operacional_bytes
                )
                _log(job_id, f"✅ {res.get('message', 'Ingestão Dropoff concluída!')}", "success")
                _done(job_id, res)
            except Exception as e:
                _fail(job_id, str(e))
            finally:
                db.close()

        threading.Thread(target=_run, daemon=True).start()
        return {"job_id": job_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/importar-pickup")
def post_importar_pickup(
    data_operacao: str = Form(...),
    num_semana: str = Form(...),
    file_operacional: UploadFile = File(...)
):
    try:
        file_operacional_bytes = file_operacional.file.read()
        job_id = _new_job()

        def _run():
            db = SessionLocal()
            try:
                _log(job_id, "📂 Lendo planilha Operacional (Pickup)...", "info")
                _log(job_id, "🔍 Mapeando colunas e validando dados...", "info")
                _log(job_id, "📊 Analisando sellers e regiões de coleta...", "info")
                _log(job_id, "💾 Gravando histórico Pickup no banco de dados...", "info")
                res = op_service.processar_ingestao_pickup(
                    db=db,
                    data_operacao=data_operacao,
                    num_semana=num_semana,
                    file_operacional_bytes=file_operacional_bytes
                )
                _log(job_id, f"✅ {res.get('message', 'Ingestão Pickup concluída!')}", "success")
                _done(job_id, res)
            except Exception as e:
                _fail(job_id, str(e))
            finally:
                db.close()

        threading.Thread(target=_run, daemon=True).start()
        return {"job_id": job_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/importar-criacao")
def post_importar_criacao(
    data_operacao: str = Form(...),
    num_semana: str = Form(...),
    file_criacao: UploadFile = File(...),
):
    try:
        file_criacao_bytes = file_criacao.file.read()
        job_id = _new_job()

        def _run():
            db = SessionLocal()
            try:
                _log(job_id, "📂 Lendo planilha de Criação de Pedidos...", "info")
                _log(job_id, "🔍 Detectando colunas e formato...", "info")
                _log(job_id, "🌎 Aplicando filtro Brasil-only (CEP + Estado + Cidade)...", "info")
                _log(job_id, "🏷️ Classificando clientes e marketplaces...", "info")
                _log(job_id, "📊 Calculando saldo de pedidos novos vs histórico...", "info")
                _log(job_id, "💾 Salvando no banco de dados...", "info")
                res = op_service.processar_planilha_criacao_pedidos(
                    db=db,
                    data_operacao=data_operacao,
                    num_semana=num_semana,
                    file_criacao_bytes=file_criacao_bytes
                )
                _log(job_id, f"✅ {res.get('message', 'Concluído!')}", "success")
                _log(job_id, f"📦 Total histórico do dia: {res.get('total_historico', res.get('total_pedidos', 0)):,} pedidos", "success")
                _log(job_id, f"🏪 Sellers únicos: {res.get('total_sellers', 0):,} | CEPs únicos: {res.get('total_ceps', 0):,}", "success")
                _done(job_id, res)
            except Exception as e:
                _fail(job_id, str(e))
            finally:
                db.close()

        threading.Thread(target=_run, daemon=True).start()
        return {"job_id": job_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/importar-dupla")
def post_importar_dupla(
    data_operacao: str = Form(...),
    num_semana: str = Form(...),
    file_operacional: UploadFile = File(...),
    file_criacao: UploadFile = File(None),
    file_mds: UploadFile = File(None),
):
    try:
        file_op_bytes = file_operacional.file.read() if (file_operacional and getattr(file_operacional, 'filename', None)) else None
        file_mds_bytes = file_mds.file.read() if (file_mds and getattr(file_mds, 'filename', None) and len(file_mds.filename.strip()) > 0) else None
        file_cr_bytes = None
        if file_criacao and getattr(file_criacao, 'filename', None) and len(file_criacao.filename.strip()) > 0:
            file_cr_bytes = file_criacao.file.read()
            if not file_cr_bytes: file_cr_bytes = None

        job_id = _new_job()

        def _run():
            db = SessionLocal()
            try:
                _log(job_id, "📂 Lendo planilha de MDs (malha)...", "info")
                _log(job_id, "📂 Lendo planilha Operacional de Coletas...", "info")
                _log(job_id, "🔍 Mapeando colunas e validando dados...", "info")
                _log(job_id, "🏷️ Classificando status de coleta e clientes...", "info")
                _log(job_id, "📊 Calculando volumes, backlog e SLA...", "info")
                _log(job_id, "💾 Gravando histórico operacional no banco...", "info")
                res_op = op_service.processar_ingestao_planilhas(
                    db=db, data_operacao=data_operacao, num_semana=num_semana,
                    file_mds_bytes=file_mds_bytes, file_operacional_bytes=file_op_bytes, file_rangerover_bytes=None
                )
                _log(job_id, f"✅ {res_op.get('message', 'Operacional concluído!')}", "success")

                res_criacao = None
                if file_cr_bytes:
                    _log(job_id, "📂 Lendo planilha de Criação de Pedidos...", "info")
                    _log(job_id, "🌎 Aplicando filtro Brasil-only...", "info")
                    _log(job_id, "🏷️ Classificando clientes e marketplaces...", "info")
                    _log(job_id, "📊 Calculando saldo de pedidos novos vs histórico...", "info")
                    _log(job_id, "💾 Salvando criação no banco...", "info")
                    res_criacao = op_service.processar_planilha_criacao_pedidos(
                        db=db, data_operacao=data_operacao, num_semana=num_semana,
                        file_criacao_bytes=file_cr_bytes
                    )
                    _log(job_id, f"✅ {res_criacao.get('message', 'Criação concluída!')}", "success")
                    _log(job_id, f"📦 Histórico do dia: {res_criacao.get('total_historico', 0):,} | Sellers: {res_criacao.get('total_sellers', 0):,}", "success")

                msg = res_op.get("message", "Ingestão concluída!")
                if res_criacao:
                    msg += f" | Criação: {res_criacao.get('total_pedidos', 0):,} novos pedidos."
                _done(job_id, {"status": "success", "message": msg, "operacional": res_op, "criacao": res_criacao})
            except Exception as e:
                _fail(job_id, str(e))
            finally:
                db.close()

        threading.Thread(target=_run, daemon=True).start()
        return {"job_id": job_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/importar-backlog")
def post_importar_backlog(file_backlog: UploadFile = File(...)):
    """Importa e SUBSTITUI a tabela 'backlog_aging' com o relatório de envelhecimento (Radar de Malha)."""
    try:
        file_bytes = file_backlog.file.read()
        filename = (file_backlog.filename or "backlog.xlsx").lower()

        import io
        import pandas as pd

        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            try:
                df = pd.read_excel(io.BytesIO(file_bytes), engine="calamine")
            except Exception:
                df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")

        df.columns = [str(c).strip() for c in df.columns]
        df_mapped = op_service.mapear_colunas(df)

        if df_mapped.empty:
            raise HTTPException(status_code=400, detail="Não foi possível identificar colunas conhecidas na planilha.")

        # Fallback: se não vier ID de cliente, tenta coluna genérica (nome do parceiro/marketplace)
        if df_mapped["id_cliente"].isna().all():
            for col in df.columns:
                c = op_service.remover_acentos_espacos(str(col))
                if ("cliente" in c or "parceiro" in c or "marketplace" in c) and "numero" not in c and "codigo" not in c and "id" not in c:
                    df_mapped["cliente"] = df[col]
                    break
            else:
                df_mapped["cliente"] = None
        else:
            df_mapped["cliente"] = df_mapped["id_cliente"]

        def _text(v):
            return "" if v is None else str(v).strip()

        df_mapped = df_mapped[df_mapped["barcode"].notna()].copy()
        df_mapped["barcode"] = df_mapped["barcode"].apply(_text)
        df_mapped = df_mapped[df_mapped["barcode"] != ""].drop_duplicates(subset=["barcode"])

        if df_mapped.empty:
            raise HTTPException(status_code=400, detail="Nenhuma linha com código de barras válido encontrada na planilha.")

        rows = []
        for _, r in df_mapped.iterrows():
            rows.append({
                "codigo_barras": r["barcode"],
                "cliente": _text(r.get("cliente")),
                "saca": _text(r.get("saca")),
                "data_bipagem": _text(r.get("tempo_coleta")),
                "status": _text(r.get("status")),
                "md": _text(r.get("md")),
                "estado": _text(r.get("estado")),
                "cidade": _text(r.get("cidade")),
                "tipo_pedido": _text(r.get("tipo_pedido")),
            })

        db = SessionLocal()
        try:
            db.execute(text("DELETE FROM backlog_aging;"))
            insert_sql = text("""
                INSERT OR REPLACE INTO backlog_aging
                (codigo_barras, cliente, saca, data_bipagem, status, md, estado, cidade, tipo_pedido)
                VALUES (:codigo_barras, :cliente, :saca, :data_bipagem, :status, :md, :estado, :cidade, :tipo_pedido)
            """)
            for r in rows:
                db.execute(insert_sql, r)
            db.commit()
            total = len(rows)
        finally:
            db.close()

        return {"status": "success", "message": f"Backlog atualizado com {total:,} pacotes!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao importar relatório de backlog: {e}")





from pydantic import BaseModel

class AIKeyPayload(BaseModel):
    provider: Optional[str] = "gemini"
    gemini_key: Optional[str] = None
    openrouter_key: Optional[str] = None
    deepseek_key: Optional[str] = None
    openrouter_model: Optional[str] = "deepseek/deepseek-chat"

@router.get("/gemini-key")
def get_gemini_key(db: Session = Depends(get_db)):
    try:
        db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
        db.commit()
        rows = db.execute(text("SELECT chave, valor FROM app_config;")).fetchall()
        cfg = {r[0]: r[1] for r in rows}
        
        provider = cfg.get("provider", "gemini")
        gem_k = cfg.get("gemini_api_key", os.environ.get("GEMINI_API_KEY", ""))
        or_k = cfg.get("openrouter_api_key", os.environ.get("OPENROUTER_API_KEY", ""))
        ds_k = cfg.get("deepseek_api_key", os.environ.get("DEEPSEEK_API_KEY", ""))
        or_model = cfg.get("openrouter_model", "deepseek/deepseek-chat")
        
        def mask(k):
            return k[:6] + "..." + k[-4:] if k and len(k) > 10 else ("Configurada" if k else "")

        return {
            "provider": provider,
            "configured": bool(gem_k or or_k or ds_k),
            "gemini_configured": bool(gem_k),
            "gemini_masked_key": mask(gem_k),
            "openrouter_configured": bool(or_k),
            "openrouter_masked_key": mask(or_k),
            "deepseek_configured": bool(ds_k),
            "deepseek_masked_key": mask(ds_k),
            "openrouter_model": or_model,
            "masked_key": mask(cfg.get(f"{provider}_api_key", gem_k))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler configuracao de IA do banco: {e}")

@router.post("/gemini-key")
def post_gemini_key(payload: AIKeyPayload, db: Session = Depends(get_db)):
    try:
        db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
        
        if payload.provider:
            db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('provider', :v);"), {"v": payload.provider.strip().lower()})
        if payload.gemini_key is not None:
            db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('gemini_api_key', :v);"), {"v": payload.gemini_key.strip()})
        if payload.openrouter_key is not None:
            db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('openrouter_api_key', :v);"), {"v": payload.openrouter_key.strip()})
        if payload.deepseek_key is not None:
            db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('deepseek_api_key', :v);"), {"v": payload.deepseek_key.strip()})
        if payload.openrouter_model is not None:
            db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('openrouter_model', :v);"), {"v": payload.openrouter_model.strip()})

        db.commit()
        return {"status": "success", "message": "Configurações de Provedores de IA atualizadas com sucesso!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao gravar configuracoes de IA: {e}")


@router.get("/ultima-ingestao")
def get_ultima_ingestao(db: Session = Depends(get_db)):
    try:
        row = db.execute(text("SELECT dia_base FROM criacao_pedidos_historico ORDER BY rowid DESC LIMIT 1;")).fetchone()
        if not row or not row[0]:
            return {"status": "empty", "message": "Nenhuma ingestão encontrada."}
            
        latest_dia = row[0]
        
        # Check columns dynamically
        cols_info = [r[1] for r in db.execute(text("PRAGMA table_info(criacao_pedidos_historico);")).fetchall()]
        has_tipo = 'tipo_pedido' in cols_info
        has_status = 'status_pedido' in cols_info
        
        select_tipo = "tipo_pedido" if has_tipo else "'Normal' AS tipo_pedido"
        select_status = "status_pedido" if has_status else "'Criado' AS status_pedido"
        group_by = "estado, nome_cliente, maneira_coleta, merchant_nome"
        if has_tipo: group_by += ", tipo_pedido"
        if has_status: group_by += ", status_pedido"
        
        query = f"""
            SELECT SUM(total_pedidos), COUNT(DISTINCT merchant_id), estado, nome_cliente, maneira_coleta, merchant_nome, {select_tipo}, {select_status}
            FROM criacao_pedidos_historico
            WHERE dia_base = :dia
            GROUP BY {group_by}
        """
        rows = db.execute(text(query), {"dia": latest_dia}).fetchall()
        
        total_geral = sum(r[0] or 0 for r in rows)
        
        estados, clientes, modalidades, sellers, tipos, statuses = {}, {}, {}, {}, {}, {}
        raw_data = []
        for r in rows:
            vol = r[0] or 0
            uf = r[2] or "OUTROS"
            cli = r[3] or "OUTROS"
            mod = r[4] or "OUTROS"
            sell = r[5] or "Desconhecido"
            tipo = r[6] if len(r) > 6 and r[6] else "Normal"
            status = r[7] if len(r) > 7 and r[7] else "Criado"
            
            estados[uf] = estados.get(uf, 0) + vol
            clientes[cli] = clientes.get(cli, 0) + vol
            if sell and sell.lower() not in ['desconhecido', 'nan', 'n/a', '']:
                sellers[sell] = sellers.get(sell, 0) + vol
            modalidades[mod] = modalidades.get(mod, 0) + vol
            tipos[tipo] = tipos.get(tipo, 0) + vol
            statuses[status] = statuses.get(status, 0) + vol
            
            raw_data.append({
                "vol": vol,
                "uf": uf,
                "cli": cli,
                "mod": mod,
                "sell": sell,
                "tipo": tipo,
                "status": status
            })
        
        try:
            row_time = db.execute(text("SELECT valor FROM app_config WHERE chave = 'ultima_ingestao_criacao'")).fetchone()
            ultima_ingestao_horario = row_time[0] if row_time else "Desconhecido"
        except Exception:
            ultima_ingestao_horario = "Desconhecido"
            
        return {
            "status": "success",
            "dia_base": latest_dia,
            "ultima_ingestao_horario": ultima_ingestao_horario,
            "status_counts": [{"nome": k, "valor": v} for k, v in sorted(statuses.items(), key=lambda x: x[1], reverse=True)],
            "tipos_pedido": [{"nome": k, "valor": v} for k, v in sorted(tipos.items(), key=lambda x: x[1], reverse=True)],
            "raw_data": raw_data,
            "total_pedidos": total_geral,
            "total_sellers": len(sellers),
            "estados": [{"nome": k, "valor": v} for k, v in sorted(estados.items(), key=lambda x: x[1], reverse=True)],
            "clientes": [{"nome": k, "valor": v} for k, v in sorted(clientes.items(), key=lambda x: x[1], reverse=True)],
            "sellers": [{"nome": k, "valor": v} for k, v in sorted(sellers.items(), key=lambda x: x[1], reverse=True)[:100]],
            "modalidades": [{"nome": k, "valor": v} for k, v in sorted(modalidades.items(), key=lambda x: x[1], reverse=True)]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# Schemas para Cliente Mapping
# ─────────────────────────────────────────────
class ClienteMappingCreate(BaseModel):
    cliente_id: str
    nome_exibicao: str
    ativo: int = 1

class ClienteMappingUpdate(BaseModel):
    nome_exibicao: str
    ativo: int = 1


def _seed_mappings_if_empty(db: Session):
    """Popula a tabela com o mapa hardcoded se ela estiver vazia."""
    count = db.execute(text("SELECT COUNT(*) FROM cliente_mapping")).scalar()
    if count == 0:
        agora = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        defaults = [
            ('24005', 'Shein'), ('24147', 'Shein D2D'), ('24343', 'temuxborder'),
            ('24218', 'temuw2d'), ('24189', 'temud2d'), ('24009', 'Kwai'),
            ('24324', 'tiktok'), ('24020', 'szanjun(internacional)')
        ]
        for cid, nome in defaults:
            db.execute(
                text("INSERT OR IGNORE INTO cliente_mapping (cliente_id, nome_exibicao, ativo, criado_em, atualizado_em) VALUES (:cid, :nome, 1, :ts, :ts)"),
                {"cid": cid, "nome": nome, "ts": agora}
            )
        db.commit()


@router.get("/clientes-mapping")
def listar_cliente_mapping(db: Session = Depends(get_db)):
    """Lista todos os mapeamentos de ID de cliente → nome."""
    try:
        _seed_mappings_if_empty(db)
        rows = db.execute(text("SELECT id, cliente_id, nome_exibicao, ativo FROM cliente_mapping ORDER BY nome_exibicao")).fetchall()
        return [{"id": r[0], "cliente_id": r[1], "nome_exibicao": r[2], "ativo": r[3]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clientes-mapping")
def criar_cliente_mapping(body: ClienteMappingCreate, db: Session = Depends(get_db)):
    """Cria um novo mapeamento de cliente."""
    try:
        agora = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        existing = db.execute(text("SELECT id FROM cliente_mapping WHERE cliente_id = :cid"), {"cid": body.cliente_id.strip()}).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"ID '{body.cliente_id}' já existe. Use o endpoint de atualização.")
        db.execute(
            text("INSERT INTO cliente_mapping (cliente_id, nome_exibicao, ativo, criado_em, atualizado_em) VALUES (:cid, :nome, :ativo, :ts, :ts)"),
            {"cid": body.cliente_id.strip(), "nome": body.nome_exibicao.strip(), "ativo": body.ativo, "ts": agora}
        )
        db.commit()
        return {"status": "success", "message": f"Cliente '{body.nome_exibicao}' criado com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/clientes-mapping/{mapping_id}")
def atualizar_cliente_mapping(mapping_id: int, body: ClienteMappingUpdate, db: Session = Depends(get_db)):
    """Atualiza nome ou status ativo de um mapeamento."""
    try:
        agora = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        row = db.execute(text("SELECT id FROM cliente_mapping WHERE id = :mid"), {"mid": mapping_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mapeamento não encontrado.")
        db.execute(
            text("UPDATE cliente_mapping SET nome_exibicao = :nome, ativo = :ativo, atualizado_em = :ts WHERE id = :mid"),
            {"nome": body.nome_exibicao.strip(), "ativo": body.ativo, "ts": agora, "mid": mapping_id}
        )
        db.commit()
        return {"status": "success", "message": "Mapeamento atualizado com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clientes-mapping/{mapping_id}")
def deletar_cliente_mapping(mapping_id: int, db: Session = Depends(get_db)):
    """Remove um mapeamento de cliente."""
    try:
        row = db.execute(text("SELECT id FROM cliente_mapping WHERE id = :mid"), {"mid": mapping_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mapeamento não encontrado.")
        db.execute(text("DELETE FROM cliente_mapping WHERE id = :mid"), {"mid": mapping_id})
        db.commit()
        return {"status": "success", "message": "Mapeamento removido com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MDMappingCreate(BaseModel):
    md_codigo: str
    nome_ponto: Optional[str] = None
    tipo_ponto: Optional[str] = "MD (Ponto de Coleta)"
    cidade: Optional[str] = "Não Informada"
    estado: str
    regional: str
    cep: Optional[str] = None
    endereco: Optional[str] = None
    horario_trabalho: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ativo: int = 1

class MDMappingUpdate(BaseModel):
    nome_ponto: Optional[str] = None
    tipo_ponto: Optional[str] = "MD (Ponto de Coleta)"
    cidade: Optional[str] = None
    estado: str
    regional: str
    cep: Optional[str] = None
    endereco: Optional[str] = None
    horario_trabalho: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ativo: int = 1

def _normalizar_categoria_malha(codigo: str, tipo_raw: str = "") -> str:
    """Normaliza o tipo de unidade para uma das 4 categorias oficiais da Malha ANJUN:
    MINIDROP, HUB, PONTO DE REDE, PONTO DE APOIO.
    """
    t = (tipo_raw or "").strip().upper()
    c = (codigo or "").strip().upper()
    if t in ("HUB", "PONTO DE REDE", "PONTO DE APOIO", "MINIDROP"):
        return t
    if "APOIO" in t or "APOIO" in c or "-PA" in c or "-RR-" in c:
        return "PONTO DE APOIO"
    if "REDE" in t or "REDE" in c or "-PR" in c:
        return "PONTO DE REDE"
    if "HUB" in t or "GALP" in t or "TRANSFER" in t or "-H" in c or c.startswith("HUB") or "GLP" in c:
        return "HUB"
    if c.startswith("MD-") or (len(c) >= 7 and c[2:7] == "-W-MD") or "MD" in t or "MINIDROP" in t:
        return "MINIDROP"
    return "HUB"


def _sincronizar_override_ponto(db: Session, md_clean: str, categoria: str):
    """Sincroniza a categoria editada em Configurações com a tabela ponto_classificacao_override usada pelo Mapa."""
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS ponto_classificacao_override (
                ponto_codigo TEXT PRIMARY KEY,
                tipo TEXT NOT NULL,
                atualizado_em TEXT
            );
        """))
        mapa_tipo = {
            "MINIDROP": "MD",
            "HUB": "HUB",
            "PONTO DE APOIO": "PONTO_APOIO",
            "PONTO DE REDE": "PONTO_REDE",
        }
        tipo_ov = mapa_tipo.get(categoria, "MD")
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.execute(
            text("INSERT OR REPLACE INTO ponto_classificacao_override (ponto_codigo, tipo, atualizado_em) VALUES (:c, :t, :ts)"),
            {"c": md_clean, "t": tipo_ov, "ts": ts}
        )
    except Exception:
        pass


@router.get("/md-mapping")
def listar_md_mapping(db: Session = Depends(get_db)):
    """Lista todas as unidades da Malha ANJUN (MINIDROP, HUB, PONTO DE REDE, PONTO DE APOIO) sincronizando pontos novos."""
    try:
        # Garante que pontos existentes em malha_coordenadas ou criacao_pedidos_historico também estejam no dicionário editável
        try:
            db.execute(text("""
                INSERT OR IGNORE INTO md_mapping (md_codigo, estado, regional, tipo_ponto, ativo)
                SELECT 
                    UPPER(TRIM(mc.md_codigo)),
                    COALESCE(NULLIF(TRIM(mc.estado), ''), SUBSTR(UPPER(TRIM(mc.md_codigo)), 1, 2), 'SP'),
                    COALESCE(NULLIF(TRIM(mc.regional), ''), COALESCE(NULLIF(TRIM(mc.estado), ''), 'SP')),
                    COALESCE(mc.tipo_ponto, 'MINIDROP'),
                    1
                FROM malha_coordenadas mc
                WHERE mc.md_codigo IS NOT NULL AND TRIM(mc.md_codigo) != ''
                  AND UPPER(TRIM(mc.md_codigo)) NOT IN (SELECT UPPER(TRIM(md_codigo)) FROM md_mapping WHERE md_codigo IS NOT NULL);
            """))
            db.execute(text("""
                INSERT OR IGNORE INTO md_mapping (md_codigo, estado, regional, tipo_ponto, ativo)
                SELECT 
                    UPPER(TRIM(c.ponto_colecao)),
                    COALESCE(MAX(NULLIF(TRIM(c.estado), '')), 'SP'),
                    COALESCE(MAX(NULLIF(TRIM(c.estado), '')), 'SP'),
                    CASE 
                        WHEN UPPER(TRIM(c.ponto_colecao)) LIKE 'MD-%' OR UPPER(TRIM(c.ponto_colecao)) LIKE '__-W-MD%' THEN 'MINIDROP'
                        ELSE 'HUB'
                    END,
                    1
                FROM criacao_pedidos_historico c
                WHERE c.ponto_colecao IS NOT NULL 
                  AND TRIM(c.ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
                  AND UPPER(c.ponto_colecao) NOT LIKE '%SP-R-TFK001%'
                  AND UPPER(c.ponto_colecao) NOT LIKE '%ANJUN%'
                  AND UPPER(TRIM(c.ponto_colecao)) NOT IN (SELECT UPPER(TRIM(md_codigo)) FROM md_mapping WHERE md_codigo IS NOT NULL)
                GROUP BY UPPER(TRIM(c.ponto_colecao));
            """))
            db.commit()
        except Exception:
            db.rollback()

        rows_malha = db.execute(text("""
            SELECT 
                UPPER(TRIM(md_codigo)) as md_codigo,
                cidade, endereco, latitude, longitude, tipo_ponto, cep, horario_trabalho, nome_ponto
            FROM malha_coordenadas
        """)).fetchall()
        malha_map = {
            r[0]: {
                "cidade": r[1] or "Não Informada",
                "endereco": r[2] or "",
                "latitude": r[3],
                "longitude": r[4],
                "tipo_ponto": r[5] or "",
                "cep": r[6] or "",
                "horario_trabalho": r[7] or "",
                "nome_ponto": r[8]
            } for r in rows_malha if r[0]
        }

        # Overrides manuais salvos pelo Mapa
        ov_map = {}
        try:
            rows_ov = db.execute(text("SELECT UPPER(TRIM(ponto_codigo)), UPPER(TRIM(tipo)) FROM ponto_classificacao_override")).fetchall()
            for rc, rt in rows_ov:
                if rc:
                    if rt == "HUB": ov_map[rc] = "HUB"
                    elif rt in ("PONTO_APOIO", "PONTO DE APOIO"): ov_map[rc] = "PONTO DE APOIO"
                    elif rt in ("PONTO_REDE", "PONTO DE REDE"): ov_map[rc] = "PONTO DE REDE"
                    elif rt in ("MD", "MINIDROP"): ov_map[rc] = "MINIDROP"
        except Exception:
            pass
        
        rows_m = db.execute(text("""
            SELECT id, md_codigo, estado, regional, ativo, tipo_ponto
            FROM md_mapping
            ORDER BY md_codigo;
        """)).fetchall()
        
        resultado = []
        for r in rows_m:
            code = (r[1] or "").strip().upper()
            m_info = malha_map.get(code, {})
            lat = m_info.get("latitude")
            lng = m_info.get("longitude")
            raw_tipo = ov_map.get(code) or r[5] or m_info.get("tipo_ponto") or ""
            tipo_canon = _normalizar_categoria_malha(code, raw_tipo)
            resultado.append({
                "id": r[0],
                "md_codigo": r[1],
                "estado": r[2] or "SP",
                "regional": r[3] or "SP",
                "ativo": r[4],
                "cidade": m_info.get("cidade", "Não Informada"),
                "endereco": m_info.get("endereco", ""),
                "latitude": lat,
                "longitude": lng,
                "tipo_ponto": tipo_canon,
                "cep": m_info.get("cep", ""),
                "horario_trabalho": m_info.get("horario_trabalho", ""),
                "nome_ponto": m_info.get("nome_ponto") or r[1],
                "tem_coordenadas": lat is not None and lng is not None
            })
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/md-mapping")
def criar_md_mapping(body: MDMappingCreate, db: Session = Depends(get_db)):
    """Cria um novo mapeamento de MD/HUB/Galpão e sincroniza no mapa."""
    try:
        md_clean = body.md_codigo.strip().upper()
        existing = db.execute(text("SELECT id FROM md_mapping WHERE md_codigo = :cid"), {"cid": md_clean}).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"Código '{md_clean}' já existe.")
        
        cidade_clean = (body.cidade or "").strip().title() or "Não Informada"
        estado_clean = body.estado.strip().upper()[:2]
        regional_clean = body.regional.strip().upper()
        tipo_clean = _normalizar_categoria_malha(body.md_codigo if hasattr(body, "md_codigo") else md_clean, body.tipo_ponto or "")
        nome_clean = (body.nome_ponto or "").strip() or md_clean
        cep_clean = (body.cep or "").strip() or None
        horario_clean = (body.horario_trabalho or "").strip() or None
        end_clean = body.endereco.strip() if body.endereco else None
        lat = body.latitude
        lng = body.longitude

        db.execute(
            text("INSERT INTO md_mapping (md_codigo, estado, regional, tipo_ponto, ativo) VALUES (:cid, :est, :reg, :tipo, :ativo)"),
            {"cid": md_clean, "est": estado_clean, "reg": regional_clean, "tipo": tipo_clean, "ativo": body.ativo}
        )

        # Sincroniza na tabela de coordenadas para o mapa interativo
        exists_malha = db.execute(text("SELECT COUNT(*) FROM malha_coordenadas WHERE UPPER(TRIM(md_codigo)) = :m"), {"m": md_clean}).scalar()
        if exists_malha and exists_malha > 0:
            db.execute(text("""
                UPDATE malha_coordenadas
                SET nome_ponto = :nm,
                    tipo_ponto = :tipo,
                    cidade = COALESCE(:c, cidade),
                    estado = :e,
                    regional = :r,
                    cep = COALESCE(:cep, cep),
                    endereco = COALESCE(:end, endereco),
                    horario_trabalho = COALESCE(:hor, horario_trabalho),
                    latitude = COALESCE(:lat, latitude),
                    longitude = COALESCE(:lng, longitude),
                    funcionando = 'ATIVADO'
                WHERE UPPER(TRIM(md_codigo)) = :m;
            """), {
                "nm": nome_clean, "tipo": tipo_clean, "c": cidade_clean, "e": estado_clean, "r": regional_clean,
                "cep": cep_clean, "end": end_clean, "hor": horario_clean, "lat": lat, "lng": lng, "m": md_clean
            })
        else:
            db.execute(text("""
                INSERT INTO malha_coordenadas (md_codigo, nome_ponto, tipo_ponto, cidade, estado, regional, cep, endereco, horario_trabalho, latitude, longitude, funcionando)
                VALUES (:m, :nm, :tipo, :c, :e, :r, :cep, :end, :hor, :lat, :lng, 'ATIVADO');
            """), {
                "m": md_clean, "nm": nome_clean, "tipo": tipo_clean, "c": cidade_clean, "e": estado_clean, "r": regional_clean,
                "cep": cep_clean, "end": end_clean or f"Cidade {cidade_clean}", "hor": horario_clean or "08:00 - 18:00", "lat": lat, "lng": lng
            })

        db.commit()
        _sincronizar_override_ponto(db, md_clean, tipo_clean)
        db.commit()
        return {"status": "success", "message": f"{tipo_clean} '{md_clean}' criado com sucesso e integrado ao mapa!"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/md-mapping/{mapping_id}")
def atualizar_md_mapping(mapping_id: int, body: MDMappingUpdate, db: Session = Depends(get_db)):
    """Atualiza estado, regional, tipo, cidade, lat/lng ou status ativo de um MD."""
    try:
        row = db.execute(text("SELECT md_codigo FROM md_mapping WHERE id = :mid"), {"mid": mapping_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mapeamento não encontrado.")
        
        md_clean = row[0]
        cidade_clean = (body.cidade or "").strip().title() if body.cidade else None
        estado_clean = body.estado.strip().upper()[:2]
        regional_clean = body.regional.strip().upper()
        tipo_clean = _normalizar_categoria_malha(body.md_codigo if hasattr(body, "md_codigo") else md_clean, body.tipo_ponto or "")
        nome_clean = (body.nome_ponto or "").strip() if body.nome_ponto else None
        cep_clean = (body.cep or "").strip() if body.cep else None
        horario_clean = (body.horario_trabalho or "").strip() if body.horario_trabalho else None
        end_clean = body.endereco.strip() if body.endereco else None
        lat = body.latitude
        lng = body.longitude

        db.execute(
            text("UPDATE md_mapping SET estado = :est, regional = :reg, tipo_ponto = :tipo, ativo = :ativo WHERE id = :mid"),
            {"est": estado_clean, "reg": regional_clean, "tipo": tipo_clean, "ativo": body.ativo, "mid": mapping_id}
        )

        # Sincroniza na tabela de coordenadas para o mapa interativo
        db.execute(text("""
            UPDATE malha_coordenadas
            SET nome_ponto = COALESCE(:nm, nome_ponto),
                tipo_ponto = :tipo,
                cidade = COALESCE(:c, cidade),
                estado = :e,
                regional = :r,
                cep = COALESCE(:cep, cep),
                endereco = COALESCE(:end, endereco),
                horario_trabalho = COALESCE(:hor, horario_trabalho),
                latitude = COALESCE(:lat, latitude),
                longitude = COALESCE(:lng, longitude)
            WHERE UPPER(TRIM(md_codigo)) = :m;
        """), {
            "nm": nome_clean, "tipo": tipo_clean, "c": cidade_clean, "e": estado_clean, "r": regional_clean,
            "cep": cep_clean, "end": end_clean, "hor": horario_clean, "lat": lat, "lng": lng, "m": md_clean
        })

        db.commit()
        _sincronizar_override_ponto(db, md_clean, tipo_clean)
        db.commit()
        return {"status": "success", "message": f"{tipo_clean} '{md_clean}' atualizado e sincronizado no mapa!"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/md-mapping/{mapping_id}")
def deletar_md_mapping(mapping_id: int, db: Session = Depends(get_db)):
    """Remove um mapeamento de MD."""
    try:
        row = db.execute(text("SELECT id FROM md_mapping WHERE id = :mid"), {"mid": mapping_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mapeamento não encontrado.")
        db.execute(text("DELETE FROM md_mapping WHERE id = :mid"), {"mid": mapping_id})
        db.commit()
        return {"status": "success", "message": "Mapeamento removido com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/md-mapping/importar")
def importar_md_mapping(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Importa lista de MDs a partir de um arquivo Excel (.xlsx, .xls)"""
    import pandas as pd
    import io
    try:
        contents = file.file.read()
        try:
            df = pd.read_excel(io.BytesIO(contents), engine='calamine')
        except Exception:
            df = pd.read_excel(io.BytesIO(contents))
            
        # Tenta achar as colunas (Ponto/MD, Estado/UF, Regional)
        colunas = [str(c).lower().strip() for c in df.columns]
        
        col_md = None
        col_estado = None
        col_regional = None
        
        for idx, c in enumerate(colunas):
            if 'ponto' in c or 'md' in c: col_md = df.columns[idx]
            if c in ['estado', 'uf']: col_estado = df.columns[idx]
            if 'regional' in c: col_regional = df.columns[idx]
            
        if not col_md or not col_regional:
            raise HTTPException(status_code=400, detail="A planilha precisa ter colunas para Ponto/MD e Regional.")
            
        inseridos = 0
        atualizados = 0
        
        for _, row in df.iterrows():
            md_val = str(row[col_md]).strip().upper()
            if not md_val or md_val == 'NAN': continue
            
            estado_val = str(row[col_estado]).strip().upper()[:2] if col_estado and pd.notna(row[col_estado]) else 'SP'
            regional_val = str(row[col_regional]).strip().upper() if pd.notna(row[col_regional]) else 'OUTROS'
            
            existing = db.execute(text("SELECT id FROM md_mapping WHERE md_codigo = :md"), {"md": md_val}).fetchone()
            if existing:
                db.execute(
                    text("UPDATE md_mapping SET estado = :est, regional = :reg, ativo = 1 WHERE md_codigo = :md"),
                    {"est": estado_val, "reg": regional_val, "md": md_val}
                )
                atualizados += 1
            else:
                db.execute(
                    text("INSERT INTO md_mapping (md_codigo, estado, regional, ativo) VALUES (:md, :est, :reg, 1)"),
                    {"md": md_val, "est": estado_val, "reg": regional_val}
                )
                inseridos += 1
                
        db.commit()
        return {"status": "success", "message": f"Importação concluída! {inseridos} novos MDs, {atualizados} atualizados."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar planilha: {str(e)}")


@router.post("/importar-hoje-incremental")
async def importar_hoje_incremental(
    data_operacao: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Ingestão operacional de hora em hora (D0).
    Atualiza incrementalmente o status de pedidos existentes e insere novos pedidos no dia (Upsert).
    """
    try:
        content = await file.read()
        import pandas as pd
        import io
        
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception:
            try:
                df = pd.read_csv(io.BytesIO(content))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo de planilha: {str(e)}")

        res = op_service.processar_ingestao_incremental_d0(db, df, data_operacao)
        return res
    except HTTPException as he: raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro na ingestão D0 incremental: {str(e)}")


@router.post("/zerar-base")
def post_zerar_base(
    current_admin: dict = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Zera a base de dados operacional para início de novo ciclo de alimentação (preserva Mapa de MDs e credenciais).
    """
    try:
        res = op_service.zerar_base_operacional(db)
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao zerar base operacional: {str(e)}")





