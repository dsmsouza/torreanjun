# -*- coding: utf-8 -*-
r"""
exportar_snapshot_online.py — Gerador de Snapshot Estático para o Dashboard Online (Vercel / Nuvem)
Extrai os indicadores já consolidados do banco SQLite local (torre_anjun.db) e grava pacotes JSON
otimizados em frontend/public/snapshot/ para carregamento instantâneo (< 0.5s) na nuvem.
Agora exporta TODO o histórico Diário e Mensal do banco de dados de forma incremental e ultra rápida.
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

from sqlalchemy import text
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
    construir_indice_eventos_malha,
)
from services.reconciliacao_pacotes import construir_painel_atualizacoes_e_aging
from routers.implantacao import (
    get_cockpit_d1,
    get_stats,
    list_solicitacoes,
    get_relatorio_quarta,
    listar_classificacoes_pontos,
)


def salvar_json(nome_arquivo: str, dados: any) -> int:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    caminho = SNAPSHOT_DIR / nome_arquivo
    serializado = jsonable_encoder(dados)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(serializado, f, ensure_ascii=False, separators=(",", ":"))
    return caminho.stat().st_size


def sincronizar_mapeamentos_banco(db):
    """Aplica automaticamente qualquer edição recente de cliente_mapping ou malha antes de exportar."""
    try:
        rows_cli = db.execute(text("SELECT cliente_id, nome_exibicao FROM cliente_mapping WHERE ativo = 1;")).fetchall()
        for cid, nome in rows_cli:
            if cid and nome:
                cid_str = str(cid).strip()
                nome_str = str(nome).strip()
                for tbl in ["criacao_pedidos_historico", "detalhe_cliente_historico", "detalhe_cliente_md_historico"]:
                    try:
                        db.execute(
                            text(f"UPDATE {tbl} SET nome_cliente = :nome WHERE nome_cliente IN (:antigo1, :antigo2);"),
                            {"nome": nome_str, "antigo1": f"Cliente {cid_str}", "antigo2": cid_str},
                        )
                    except Exception:
                        pass
        normalizacoes = [
            ("Shein", ["shein", "SHEIN"]),
            ("Shein D2D", ["sheind2d", "shein d2d", "SHEIND2D"]),
            ("Kwai", ["kwai", "KWAI"]),
            ("tiktok", ["tiktok logistics brazil ltda", "TIKTOK LOGISTICS BRAZIL LTDA", "TikTok"]),
            ("szanjun(internacional)", ["szanjun", "SZANJUN"]),
        ]
        for canonic, variantes in normalizacoes:
            for v in variantes:
                db.execute(
                    text("UPDATE criacao_pedidos_historico SET nome_cliente = :c WHERE nome_cliente = :v;"),
                    {"c": canonic, "v": v},
                )
        db.commit()
    except Exception:
        db.rollback()


def _arquivos_data_existem(safe_d: str) -> tuple[bool, int]:
    nomes = [
        f"resumo_{safe_d}.json",
        f"mds_{safe_d}.json",
        f"hubs_{safe_d}.json",
        f"sellers_{safe_d}.json",
        f"horarios_{safe_d}.json",
        f"no_dia_{safe_d}.json",
        f"d2d_sp_DIA_{safe_d}.json",
    ]
    total_bytes = 0
    for n in nomes:
        p = SNAPSHOT_DIR / n
        if not p.exists() or p.stat().st_size == 0:
            return False, 0
        total_bytes += p.stat().st_size
    return True, total_bytes


def gerar_snapshots(max_dias: int = 200, force_all: bool = False) -> dict:
    t0 = time.time()
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    arquivos_gerados = 0
    arquivos_reutilizados = 0
    bytes_totais = 0

    try:
        sincronizar_mapeamentos_banco(db)
        print("\n📸 [1/5] Extraindo calendário operacional completo (Diário e Mensal) do banco local...")
        info_dias = get_dias_coletas(db=db)
        todos_dias = info_dias.get("dias", [])
        meses_disp = info_dias.get("meses", [])
        dia_recente = info_dias.get("dia_recente") or (todos_dias[0] if todos_dias else "21/10/2026")

        rows_ped = db.execute(
            text("SELECT DISTINCT dia_base FROM criacao_pedidos_historico WHERE dia_base IS NOT NULL AND dia_base != '';")
        ).fetchall()
        dias_com_pedidos_set = {r[0] for r in rows_ped if r[0]}

        dias_exportar = todos_dias[:max_dias] if todos_dias else [dia_recente]
        info_dias_online = {
            "dias": todos_dias,
            "meses": meses_disp,
            "dia_recente": dia_recente,
            "atualizado_em": datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            "modo": "snapshot_online",
        }
        bytes_totais += salvar_json("dias.json", info_dias_online)
        arquivos_gerados += 1

        print(f"📊 [2/5] Exportando histórico Diário ({len(dias_exportar)} datas)...")
        for idx, d in enumerate(dias_exportar):
            safe_d = d.replace("/", "-")
            tem_pedidos = d in dias_com_pedidos_set

            if not force_all and idx >= 2:
                existe, b_exist = _arquivos_data_existem(safe_d)
                if existe:
                    p_res = SNAPSHOT_DIR / f"resumo_{safe_d}.json"
                    precisa_resumo = True
                    try:
                        if p_res.exists() and '"macro_regioes"' in p_res.read_text(encoding="utf-8"):
                            precisa_resumo = False
                    except Exception:
                        pass
                    if precisa_resumo:
                        resumo = get_resumo_coletas(dia=d, cliente=None, regional=None, db=db)
                        salvar_json(f"resumo_{safe_d}.json", resumo)
                        arquivos_gerados += 1
                    bytes_totais += b_exist
                    arquivos_reutilizados += 7
                    continue

            print(f"   -> Processando data {d} ({idx + 1}/{len(dias_exportar)}) [{'Completa' if tem_pedidos else 'Histórico MD'}]...")

            resumo = get_resumo_coletas(dia=d, cliente=None, regional=None, db=db)
            bytes_totais += salvar_json(f"resumo_{safe_d}.json", resumo)
            arquivos_gerados += 1
            if idx == 0:
                bytes_totais += salvar_json("resumo_latest.json", resumo)

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

            if tem_pedidos:
                lim_sellers = 2000 if idx < 5 else 800
                sellers = get_coletas_sellers(dia=d, cliente=None, regional=None, search=None, limit=lim_sellers, db=db)
                bytes_totais += salvar_json(f"sellers_{safe_d}.json", sellers)
                arquivos_gerados += 1
                if idx == 0:
                    bytes_totais += salvar_json("sellers_latest.json", sellers)

                horarios = get_coletas_horarios(dia=d, md=None, db=db)
                bytes_totais += salvar_json(f"horarios_{safe_d}.json", horarios)
                arquivos_gerados += 1
                if idx == 0:
                    bytes_totais += salvar_json("horarios_latest.json", horarios)

                no_dia = get_coletas_no_dia(
                    dia=d, regional="TODOS", tipo_ponto="TODOS", status_filtro="TODOS", search=None, db=db
                )
                lim_drop = 400 if idx < 3 else 150
                if "dropoffs_sem_md" in no_dia and isinstance(no_dia["dropoffs_sem_md"], list):
                    no_dia["dropoffs_sem_md"] = no_dia["dropoffs_sem_md"][:lim_drop]
                bytes_totais += salvar_json(f"no_dia_{safe_d}.json", no_dia)
                arquivos_gerados += 1
                if idx == 0:
                    bytes_totais += salvar_json("no_dia_latest.json", no_dia)

                d2d_dia = get_d2d_sp_analise(periodo="DIA", dia=d, search=None, filtro_expansao="TODOS", db=db)
                lim_cand = 120 if idx < 3 else 60
                if "candidatos_expansao" in d2d_dia and isinstance(d2d_dia["candidatos_expansao"], list):
                    d2d_dia["candidatos_expansao"] = d2d_dia["candidatos_expansao"][:lim_cand]
                bytes_totais += salvar_json(f"d2d_sp_DIA_{safe_d}.json", d2d_dia)
                arquivos_gerados += 1
                if idx == 0:
                    bytes_totais += salvar_json("d2d_sp_DIA_latest.json", d2d_dia)
            else:
                bytes_totais += salvar_json(f"sellers_{safe_d}.json", {"dia": d, "total_sellers": 0, "sellers": []})
                bytes_totais += salvar_json(
                    f"horarios_{safe_d}.json",
                    {"dia": d, "md_filtro": "TODOS", "pico_horario": "N/A", "pico_volume": 0, "distribuicao": []},
                )
                bytes_totais += salvar_json(
                    f"no_dia_{safe_d}.json",
                    {
                        "dia": d,
                        "kpis": {
                            "total_pedidos": 0,
                            "total_coletado": 0,
                            "total_pendente": 0,
                            "taxa_conversao_geral": 0.0,
                            "pontos_ativos_hoje": 0,
                            "pontos_zerados_hoje": 0,
                            "pontos_criticos_backlog": 0,
                            "dropoff_sem_md_volume": 0,
                            "dropoff_sem_md_sellers": 0,
                        },
                        "alertas": [],
                        "curva_horaria": [],
                        "pontos": [],
                        "dropoffs_sem_md": [],
                    },
                )
                bytes_totais += salvar_json(
                    f"d2d_sp_DIA_{safe_d}.json",
                    {
                        "periodo": "DIA",
                        "dia_referencia": d,
                        "dias_considerados": [d],
                        "qtd_dias": 1,
                        "kpis": {},
                        "cidades": [],
                        "distritos": [],
                        "candidatos_expansao": [],
                        "sellers_d2d": [],
                        "mds_referencia": [],
                    },
                )
                arquivos_gerados += 4

            if idx < 3:
                cockpit = get_cockpit_d1(dia=d, db=db)
                bytes_totais += salvar_json(f"cockpit_d1_{safe_d}.json", cockpit)
                arquivos_gerados += 1
                if idx == 0:
                    bytes_totais += salvar_json("cockpit_d1_latest.json", cockpit)

        print(f"🗓️ [3/5] Exportando Visão Mensal Consolidada ({len(meses_disp)} meses: {', '.join(meses_disp)})...")
        for m_idx, mes_ano in enumerate(meses_disp):
            dia_mes = f"MES:{mes_ano}"
            safe_m = f"MES_{mes_ano.replace('/', '-')}"
            # Cache para meses passados já gerados (exceto o mês mais recente m_idx == 0)
            p_res_m = SNAPSHOT_DIR / f"resumo_{safe_m}.json"
            if not force_all and m_idx >= 1 and p_res_m.exists() and p_res_m.stat().st_size > 0:
                try:
                    if '"macro_regioes"' not in p_res_m.read_text(encoding="utf-8"):
                        res_m = get_resumo_coletas(dia=dia_mes, cliente=None, regional=None, db=db)
                        salvar_json(f"resumo_{safe_m}.json", res_m)
                        arquivos_gerados += 1
                except Exception:
                    pass
                arquivos_reutilizados += 5
                continue

            print(f"   -> Consolidando Mês {mes_ano}...")
            res_m = get_resumo_coletas(dia=dia_mes, cliente=None, regional=None, db=db)
            mds_m = get_coletas_mds(dia=dia_mes, cliente=None, regional=None, search=None, filtro_tipo="todos", db=db)
            hubs_m = get_coletas_mds(dia=dia_mes, cliente=None, regional=None, search=None, filtro_tipo="hubs", db=db)
            sel_m = get_coletas_sellers(dia=dia_mes, cliente=None, regional=None, search=None, limit=1500, db=db)
            hor_m = get_coletas_horarios(dia=dia_mes, md=None, db=db)

            bytes_totais += salvar_json(f"resumo_{safe_m}.json", res_m)
            bytes_totais += salvar_json(f"mds_{safe_m}.json", mds_m)
            bytes_totais += salvar_json(f"hubs_{safe_m}.json", hubs_m)
            bytes_totais += salvar_json(f"sellers_{safe_m}.json", sel_m)
            bytes_totais += salvar_json(f"horarios_{safe_m}.json", hor_m)
            arquivos_gerados += 5

        print("🛣️ [4/5] Exportando visões agregadas Semanal e Mensal do D2D SP...")
        for per in ["SEMANA", "MES"]:
            d2d_per = get_d2d_sp_analise(periodo=per, dia=dia_recente, search=None, filtro_expansao="TODOS", db=db)
            if "candidatos_expansao" in d2d_per and isinstance(d2d_per["candidatos_expansao"], list):
                d2d_per["candidatos_expansao"] = d2d_per["candidatos_expansao"][:120]
            bytes_totais += salvar_json(f"d2d_sp_{per}_latest.json", d2d_per)
            arquivos_gerados += 1

        print("🚀 [5/5] Exportando dados de Implantação FM, Linha do Tempo, Reconciliação & Governança da Malha...")
        bytes_totais += salvar_json("implantacao_stats.json", get_stats(db=db))
        bytes_totais += salvar_json(
            "implantacao_solicitacoes.json", list_solicitacoes(status=None, search=None, db=db)
        )
        bytes_totais += salvar_json("implantacao_relatorio_quarta.json", get_relatorio_quarta(db=db))
        bytes_totais += salvar_json("implantacao_classificacoes.json", listar_classificacoes_pontos(db=db))
        bytes_totais += salvar_json("eventos_malha.json", construir_indice_eventos_malha(db=db))
        bytes_totais += salvar_json("reconciliacao_pacotes.json", construir_painel_atualizacoes_e_aging(db=db))
        arquivos_gerados += 6

        print("🚚 [6/6] Exportando Inteligência de Saturação de Rotas & Cruzamento D-1...")
        try:
            from services.saturacao_rotas_service import calcular_saturacao_rotas
            dados_sat = calcular_saturacao_rotas()
            bytes_totais += salvar_json("rotas_saturacao.json", dados_sat)
            arquivos_gerados += 1
        except Exception as e_sat:
            print(f"⚠️ Erro ao exportar rotas_saturacao: {e_sat}")

    finally:
        db.close()

    mb_total = round(bytes_totais / (1024 * 1024), 2)
    tempo_s = round(time.time() - t0, 1)
    print(
        f"✅ Snapshot Online concluído! ({arquivos_gerados} gerados, {arquivos_reutilizados} em cache | {mb_total} MB | {tempo_s}s)"
    )
    return {
        "arquivos": arquivos_gerados,
        "reutilizados": arquivos_reutilizados,
        "tamanho_mb": mb_total,
        "tempo_s": tempo_s,
    }


def publicar_github() -> bool:
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
    force = "--force" in sys.argv
    gerar_snapshots(max_dias=200, force_all=force)
    if "--push" in sys.argv:
        publicar_github()
