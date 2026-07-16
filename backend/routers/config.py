import os
import shutil
import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from routers.auth import get_current_admin

from database.connection import get_db, engine
from services import operacional as op_service

router = APIRouter(
    prefix="/api/config", 
    tags=["Configurações"], 
    dependencies=[Depends(get_current_admin)]
)

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Banco de Dados", "torre_anjun.db"))

@router.get("/backup")
def get_backup():
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
async def post_restore(db_file: UploadFile = File(...)):
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

@router.post("/importar")
async def post_importar(
    data_operacao: str = Form(...),
    num_semana: str = Form(...),
    file_mds: UploadFile = File(...),
    file_operacional: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        file_mds_bytes = await file_mds.read()
        file_operacional_bytes = await file_operacional.read()
        
        res = op_service.processar_ingestao_planilhas(
            db=db,
            data_operacao=data_operacao,
            num_semana=num_semana,
            file_mds_bytes=file_mds_bytes,
            file_operacional_bytes=file_operacional_bytes
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/importar-coordenadas")
async def post_importar_coordenadas(
    file_coordenadas: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        content_bytes = await file_coordenadas.read()
        filename = file_coordenadas.filename or "coordenadas.csv"
        from services.geolocalizacao import processar_planilha_coordenadas
        res = processar_planilha_coordenadas(content_bytes, filename, db)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao importar arquivo de coordenadas: {e}")

from pydantic import BaseModel

class GeminiKeyPayload(BaseModel):
    key: str

@router.get("/gemini-key")
def get_gemini_key(db: Session = Depends(get_db)):
    try:
        db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
        db.commit()
        row = db.execute(text("SELECT valor FROM app_config WHERE chave = 'gemini_api_key';")).fetchone()
        if row and row[0]:
            k = row[0]
            masked = k[:6] + "..." + k[-4:] if len(k) > 10 else "configurada"
            return {"configured": True, "masked_key": masked}
        return {"configured": False, "masked_key": ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler chave de API do banco: {e}")

@router.post("/gemini-key")
def post_gemini_key(payload: GeminiKeyPayload, db: Session = Depends(get_db)):
    try:
        db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
        db.execute(
            text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('gemini_api_key', :key);"),
            {"key": payload.key.strip()}
        )
        db.commit()
        return {"status": "success", "message": "Chave de API do Gemini configurada com sucesso!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao gravar chave de API no banco: {e}")



