# -*- coding: utf-8 -*-
r"""
exportar_snapshot_online.py — Gerador de Snapshot Estático para o Dashboard Online (Vercel / Nuvem)
Extrai os indicadores já consolidados do banco SQLite local (torre_anjun.db) e grava pacotes JSON
otimizados em frontend/public/snapshot/ para carregamento instantâneo (< 0.5s) na nuvem.
"""

import sys
import os
import json
import time
import datetime
import subprocess
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
SNAPSHOT_DIR = ROOT_DIR / "frontend" / "public" / "snapshot"

sys.path.insert(0, str(BACKEND_DIR))

from fastapi.encoders import jsonable_encoder
from database.connection import SessionLocal
from routers.coletas import (
    get_dias_coletas,
    get_resumo_coletas,
    get_coletas_mds,
    get_coletas_sellers,
    get_coletas_horarios,
    get_coletas_no_dia,
    get_d2d_sp_analise,
)
from routers.implantacao import (
    get_cockpit_d1,
    get_stats,
    list_solicitacoes,
    get_relatorio_quarta,
    listar_classificacoes_pontos,
)


def salvar_json(nome_arquivo: str, dados: any):
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    caminho = SNAPSHOT_DIR / nome_arquivo
    serializado = jsonable_encoder(dados)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(serializado, f, ensure_ascii=False, separators=(",", ":"))
    return caminho.stat().st_size


def sincronizar_mapeamentos_banco(db):
    """Aplica automaticamente qualquer edição recente de cliente_mapping ou malha antes de exportar."""
    try:
        from sqlalchemy import text
        rows_cli = db.execute(text("SELECT cliente_id, nome_exibicao FROM cliente_mapping WHERE ativo = 1;")).fetchall()
        for cid, nome in rows_cli:
            if cid and nome:
                cid_str = str(cid).strip()
                nome_str = str(nome).strip()
                db.execute(
                    text("UPDATE criacao_pedidos_historico SET nome_cliente = :nome WHERE nome_cliente = :antigo;"),
                    {"nome": nome_str, "antigo": f"Cliente {cid_str}"},
                )
        db.commit()
    except Exception:
        db.rollback()


