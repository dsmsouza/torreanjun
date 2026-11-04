# -*- coding: utf-8 -*-
"""
sla_servico.py — Serviço Integrado de SLA, Aging e Monitoramento de Anomalias nos MDs.
Consolida métricas oficiais da Anjun API (Relatório de SLA de Coleta e Anomalias) com o banco local.
"""

import os
import sys
import json
import sqlite3
import datetime
import requests
from pathlib import Path
from typing import Dict, Any, List, Optional

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
CONFIG_PATH = SCRIPT_DIR / "anjun_api_config.json"
DB_PATH = Path(r"C:\ANJUN\Banco de Dados\torre_anjun.db")


def _obter_conexao():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _carregar_config():
    if not CONFIG_PATH.exists():
        return {}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def garantir_tabelas_sla(conn: sqlite3.Connection):
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS snapshot_sla_macro (
            dia_base TEXT PRIMARY KEY,
            total_pedidos INTEGER DEFAULT 0,
            entrega_d2d INTEGER DEFAULT 0,
            coleta_d2d INTEGER DEFAULT 0,
            circuito_fechado INTEGER DEFAULT 0,
            carregamento INTEGER DEFAULT 0,
            backlog_md INTEGER DEFAULT 0,
            nao_coletado INTEGER DEFAULT 0,
            problemas INTEGER DEFAULT 0,
            taxa_cumprimento REAL DEFAULT 0.0,
            sincronizado_em TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS snapshot_anomalias_md (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_base TEXT NOT NULL,
            md TEXT NOT NULL,
            regional TEXT DEFAULT '',
            cidade TEXT DEFAULT '',
            tipo_anomalia TEXT NOT NULL,
            gravidade TEXT DEFAULT 'ALERTA',
            total_afetado INTEGER DEFAULT 0,
            detalhe TEXT DEFAULT '',
            criado_em TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_anomalias_dia ON snapshot_anomalias_md(dia_base);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_anomalias_md ON snapshot_anomalias_md(md);")
    conn.commit()


def _converter_dia_para_iso(dia_br: str) -> str:
    # "03/11/2026" -> "2026-11-03"
    partes = dia_br.strip().split("/")
    if len(partes) == 3:
        return f"{partes[2]}-{partes[1]}-{partes[0]}"
    return dia_br


def sincronizar_sla_macro_api(dia_br: str, conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    """
    Consulta o endpoint oficial /collectOrderAgeing/queryAgeingPage da Anjun para capturar
    o volume macro do dia, a divisão de entrega/coleta D2D e o status de SLA.
    """
    cfg = _carregar_config()
    token = cfg.get("token")
    base_url = cfg.get("api_base", "https://newmanage.anjunexpress.com/admin")

    dia_iso = _converter_dia_para_iso(dia_br)
    start_time = f"{dia_iso} 00:00:00"
    end_time = f"{dia_iso} 23:59:59"

    resultado = {
        "dia_base": dia_br,
        "dia_iso": dia_iso,
        "total_pedidos": 0,
        "entrega_d2d": 0,
        "coleta_d2d": 0,
        "circuito_fechado": 0,
        "carregamento": 0,
        "backlog_md": 0,
        "nao_coletado": 0,
        "problemas": 0,
        "taxa_cumprimento": 0.0,
        "origem": "offline_cache"
    }

    if not token:
        return resultado

    headers = {
        "token": token,
        "Content-Type": "application/json;charset=UTF-8"
    }

    url = f"{base_url}/collectOrderAgeing/queryAgeingPage"

    try:
        # 1. Total Geral
        payload_geral = {
            "pageNumber": 1,
            "pageSize": 5,
            "params": {
                "scanStartTime": start_time,
                "scanEndTime": end_time,
                "collectStatusList": []
            }
        }
        r = requests.post(url, headers=headers, json=payload_geral, timeout=60)
        if r.status_code == 200:
            res_j = r.json()
            if res_j.get("code") == 200 and res_j.get("data"):
                resultado["total_pedidos"] = res_j["data"].get("total", 0)
                resultado["origem"] = "anjun_api"

        # 2. Tipos de Coleta (1 = Entrega D2D, 2 = Coleta D2D)
        for ct, campo in [(1, "entrega_d2d"), (2, "coleta_d2d")]:
            payload_tipo = {
                "pageNumber": 1,
                "pageSize": 1,
                "params": {
                    "scanStartTime": start_time,
                    "scanEndTime": end_time,
                    "customerCollectType": ct,
                    "collectStatusList": []
                }
            }
            try:
                r_ct = requests.post(url, headers=headers, json=payload_tipo, timeout=40)
                if r_ct.status_code == 200:
                    j_ct = r_ct.json()
                    resultado[campo] = j_ct.get("data", {}).get("total", 0)
            except Exception:
                pass

    except Exception as e:
        print(f"Aviso ao consultar API oficial de SLA ({dia_br}): {e}")


    # Salvar no SQLite local
    close_conn = False
    if conn is None:
        conn = _obter_conexao()
        close_conn = True

    try:
        garantir_tabelas_sla(conn)
        c = conn.cursor()

        # Buscar se temos status detalhados no operacional local
        c.execute("""
            SELECT status_pedido, COUNT(*) 
            FROM operacional_pedidos_completo 
            WHERE dia_base = ? 
            GROUP BY status_pedido;
        """, (dia_br,))
        rows_st = dict(c.fetchall())

        cf = rows_st.get("Circuito fechado", 0)
        carr = rows_st.get("Carregamento", 0)
        nc = rows_st.get("Não coletado", 0)
        prob = rows_st.get("Problema", 0)
        pend = rows_st.get("saco selado", 0) + rows_st.get("coletado", 0) + rows_st.get("Descarregamento", 0)

        # Se a API retornou total, atualizar; se não retornou mas temos no local, preencher
        total_final = resultado["total_pedidos"] or sum(rows_st.values())
        if total_final > 0 and cf > 0:
            resultado["taxa_cumprimento"] = round((cf / total_final) * 100, 2)
        else:
            resultado["taxa_cumprimento"] = 0.0

        resultado["circuito_fechado"] = cf
        resultado["carregamento"] = carr
        resultado["backlog_md"] = pend
        resultado["nao_coletado"] = nc
        resultado["problemas"] = prob

        c.execute("""
            INSERT INTO snapshot_sla_macro (
                dia_base, total_pedidos, entrega_d2d, coleta_d2d,
                circuito_fechado, carregamento, backlog_md, nao_coletado,
                problemas, taxa_cumprimento, sincronizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(dia_base) DO UPDATE SET
                total_pedidos = CASE WHEN excluded.total_pedidos > 0 THEN excluded.total_pedidos ELSE snapshot_sla_macro.total_pedidos END,
                entrega_d2d = CASE WHEN excluded.entrega_d2d > 0 THEN excluded.entrega_d2d ELSE snapshot_sla_macro.entrega_d2d END,
                coleta_d2d = CASE WHEN excluded.coleta_d2d > 0 THEN excluded.coleta_d2d ELSE snapshot_sla_macro.coleta_d2d END,
                circuito_fechado = excluded.circuito_fechado,
                carregamento = excluded.carregamento,
                backlog_md = excluded.backlog_md,
                nao_coletado = excluded.nao_coletado,
                problemas = excluded.problemas,
                taxa_cumprimento = excluded.taxa_cumprimento,
                sincronizado_em = CURRENT_TIMESTAMP;
        """, (
            dia_br,
            resultado["total_pedidos"],
            resultado["entrega_d2d"],
            resultado["coleta_d2d"],
            resultado["circuito_fechado"],
            resultado["carregamento"],
            resultado["backlog_md"],
            resultado["nao_coletado"],
            resultado["problemas"],
            resultado["taxa_cumprimento"]
        ))
        conn.commit()
    finally:
        if close_conn:
            conn.close()

    return resultado


def calcular_painel_sla_completo(dia_br: str, conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    """
    Retorna a visão consolidada de SLA, Aging da Operação e Anomalias dos MDs para a tela de monitoramento.
    """
    close_conn = False
    if conn is None:
        conn = _obter_conexao()
        close_conn = True

    try:
        garantir_tabelas_sla(conn)
        c = conn.cursor()

        # 1. Carregar macro do dia
        c.execute("SELECT * FROM snapshot_sla_macro WHERE dia_base = ?;", (dia_br,))
        macro_row = c.fetchone()
        
        if not macro_row:
            macro_data = sincronizar_sla_macro_api(dia_br, conn=conn)
        else:
            macro_data = dict(macro_row)

        total_pedidos = macro_data.get("total_pedidos", 0)
        circuito_fechado = macro_data.get("circuito_fechado", 0)
        carregamento = macro_data.get("carregamento", 0)
        backlog_md = macro_data.get("backlog_md", 0)
        nao_coletado = macro_data.get("nao_coletado", 0)
        problemas = macro_data.get("problemas", 0)
        entrega_d2d = macro_data.get("entrega_d2d", 0)
        coleta_d2d = macro_data.get("coleta_d2d", 0)

        # 2. Aging dos pedidos a partir de operacional_pedidos_completo
        # Faixas: < 24h, 24h-48h, 48h-72h, > 72h
        # Baseado em lead_time_perus_horas ou tempo_coleta vs data atual
        c.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN lead_time_perus_horas <= 24 OR lead_time_perus_horas IS NULL THEN 1 ELSE 0 END) as faixa_ate_24h,
                SUM(CASE WHEN lead_time_perus_horas > 24 AND lead_time_perus_horas <= 48 THEN 1 ELSE 0 END) as faixa_24_48h,
                SUM(CASE WHEN lead_time_perus_horas > 48 AND lead_time_perus_horas <= 72 THEN 1 ELSE 0 END) as faixa_48_72h,
                SUM(CASE WHEN lead_time_perus_horas > 72 THEN 1 ELSE 0 END) as faixa_acima_72h
            FROM operacional_pedidos_completo
            WHERE dia_base = ?;
        """, (dia_br,))
        row_aging = c.fetchone()
        
        faixa_24 = row_aging["faixa_ate_24h"] if row_aging else 0
        faixa_48 = row_aging["faixa_24_48h"] if row_aging else 0
        faixa_72 = row_aging["faixa_48_72h"] if row_aging else 0
        faixa_critica = row_aging["faixa_acima_72h"] if row_aging else 0

        # Se total_pedidos macro for muito maior que a amostra local, projetamos proporcionalmente o aging
        tot_amostra = (faixa_24 + faixa_48 + faixa_72 + faixa_critica) or 1
        fator = (total_pedidos / tot_amostra) if total_pedidos > tot_amostra else 1.0

        aging_projetado = {
            "faixa_ate_24h": int(faixa_24 * fator),
            "faixa_24_48h": int(faixa_48 * fator),
            "faixa_48_72h": int(faixa_72 * fator),
            "faixa_acima_72h": int(faixa_critica * fator),
            "pct_dentro_sla": round((faixa_24 / tot_amostra) * 100, 1) if tot_amostra > 0 else 92.5
        }

        # 3. Anomalias nos MDs (Pontos Críticos com backlog represado ou taxa de coleta deficiente)
        c.execute("""
            SELECT 
                md, 
                regional, 
                cidade, 
                total, 
                carregamento, 
                backlog, 
                erros_md, 
                taxa_coleta
            FROM detalhe_md_historico
            WHERE dia_base = ?
            ORDER BY backlog DESC, total DESC
            LIMIT 50;
        """, (dia_br,))
        rows_mds = c.fetchall()

        anomalias_detectadas = []
        mds_criticos = []

        for r in rows_mds:
            md_name = r["md"]
            reg = r["regional"] or "SP"
            cid = r["cidade"] or ""
            tot = r["total"] or 0
            carreg = r["carregamento"] or 0
            back = r["backlog"] or 0
            erros = r["erros_md"] or 0
            taxa = r["taxa_coleta"] or (round((carreg / tot) * 100, 1) if tot > 0 else 100.0)

            # Anomalia 1: Backlog represado alto (> 100 pacotes sem expedição)
            if back >= 80:
                grav = "CRITICO" if back >= 300 else "ALERTA"
                anomalias_detectadas.append({
                    "md": md_name,
                    "regional": reg,
                    "cidade": cid,
                    "tipo": "Backlog Represado no MD",
                    "gravidade": grav,
                    "volume_afetado": back,
                    "taxa_expedicao": f"{taxa}%",
                    "detalhe": f"{back} pacotes permaneceram no ponto sem carregamento no caminhão."
                })

            # Anomalia 2: Taxa de carregamento baixa (< 75%) com volume relevante
            elif tot >= 50 and taxa < 75.0:
                anomalias_detectadas.append({
                    "md": md_name,
                    "regional": reg,
                    "cidade": cid,
                    "tipo": "Baixa Taxa de Carregamento",
                    "gravidade": "ALERTA",
                    "volume_afetado": back,
                    "taxa_expedicao": f"{taxa}%",
                    "detalhe": f"Apenas {carreg} de {tot} pacotes foram carregados ({taxa}%)."
                })

            # Anomalia 3: Erros ou avarias reportadas
            if erros > 0:
                anomalias_detectadas.append({
                    "md": md_name,
                    "regional": reg,
                    "cidade": cid,
                    "tipo": "Ocorrência / Erro Reportado",
                    "gravidade": "CRITICO",
                    "volume_afetado": erros,
                    "taxa_expedicao": f"{taxa}%",
                    "detalhe": f"{erros} pacotes com apontamento de divergência ou erro físico no MD."
                })

            if back > 0 or taxa < 90.0:
                mds_criticos.append({
                    "md": md_name,
                    "regional": reg,
                    "cidade": cid,
                    "total": tot,
                    "carregamento": carreg,
                    "backlog": back,
                    "erros": erros,
                    "taxa_coleta": taxa
                })

        # 4. Pacotes em aberto com risco de estouro de SLA (amostra dos mais críticos)
        c.execute("""
            SELECT 
                codigo_barras, 
                ponto_colecao, 
                remetente_uf, 
                remetente_cidade, 
                merchant_nome, 
                tempo_coleta, 
                status_pedido,
                lead_time_perus_horas
            FROM operacional_pedidos_completo
            WHERE dia_base = ? 
              AND status_pedido NOT IN ('Circuito fechado', 'cancelado')
            ORDER BY lead_time_perus_horas DESC, tempo_coleta ASC
            LIMIT 200;
        """, (dia_br,))
        rows_pacotes = c.fetchall()

        pacotes_abertos = []
        for p in rows_pacotes:
            pacotes_abertos.append({
                "barcode": p["codigo_barras"],
                "md": p["ponto_colecao"] or "NÃO VINCULADO",
                "regional": p["remetente_uf"] or "SP",
                "cidade": p["remetente_cidade"] or "",
                "seller": p["merchant_nome"] or "",
                "status": p["status_pedido"],
                "data_hora": p["tempo_coleta"],
                "horas_parado": round(p["lead_time_perus_horas"] or 0, 1),
                "dias_parados": int((p["lead_time_perus_horas"] or 0) / 24)
            })

        return {
            "dia_base": dia_br,
            "resumo": {
                "total_pedidos": total_pedidos,
                "circuito_fechado": circuito_fechado,
                "em_transito": carregamento,
                "backlog_md": backlog_md,
                "nao_coletado": nao_coletado,
                "problemas": problemas,
                "entrega_d2d": entrega_d2d,
                "coleta_d2d": coleta_d2d,
                "taxa_cumprimento_sla": macro_data.get("taxa_cumprimento", 0.0),
            },
            "aging": aging_projetado,
            "anomalias": anomalias_detectadas[:30],
            "mds_criticos": mds_criticos[:25],
            "pacotes_abertos": pacotes_abertos,
            "total_anomalias": len(anomalias_detectadas),
            "atualizado_em": datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        }
    finally:
        if close_conn:
            conn.close()


if __name__ == "__main__":
    dia_teste = sys.argv[1] if len(sys.argv) > 1 else "03/11/2026"
    print(f"Testando consolidação de SLA e Anomalias para {dia_teste}...")
    painel = calcular_painel_sla_completo(dia_teste)
    print("\n--- RESUMO MACRO ---")
    print(json.dumps(painel["resumo"], indent=2, ensure_ascii=False))
    print("\n--- AGING PROJETADO ---")
    print(json.dumps(painel["aging"], indent=2, ensure_ascii=False))
    print(f"\n--- TOTAL DE ANOMALIAS DETECTADAS: {painel['total_anomalias']} ---")
    if painel["anomalias"]:
        print("Primeiras 3 anomalias:")
        print(json.dumps(painel["anomalias"][:3], indent=2, ensure_ascii=False))
