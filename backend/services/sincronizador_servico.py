# -*- coding: utf-8 -*-
r"""
sincronizador_servico.py — Motor Unificado dos 4 Fluxos de Sincronização Anjun
Implementa com resiliência de rede e gravação oficial em fechamento_diario_oficial:
  1. Tempo Real para Coleta (Bipagem Física Intraday)
  2. Tempo de Criação (Novos Pedidos do Dia)
  3. Fechamento Oficial do Dia Anterior (D-1) com Total Real
  4. Reconciliação Semanal / Histórica em Blocos de 7 dias (Circuito Fechado)
"""

import sys
import os
import json
import time
import sqlite3
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_DIR = Path(r"C:\ANJUN")
BACKEND_DIR = BASE_DIR / "backend"
DB_PATH = BASE_DIR / "Banco de Dados" / "torre_anjun.db"
CONFIG_PATH = BACKEND_DIR / "services" / "anjun_api_config.json"

DEFAULT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50U3RhdGUiOjEsImNwZiI6IjM2MC41MTUuNTU4LTg5IiwiaGFzQXVkaXQiOjAsImhhc1NlbnNpdGl2ZUluZm9QZXJtaXNzaW9uIjp0cnVlLCJpZCI6NjE2OCwiaXNBZG1pbiI6ZmFsc2UsImxvZ2luU291cmNlIjoibWFuYWdlbWVudFNpZGUiLCJvcmdJZCI6NzEsInBob25lIjoiMTE5ODQ3NTUxNzZcdCIsInBsYXRmb3JtQ29kZSI6IkJYIiwicmVhbE5hbWUiOiJEaWVnbyBkZSBTb3V6YSBNYW5kYXJpbm8iLCJzaXRlQ29kZSI6IkFOSlVOMSIsInNpdGVJZCI6OTAsInNpdGVOYW1lIjoiQU5KVU4iLCJzaXRlVXNlclR5cGUiOjQsInRva2VuVHlwZSI6InVzZXJMb2dpbiIsInVzZXJQcm9wZXJ0eSI6MSwidXNlclNvdXJjZSI6MSwidXNlcm5hbWUiOiJtYW5kYXJpbm8iLCJqdGkiOiJiOTVjYzBhNi0wY2FiLTQwZGEtYWE2YS0yNTMyNmU3MThjYzMiLCJpYXQiOjE3OTM3MDYwNTQsImV4cCI6MTc5NDEzODA1NH0.hRSrxiXCKLyFp1HHugCvPxPHg68JLtjRMha_QEQ1HEM"


def criar_sessao_http() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=[500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

HTTP_SESSION = criar_sessao_http()


def carregar_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "token": DEFAULT_TOKEN,
        "usuario": "mandarino",
        "api_base": "https://newmanage.anjunexpress.com/admin",
        "status_sync": {
            "tempo_real": {"ultimo_sucesso": None, "total_processado": 0, "status": "pendente"},
            "criacao": {"ultimo_sucesso": None, "total_processado": 0, "status": "pendente"},
            "dia_anterior": {"ultimo_sucesso": None, "total_processado": 0, "status": "pendente"},
            "reconciliacao_semanal": {"ultimo_sucesso": None, "total_processado": 0, "status": "pendente"}
        }
    }