def gerar_snapshots(max_dias: int = 5) -> dict:
    t0 = time.time()
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    arquivos_gerados = 0
    bytes_totais = 0

    try:
        sincronizar_mapeamentos_banco(db)
        print("\n📸 [1/4] Extraindo calendário operacional do banco local...")
        info_dias = get_dias_coletas(db=db)
        todos_dias = info_dias.get("dias", [])
        dia_recente = info_dias.get("dia_recente") or (todos_dias[0] if todos_dias else "20/10/2026")

        # Mantemos no seletor online os dias exportados no snapshot para evitar 404 em datas muito antigas
        dias_exportar = todos_dias[:max_dias] if todos_dias else [dia_recente]
        info_dias_online = {
            "dias": dias_exportar,
            "dia_recente": dia_recente,
            "atualizado_em": datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "modo": "snapshot_online",
        }
        bytes_totais += salvar_json("dias.json", info_dias_online)
        arquivos_gerados += 1

        print(f"📊 [2/4] Exportando Central de Coletas, No Dia e D2D SP para {len(dias_exportar)} datas ({', '.join(dias_exportar)})...")
        for idx, d in enumerate(dias_exportar):
            safe_d = d.replace("/", "-")
            print(f"   -> Processando data {d} ({idx + 1}/{len(dias_exportar)})...")

            # 1. Resumo Coletas
            resumo = get_resumo_coletas(dia=d, cliente=None, regional=None, db=db)
            bytes_totais += salvar_json(f"resumo_{safe_d}.json", resumo)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("resumo_latest.json", resumo)

            # 2. Lista de MDs & HUBs
            mds = get_coletas_mds(dia=d, cliente=None, regional=None, search=None, filtro_tipo="todos", db=db)
            bytes_totais += salvar_json(f"mds_{safe_d}.json", mds)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("mds_latest.json", mds)

            hubs = get_coletas_mds(dia=d, cliente=None, regional=None, search=None, filtro_tipo="hubs", db=db)
            bytes_totais += salvar_json(f"hubs_{safe_d}.json", hubs)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("hubs_latest.json", hubs)

            # 3. Sellers (limite ampliado para alimentar drill-down por cliente online)
            sellers = get_coletas_sellers(dia=d, cliente=None, regional=None, search=None, limit=2000, db=db)
            bytes_totais += salvar_json(f"sellers_{safe_d}.json", sellers)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("sellers_latest.json", sellers)

            # 4. Horários
            horarios = get_coletas_horarios(dia=d, md=None, db=db)
            bytes_totais += salvar_json(f"horarios_{safe_d}.json", horarios)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("horarios_latest.json", horarios)

            # 5. No Dia (D0 / Tempo Real)
            no_dia = get_coletas_no_dia(
                dia=d, regional="TODOS", tipo_ponto="TODOS", status_filtro="TODOS", search=None, db=db
            )
            if "dropoffs_sem_md" in no_dia and isinstance(no_dia["dropoffs_sem_md"], list):
                no_dia["dropoffs_sem_md"] = no_dia["dropoffs_sem_md"][:400]
            bytes_totais += salvar_json(f"no_dia_{safe_d}.json", no_dia)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("no_dia_latest.json", no_dia)

            # 6. D2D SP (Diário)
            d2d_dia = get_d2d_sp_analise(periodo="DIA", dia=d, search=None, filtro_expansao="TODOS", db=db)
            if "candidatos_expansao" in d2d_dia and isinstance(d2d_dia["candidatos_expansao"], list):
                d2d_dia["candidatos_expansao"] = d2d_dia["candidatos_expansao"][:120]
            bytes_totais += salvar_json(f"d2d_sp_DIA_{safe_d}.json", d2d_dia)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("d2d_sp_DIA_latest.json", d2d_dia)

            # 7. Cockpit D-1 / Mapa da Malha (para as 3 datas mais recentes)
            if idx < 3:
                cockpit = get_cockpit_d1(dia=d, db=db)
                bytes_totais += salvar_json(f"cockpit_d1_{safe_d}.json", cockpit)
                arquivos_gerados += 1
                if idx == 0:
                    bytes_totais += salvar_json("cockpit_d1_latest.json", cockpit)

        print("🛣️ [3/4] Exportando visões agregadas Semanal e Mensal do D2D SP...")
        for per in ["SEMANA", "MES"]:
            d2d_per = get_d2d_sp_analise(periodo=per, dia=dia_recente, search=None, filtro_expansao="TODOS", db=db)
            if "candidatos_expansao" in d2d_per and isinstance(d2d_per["candidatos_expansao"], list):
                d2d_per["candidatos_expansao"] = d2d_per["candidatos_expansao"][:120]
            bytes_totais += salvar_json(f"d2d_sp_{per}_latest.json", d2d_per)
            arquivos_gerados += 1

        print("🚀 [4/4] Exportando dados de Implantação FM & Governança da Malha...")
        bytes_totais += salvar_json("implantacao_stats.json", get_stats(db=db))
        bytes_totais += salvar_json(
            "implantacao_solicitacoes.json", list_solicitacoes(status=None, search=None, db=db)
        )
        bytes_totais += salvar_json("implantacao_relatorio_quarta.json", get_relatorio_quarta(db=db))
        bytes_totais += salvar_json("implantacao_classificacoes.json", listar_classificacoes_pontos(db=db))
        arquivos_gerados += 4

    finally:
        db.close()

    mb_total = round(bytes_totais / (1024 * 1024), 2)
    tempo_s = round(time.time() - t0, 1)
    print(f"✅ Snapshot Online gerado com sucesso! ({arquivos_gerados} arquivos | {mb_total} MB | {tempo_s}s)")
    return {"arquivos": arquivos_gerados, "tamanho_mb": mb_total, "tempo_s": tempo_s}


def publicar_github():
    print("\n☁️ Enviando atualização do Snapshot para o GitHub / Vercel...")
    try:
        subprocess.run(["git", "add", "frontend/public/snapshot"], cwd=str(ROOT_DIR), check=True)
        status = subprocess.run(
            ["git", "status", "--porcelain", "frontend/public/snapshot"],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
        )
        if not status.stdout.strip():
            print("ℹ️ Os dados online já estão idênticos à última versão publicada.")
            return True

        dt_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
        subprocess.run(
            ["git", "commit", "-m", f"chore(snapshot): atualizacao operacional {dt_str}"],
            cwd=str(ROOT_DIR),
            check=True,
        )
        subprocess.run(["git", "push", "origin", "main"], cwd=str(ROOT_DIR), check=True)
        print("🎉 Dashboard Online sincronizado com sucesso na nuvem!")
        return True
    except Exception as e:
        print(f"⚠️ Aviso ao sincronizar com GitHub: {e}")
        return False


if __name__ == "__main__":
    gerar_snapshots(max_dias=5)
    if "--push" in sys.argv:
        publicar_github()