def salvar_config(cfg: Dict[str, Any]):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def obter_headers() -> Dict[str, str]:
    cfg = carregar_config()
    return {
        "token": cfg.get("token", DEFAULT_TOKEN),
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://manage.anjunexpress.com",
        "Referer": "https://manage.anjunexpress.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }


def inicializar_tabelas_sync():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    cursor = conn.cursor()

    # Tabela de fechamento diário oficial (armazena os números consolidados de cada dia)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fechamento_diario_oficial (
            data_operacao TEXT PRIMARY KEY,
            total_coletas_scan INTEGER NOT NULL DEFAULT 0,
            total_criacao INTEGER DEFAULT 0,
            total_carregado INTEGER DEFAULT 0,
            total_pendente INTEGER DEFAULT 0,
            taxa_carregamento REAL DEFAULT 0.0,
            taxa_pendente REAL DEFAULT 0.0,
            horario_fechamento TEXT NOT NULL,
            status TEXT DEFAULT 'OFICIAL'
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS snapshot_backlog_md (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            horario_captura TEXT NOT NULL,
            dia_base TEXT NOT NULL,
            total_coletas INTEGER DEFAULT 0,
            total_carregado INTEGER DEFAULT 0,
            taxa_carregamento REAL DEFAULT 0.0,
            total_pendente INTEGER DEFAULT 0,
            taxa_pendente REAL DEFAULT 0.0
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS log_sincronizacao_api (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            horario_execucao TEXT NOT NULL,
            modo TEXT NOT NULL,
            periodo TEXT NOT NULL,
            total_registros INTEGER DEFAULT 0,
            status TEXT NOT NULL,
            mensagem TEXT
        );
    """)

    # Garantir índice no pedido_coleta
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_op_comp_ped ON operacional_pedidos_completo (pedido_coleta);")

    conn.commit()
    conn.close()


def salvar_fechamento_oficial(data_op: str, total_scan: int, total_criacao: int, snap: Optional[Dict[str, Any]] = None):
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    cursor = conn.cursor()

    carregado = snap.get("collectLoadTotalNum", 0) if snap else 0
    pendente = snap.get("pendingLoadTotalNum", 0) if snap else 0
    tx_carregado = snap.get("collectLoadRate", 0.0) if snap else 0.0
    tx_pendente = snap.get("pendingLoadRate", 0.0) if snap else 0.0
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO fechamento_diario_oficial (
            data_operacao, total_coletas_scan, total_criacao, total_carregado,
            total_pendente, taxa_carregamento, taxa_pendente, horario_fechamento, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OFICIAL')
        ON CONFLICT(data_operacao) DO UPDATE SET
            total_coletas_scan = excluded.total_coletas_scan,
            total_criacao = excluded.total_criacao,
            total_carregado = excluded.total_carregado,
            total_pendente = excluded.total_pendente,
            taxa_carregamento = excluded.taxa_carregamento,
            taxa_pendente = excluded.taxa_pendente,
            horario_fechamento = excluded.horario_fechamento,
            status = 'OFICIAL';
    """, (data_op, total_scan, total_criacao, carregado, pendente, tx_carregado, tx_pendente, now_str))

    conn.commit()
    conn.close()


def salvar_lote_operacional(records: List[Dict[str, Any]]) -> int:
    if not records:
        return 0

    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    cursor = conn.cursor()

    insert_sql = """
    INSERT INTO operacional_pedidos_completo (
        dia_base, semana_base, pedido_coleta, codigo_barras, pedido_cliente, numero_cliente,
        tempo_criacao, tempo_coleta, data_conclusao, status_pedido, ponto_colecao,
        colector, carregadeira, tempo_carregamento, merchant_id, merchant_nome,
        remetente_nome, remetente_tel, remetente_email, remetente_cep, remetente_uf,
        remetente_cidade, remetente_endereco, destinatario_nome, destinatario_cep,
        destinatario_uf, destinatario_cidade, plataforma, tipo_pedido, peso_kg, valor_declarado
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    );
    """

    update_sql = """
    UPDATE operacional_pedidos_completo
    SET status_pedido = ?,
        tempo_coleta = COALESCE(?, tempo_coleta),
        data_conclusao = COALESCE(?, data_conclusao),
        tempo_carregamento = COALESCE(?, tempo_carregamento)
    WHERE pedido_coleta = ?;
    """

    linhas_inserir = []
    total_processados = 0

    for r in records:
        order_num = str(r.get("orderNumber") or "").strip()
        if not order_num:
            continue

        status_nome = r.get("collectStatusName") or "Indefinido"
        s_time = r.get("scanTime") or None
        close_time = r.get("closeTime") or None
        batch_time = r.get("batchNoTime") or None

        cursor.execute(update_sql, (status_nome, s_time, close_time, batch_time, order_num))
        if cursor.rowcount > 0:
            total_processados += 1
            continue

        c_time = r.get("createTime") or ""
        s_time_val = s_time or ""
        data_ref_iso = s_time_val[:10] if s_time_val else (c_time[:10] if c_time else datetime.date.today().strftime("%Y-%m-%d"))
        try:
            dt = datetime.datetime.strptime(data_ref_iso, "%Y-%m-%d")
            dia_base_br = dt.strftime("%d/%m/%Y")
            semana = f"Semana {dt.isocalendar()[1]}/{dt.year}"
        except Exception:
            dia_base_br = data_ref_iso
            semana = "Semana Indefinida"

        linhas_inserir.append((
            dia_base_br,
            semana,
            order_num,
            r.get("scanNumber") or r.get("packageNumber") or order_num,
            r.get("customerNumber") or "",
            r.get("customerId") or "",
            c_time,
            s_time_val,
            close_time or "",
            status_nome,
            r.get("siteName") or "",
            r.get("collectMan") or "",
            r.get("driverName") or "",
            batch_time or "",
            str(r.get("merchantCode") or ""),
            r.get("merchantName") or "",
            r.get("senderName") or "",
            r.get("senderPhone") or "",
            r.get("senderEmail") or "",
            r.get("senderZipCode") or "",
            r.get("senderState") or "",
            r.get("senderCity") or "",
            r.get("senderAddress") or "",
            r.get("receiverName") or "",
            r.get("receiverZipCode") or "",
            r.get("receiveState") or "",
            r.get("receiveCity") or "",
            r.get("platform") or "",
            r.get("orderTypeName") or "Normal",
            float(r.get("weight") or 0.0),
            float(r.get("declaredValue") or 0.0)
        ))

    if linhas_inserir:
        cursor.executemany(insert_sql, linhas_inserir)
        total_processados += len(linhas_inserir)

    conn.commit()
    conn.close()

    # Atualiza as tabelas agregadas usadas pelo Dashboard (criacao_pedidos_historico e detalhe_md_historico)
    dias_afetados = set(l[0] for l in linhas_inserir if l[0])
    for dia_item in dias_afetados:
        try:
            atualizar_tabelas_agregadas(dia_item)
        except Exception:
            pass

    return total_processados


def atualizar_tabelas_agregadas(dia_br: str):
    """Gera os agregados analíticos para criacao_pedidos_historico e detalhe_md_historico a partir de operacional_pedidos_completo."""
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    cursor = conn.cursor()

    # Mapeamento de clientes
    cursor.execute("SELECT cliente_id, nome_exibicao FROM cliente_mapping WHERE ativo = 1;")
    clientes_map = cursor.fetchall()
    case_clientes_lista = []
    for cid, nome in clientes_map:
        if cid and nome:
            cid_clean = str(cid).strip()
            nome_clean = str(nome).strip().replace("'", "''")
            case_clientes_lista.append(f"WHEN TRIM(numero_cliente) = '{cid_clean}' THEN '{nome_clean}'")

    if not case_clientes_lista:
        case_clientes_lista = [
            "WHEN TRIM(numero_cliente) = '24020' THEN 'szanjun'",
            "WHEN TRIM(numero_cliente) = '24323' THEN 'b4a serviços de tecnologia e comercio s. a.'"
        ]

    sql_case_clientes = "\n                ".join(case_clientes_lista)

    cursor.execute("DELETE FROM criacao_pedidos_historico WHERE dia_base = ?;", (dia_br,))
    cursor.execute(f"""
        INSERT INTO criacao_pedidos_historico (
            dia_base, semana_base, nome_cliente, merchant_id, merchant_nome,
            cep_remetente, estado, cidade, bairro, endereco_completo,
            maneira_coleta, ponto_colecao, tipo_pedido, status_pedido, total_pedidos
        )
        SELECT 
            dia_base, semana_base,
            CASE 
                {sql_case_clientes}
                WHEN LOWER(remetente_nome) LIKE '%shein%' OR LOWER(merchant_nome) LIKE '%shein%' THEN 'shein'
                WHEN LOWER(remetente_nome) LIKE '%temu%' OR LOWER(merchant_nome) LIKE '%temu%' THEN 'temud2d'
                WHEN LOWER(remetente_nome) LIKE '%kwai%' OR LOWER(merchant_nome) LIKE '%kwai%' THEN 'kwai'
                WHEN LOWER(remetente_nome) LIKE '%tiktok%' OR LOWER(merchant_nome) LIKE '%tiktok%' THEN 'tiktok logistics brazil ltda'
                WHEN numero_cliente IS NOT NULL AND TRIM(numero_cliente) != '' THEN 'Cliente ' || TRIM(numero_cliente)
                ELSE 'Outros'
            END as nome_cliente,
            merchant_id, merchant_nome, remetente_cep, remetente_uf, remetente_cidade,
            remetente_bairro, remetente_endereco, maneira_coleta, ponto_colecao,
            tipo_pedido, status_pedido, COUNT(*) as total_pedidos
        FROM operacional_pedidos_completo
        WHERE dia_base = ?
        GROUP BY 
            dia_base, semana_base, nome_cliente, merchant_id, merchant_nome,
            remetente_cep, remetente_uf, remetente_cidade, remetente_bairro, remetente_endereco,
            maneira_coleta, ponto_colecao, tipo_pedido, status_pedido;
    """, (dia_br,))

    cursor.execute("DELETE FROM detalhe_md_historico WHERE dia_base = ?;", (dia_br,))
    cursor.execute("""
        INSERT INTO detalhe_md_historico (
            dia_base, semana_base, md, regional, estado, total,
            backlog, carregamento, descarregamento, erros_md, taxa_coleta, cidade, divisao, nome_cliente
        )
        SELECT 
            dia_base, semana_base, ponto_colecao as md,
            COALESCE(remetente_uf, 'SP') as regional,
            COALESCE(remetente_uf, 'SP') as estado,
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'pendente', 'aguardando', 'no ponto', 'não coletado', 'problema') THEN 1 ELSE 0 END) as backlog,
            SUM(CASE WHEN LOWER(status_pedido) IN ('carregamento', 'circuito fechado') THEN 1 ELSE 0 END) as carregamento,
            SUM(CASE WHEN LOWER(status_pedido) IN ('descarregamento', 'circuito fechado') THEN 1 ELSE 0 END) as descarregamento,
            SUM(CASE WHEN LOWER(status_pedido) = 'problema' THEN 1 ELSE 0 END) as erros_md,
            ROUND((CAST(SUM(CASE WHEN LOWER(status_pedido) IN ('carregamento', 'descarregamento', 'circuito fechado') THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1)) * 100, 2) as taxa_coleta,
            COALESCE(remetente_cidade, '') as cidade,
            CASE WHEN (UPPER(ponto_colecao) LIKE '%-H%' OR UPPER(ponto_colecao) LIKE 'HUB%' OR UPPER(ponto_colecao) LIKE '%GLP%') THEN 'HUB' ELSE 'MD' END as divisao,
            '' as nome_cliente
        FROM operacional_pedidos_completo
        WHERE dia_base = ?
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'NAN', 'NONE', 'NULL', '-')
        GROUP BY dia_base, semana_base, ponto_colecao, remetente_uf, remetente_cidade;
    """, (dia_br,))

    conn.commit()
    conn.close()


def sincronizar_backlog_snapshot(data_ref: str) -> Optional[Dict[str, Any]]:
    cfg = carregar_config()
    headers = obter_headers()
    url = f"{cfg.get('api_base')}/collectMdStayReport/getMdStaySummaryData"

    try:
        resp = HTTP_SESSION.post(url, headers=headers, json={"startTime": data_ref, "endTime": data_ref}, timeout=15)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            if data:
                conn = sqlite3.connect(DB_PATH, timeout=30.0)
                cursor = conn.cursor()
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("""
                    INSERT INTO snapshot_backlog_md (
                        horario_captura, dia_base, total_coletas, total_carregado,
                        taxa_carregamento, total_pendente, taxa_pendente
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    now_str,
                    data_ref,
                    data.get("collectTotalNum", 0),
                    data.get("collectLoadTotalNum", 0),
                    data.get("collectLoadRate", 0.0),
                    data.get("pendingLoadTotalNum", 0),
                    data.get("pendingLoadRate", 0.0)
                ))
                conn.commit()
                conn.close()
                return data
    except Exception as e:
        print(f"[AVISO] Falha ao capturar snapshot de backlog: {e}")
    return None


def obter_total_api(data_ref: str, modo: str = "tempo_real") -> int:
    """Consulta rápida em 0.5s para capturar o número total exato de pedidos na Anjun."""
    cfg = carregar_config()
    headers = obter_headers()
    url = f"{cfg.get('api_base')}/collectOrder/page"

    params = {"pageNumber": 1, "pageSize": 1, "params": {}}
    if modo == "tempo_real":
        params["params"]["scanStartTime"] = f"{data_ref} 00:00:00"
        params["params"]["scanEndTime"] = f"{data_ref} 23:59:59"
    else:
        params["params"]["createStartTime"] = f"{data_ref} 00:00:00"
        params["params"]["createEndTime"] = f"{data_ref} 23:59:59"

    try:
        r = HTTP_SESSION.post(url, headers=headers, json=params, timeout=15).json()
        return r.get("data", {}).get("total", 0)
    except Exception:
        return 0


def motor_tempo_real_hoje(max_paginas: int = 50) -> Dict[str, Any]:
    hoje = datetime.date.today().strftime("%Y-%m-%d")
    snap = sincronizar_backlog_snapshot(hoje)
    total_oficial_scan = obter_total_api(hoje, modo="tempo_real")
    total_oficial_criacao = obter_total_api(hoje, modo="criacao")

    # Salva os totais consolidados oficiais de hoje no banco
    salvar_fechamento_oficial(hoje, total_oficial_scan, total_oficial_criacao, snap)

    cfg = carregar_config()
    headers = obter_headers()
    url = f"{cfg.get('api_base')}/collectOrder/page"

    params = {
        "pageNumber": 1,
        "pageSize": 500, # 500 por requisição
        "params": {
            "scanStartTime": f"{hoje} 00:00:00",
            "scanEndTime": f"{hoje} 23:59:59"
        }
    }

    total_salvo = 0
    pagina = 1

    while pagina <= max_paginas:
        params["pageNumber"] = pagina
        try:
            resp = HTTP_SESSION.post(url, headers=headers, json=params, timeout=25)
            if resp.status_code != 200:
                break
            d = resp.json().get("data", {})
            recs = d.get("records", [])
            if not recs:
                break

            salvos = salvar_lote_operacional(recs)
            total_salvo += salvos

            if len(recs) < params["pageSize"]:
                break
            pagina += 1
            time.sleep(0.05)
        except Exception as e:
            print(f"[ERRO tempo_real] pág {pagina}: {e}")
            break

    agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cfg["status_sync"]["tempo_real"] = {
        "ultimo_sucesso": agora,
        "total_oficial": total_oficial_scan,
        "amostra_salva": total_salvo,
        "status": "concluido"
    }
    salvar_config(cfg)

    return {
        "motor": "tempo_real",
        "data": hoje,
        "total_oficial": total_oficial_scan,
        "amostra_salva": total_salvo,
        "horario": agora
    }


def motor_criacao_hoje(max_paginas: int = 50) -> Dict[str, Any]:
    hoje = datetime.date.today().strftime("%Y-%m-%d")
    total_oficial_criacao = obter_total_api(hoje, modo="criacao")

    cfg = carregar_config()
    headers = obter_headers()
    url = f"{cfg.get('api_base')}/collectOrder/page"

    params = {
        "pageNumber": 1,
        "pageSize": 500,
        "params": {
            "createStartTime": f"{hoje} 00:00:00",
            "createEndTime": f"{hoje} 23:59:59"
        }
    }

    total_salvo = 0
    pagina = 1

    while pagina <= max_paginas:
        params["pageNumber"] = pagina
        try:
            resp = HTTP_SESSION.post(url, headers=headers, json=params, timeout=25)
            if resp.status_code != 200:
                break
            d = resp.json().get("data", {})
            recs = d.get("records", [])
            if not recs:
                break

            salvos = salvar_lote_operacional(recs)
            total_salvo += salvos

            if len(recs) < params["pageSize"]:
                break
            pagina += 1
            time.sleep(0.05)
        except Exception as e:
            print(f"[ERRO criacao] pág {pagina}: {e}")
            break

    agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cfg["status_sync"]["criacao"] = {
        "ultimo_sucesso": agora,
        "total_oficial": total_oficial_criacao,
        "amostra_salva": total_salvo,
        "status": "concluido"
    }
    salvar_config(cfg)

    return {
        "motor": "criacao",
        "data": hoje,
        "total_oficial": total_oficial_criacao,
        "amostra_salva": total_salvo,
        "horario": agora
    }


def motor_fechamento_d1(max_paginas: int = 50) -> Dict[str, Any]:
    ontem = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    snap = sincronizar_backlog_snapshot(ontem)
    total_oficial_scan = obter_total_api(ontem, modo="tempo_real")
    total_oficial_criacao = obter_total_api(ontem, modo="criacao")

    # Grava o fechamento oficial definitivo no banco
    salvar_fechamento_oficial(ontem, total_oficial_scan, total_oficial_criacao, snap)

    cfg = carregar_config()
    headers = obter_headers()
    url = f"{cfg.get('api_base')}/collectOrder/page"

    params = {
        "pageNumber": 1,
        "pageSize": 500,
        "params": {
            "scanStartTime": f"{ontem} 00:00:00",
            "scanEndTime": f"{ontem} 23:59:59"
        }
    }

    total_salvo = 0
    pagina = 1

    while pagina <= max_paginas:
        params["pageNumber"] = pagina
        try:
            resp = HTTP_SESSION.post(url, headers=headers, json=params, timeout=25)
            if resp.status_code != 200:
                break
            d = resp.json().get("data", {})
            recs = d.get("records", [])
            if not recs:
                break

            salvos = salvar_lote_operacional(recs)
            total_salvo += salvos

            if len(recs) < params["pageSize"]:
                break
            pagina += 1
            time.sleep(0.05)
        except Exception as e:
            print(f"[ERRO d1] pág {pagina}: {e}")
            break

    agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cfg["status_sync"]["dia_anterior"] = {
        "ultimo_sucesso": agora,
        "data_fechada": ontem,
        "total_oficial": total_oficial_scan,
        "amostra_salva": total_salvo,
        "status": "concluido"
    }
    salvar_config(cfg)

    return {
        "motor": "dia_anterior",
        "data": ontem,
        "total_oficial": total_oficial_scan,
        "amostra_salva": total_salvo,
        "horario": agora
    }


def motor_reconciliacao_semanal(dias_atras: int = 14) -> Dict[str, Any]:
    cfg = carregar_config()
    headers = obter_headers()
    url = f"{cfg.get('api_base')}/collectOrder/page"

    hoje = datetime.date.today()
    total_geral_atualizado = 0
    blocos = []

    data_fim = hoje
    while dias_atras > 0:
        passo = min(dias_atras, 7)
        data_ini = data_fim - datetime.timedelta(days=passo)
        blocos.append((data_ini.strftime("%Y-%m-%d"), data_fim.strftime("%Y-%m-%d")))
        data_fim = data_ini - datetime.timedelta(days=1)
        dias_atras -= (passo + 1)

    for ini_str, fim_str in blocos:
        pagina = 1
        params = {
            "pageNumber": 1,
            "pageSize": 500,
            "params": {
                "scanStartTime": f"{ini_str} 00:00:00",
                "scanEndTime": f"{fim_str} 23:59:59"
            }
        }
        while pagina <= 20: # Amostra de reconciliação
            params["pageNumber"] = pagina
            try:
                resp = HTTP_SESSION.post(url, headers=headers, json=params, timeout=25)
                if resp.status_code != 200:
                    break
                d = resp.json().get("data", {})
                recs = d.get("records", [])
                if not recs:
                    break

                salvos = salvar_lote_operacional(recs)
                total_geral_atualizado += salvos

                if len(recs) < params["pageSize"]:
                    break
                pagina += 1
                time.sleep(0.05)
            except Exception as e:
                break

    agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cfg["status_sync"]["reconciliacao_semanal"] = {
        "ultimo_sucesso": agora,
        "total_processado": total_geral_atualizado,
        "status": "concluido"
    }
    salvar_config(cfg)

    return {
        "motor": "reconciliacao_semanal",
        "blocos": blocos,
        "total_processado": total_geral_atualizado,
        "horario": agora
    }


try:
    inicializar_tabelas_sync()
except Exception as e:
    print(f"[AVISO] Falha ao inicializar tabelas sync: {e}")
