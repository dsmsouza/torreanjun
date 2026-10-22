import os
import re
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body, File, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session
from database.connection import get_db
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/coletas",
    tags=["Central de Coletas"]
)

class CadastrarPontoPayload(BaseModel):
    md_codigo: str
    nome_ponto: Optional[str] = None
    tipo_ponto: Optional[str] = "MD (Ponto de Coleta)"
    cep: Optional[str] = None
    endereco: Optional[str] = None
    horario_trabalho: Optional[str] = None
    cidade: str
    estado: str
    regional: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


def eh_md(codigo: str) -> bool:
    """Verifica se o ponto é uma unidade de coleta (MD, Ponto de Rede, Ponto de Apoio) e NÃO um HUB/Galpão de transferência."""
    if not codigo:
        return False
    c = str(codigo).strip().upper()
    if re.search(r"-[ZWA]-H|HUB-|-H\d{2,4}$", c) or c.startswith("HUB") or c.startswith("WR-GLP") or "GLP" in c or "GALPAO" in c:
        return False
    return True


def eh_cliente_marketplace(nome_cliente: str) -> bool:
    """Verifica se o cliente pertence aos 4 grandes Marketplaces (Shein, Temu, TikTok, Kwai)."""
    if not nome_cliente:
        return False
    n = str(nome_cliente).strip().lower()
    return any(k in n for k in ["shein", "temu", "tiktok", "kwai"])


def classificar_marketplace_grupo(nome_cliente: str) -> str:
    """Retorna a marca principal do Marketplace ou 'OUTROS'."""
    if not nome_cliente:
        return "OUTROS"
    n = str(nome_cliente).strip().lower()
    if "shein" in n:
        return "SHEIN"
    if "temu" in n:
        return "TEMU"
    if "tiktok" in n:
        return "TIKTOK"
    if "kwai" in n:
        return "KWAI"
    return "OUTROS"



def determinar_tipo_ponto(codigo: str) -> str:
    """Classifica com precisão o tipo da unidade na malha conforme convenção operacional:
    - MD (Ponto de Coleta): prefixos 'MD-' ou '[UF]-W-MD'
    - HUB (Transferência): unidades contendo '-H', '-Z-H', '-W-H', 'HUB-'
    - Galpão / CD (Distribuição): prefixos 'WR-GLP', 'GLP', 'CD'
    - Ponto de Apoio / Base: prefixos contendo '-PA', '-RR-'
    - Ponto de Rede: prefixos contendo '-D', '-FQ', '-A'
    """
    if not codigo:
        return "MD (Ponto de Coleta)"
    c = str(codigo).strip().upper()
    if re.search(r"-[ZWA]-H|HUB-|-H\d{2,4}$|-H0|-H1|-H2|-H3", c) or c.startswith("HUB"):
        return "HUB (Transferência)"
    if c.startswith("WR-GLP") or "GLP" in c or "GALPAO" in c or "CD" in c:
        return "Galpão / CD (Distribuição)"
    if "-PA" in c or "-RR-" in c or "APOIO" in c:
        return "Ponto de Apoio / Base"
    if re.search(r"-[A-Z]-D\d+|-[A-Z]-FQ\d+|-[A-Z]-A\d+", c):
        return "Ponto de Rede"
    return "MD (Ponto de Coleta)"


@router.get("/dias")
def get_dias_coletas(db: Session = Depends(get_db)):
    """Retorna todas as datas com histórico de coleta, priorizando as datas com movimentação detalhada."""
    # Dias com dados ricos em criacao_pedidos_historico
    rows_pedidos = db.execute(text("""
        SELECT DISTINCT dia_base FROM criacao_pedidos_historico 
        WHERE dia_base IS NOT NULL AND dia_base != ''
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC;
    """)).fetchall()
    dias_com_pedidos = [r[0] for r in rows_pedidos if r[0]]

    # Todos os dias em ambas as tabelas
    rows_todos = db.execute(text("""
        SELECT DISTINCT dia_base FROM (
            SELECT dia_base FROM criacao_pedidos_historico WHERE dia_base IS NOT NULL AND dia_base != ''
            UNION
            SELECT dia_base FROM detalhe_md_historico WHERE dia_base IS NOT NULL AND dia_base != ''
        )
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC;
    """)).fetchall()
    todos_dias = [r[0] for r in rows_todos if r[0]]

    # O dia recente deve ser o mais recente com pedidos reais detalhados (ex: 06/10/2026)
    dia_recente = dias_com_pedidos[0] if dias_com_pedidos else (todos_dias[0] if todos_dias else "06/10/2026")

    meses = []
    for d in todos_dias:
        if len(d) == 10 and d[2] == "/" and d[5] == "/":
            m_ano = d[3:10]
            if m_ano not in meses:
                meses.append(m_ano)
    
    return {"dias": todos_dias, "meses": meses, "dia_recente": dia_recente}


def _normalizar_parametro_dia(dia: Optional[str]) -> str:
    """Converte 'MES:10/2026' ou '10/2026' para '%/10/2026' para consultas SQL com LIKE :dia."""
    if not dia:
        return ""
    d = dia.strip()
    if d.upper().startswith("MES:"):
        return f"%/{d[4:].strip()}"
    if len(d) == 7 and d[2] == "/":
        return f"%/{d}"
    return d


@router.get("/resumo")
def get_resumo_coletas(
    dia: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Retorna KPIs executivos, taxa de coleta, backlog, divisão de modalidades e alertas de novos/não cadastrados."""
    # 1. Definir dia
    if not dia or dia.strip().upper() in ["", "TODOS"]:
        row_dia = db.execute(text("""
            SELECT dia_base FROM criacao_pedidos_historico 
            WHERE dia_base IS NOT NULL AND dia_base != '' 
            ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC 
            LIMIT 1;
        """)).fetchone()
        dia = row_dia[0] if row_dia else "06/10/2026"

    # Filtros dinâmicos (Visão Central de Coletas: ignora pontos vazios, SP-R-TFK001 e ANJUN)
    clauses = [
        "dia_base LIKE :dia",
        "ponto_colecao IS NOT NULL",
        "TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')",
        "UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'",
        "UPPER(ponto_colecao) NOT LIKE '%ANJUN%'"
    ]
    params: Dict[str, Any] = {"dia": _normalizar_parametro_dia(dia)}

    if cliente and cliente.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(nome_cliente) = :cli")
        params["cli"] = cliente.strip().lower()

    if regional and regional.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(estado) = :reg")
        params["reg"] = regional.strip().lower()

    where_sql = "WHERE " + " AND ".join(clauses)

    # 2. Obter totais da tabela criacao_pedidos_historico (com os 4 status oficiais e separação Dropoff vs Pickup pelo ponto de coleta)
    tot_row = db.execute(text(f"""
        SELECT 
            COALESCE(SUM(total_pedidos), 0) as total,
            COUNT(DISTINCT CASE WHEN NOT (UPPER(TRIM(ponto_colecao)) LIKE '%-Z-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-W-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H0%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H1%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H2%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H3%' OR UPPER(TRIM(ponto_colecao)) LIKE 'HUB%' OR UPPER(TRIM(ponto_colecao)) LIKE 'WR-GLP%' OR UPPER(TRIM(ponto_colecao)) LIKE '%GLP%') AND UPPER(TRIM(ponto_colecao)) NOT IN ('', 'NAN', 'NULL', 'NONE', '-') THEN UPPER(TRIM(ponto_colecao)) END) as total_mds,
            COUNT(DISTINCT CASE WHEN merchant_nome IS NOT NULL AND trim(merchant_nome) != '' THEN merchant_nome END) as total_sellers,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('coleta', 'coletado', 'saco selado', 'não coletado', 'nao coletado', 'pendente', 'aguardando', 'no ponto', 'problema') OR status_pedido IS NULL OR TRIM(status_pedido) = '' THEN total_pedidos ELSE 0 END) as backlog_coleta,
            SUM(CASE WHEN NOT (UPPER(TRIM(ponto_colecao)) LIKE '%-Z-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-W-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H0%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H1%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H2%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H3%' OR UPPER(TRIM(ponto_colecao)) LIKE 'HUB%' OR UPPER(TRIM(ponto_colecao)) LIKE 'WR-GLP%' OR UPPER(TRIM(ponto_colecao)) LIKE '%GLP%') THEN total_pedidos ELSE 0 END) as vol_dropoff_ponto,
            SUM(CASE WHEN (UPPER(TRIM(ponto_colecao)) LIKE '%-Z-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-W-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H0%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H1%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H2%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H3%' OR UPPER(TRIM(ponto_colecao)) LIKE 'HUB%' OR UPPER(TRIM(ponto_colecao)) LIKE 'WR-GLP%' OR UPPER(TRIM(ponto_colecao)) LIKE '%GLP%') THEN total_pedidos ELSE 0 END) as vol_pickup_ponto,
            SUM(CASE WHEN NOT (UPPER(TRIM(ponto_colecao)) LIKE '%-Z-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-W-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H0%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H1%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H2%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H3%' OR UPPER(TRIM(ponto_colecao)) LIKE 'HUB%' OR UPPER(TRIM(ponto_colecao)) LIKE 'WR-GLP%' OR UPPER(TRIM(ponto_colecao)) LIKE '%GLP%') AND (LOWER(TRIM(status_pedido)) IN ('coleta', 'coletado', 'saco selado', 'não coletado', 'nao coletado', 'pendente', 'aguardando', 'no ponto', 'problema') OR status_pedido IS NULL OR TRIM(status_pedido) = '') THEN total_pedidos ELSE 0 END) as backlog_estrito_md,
            COUNT(DISTINCT CASE WHEN (UPPER(TRIM(ponto_colecao)) LIKE '%-Z-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-W-H%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H0%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H1%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H2%' OR UPPER(TRIM(ponto_colecao)) LIKE '%-H3%' OR UPPER(TRIM(ponto_colecao)) LIKE 'HUB%' OR UPPER(TRIM(ponto_colecao)) LIKE 'WR-GLP%' OR UPPER(TRIM(ponto_colecao)) LIKE '%GLP%') THEN UPPER(TRIM(ponto_colecao)) END) as total_hubs,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'circuito fechado' THEN total_pedidos ELSE 0 END) as circuito_fechado,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as em_transito,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'foi assinado' THEN total_pedidos ELSE 0 END) as foi_assinado
        FROM criacao_pedidos_historico
        {where_sql};
    """), params).fetchone()

    total_pedidos = int(tot_row[0] or 0)
    total_mds = int(tot_row[1] or 0)
    total_sellers = int(tot_row[2] or 0)
    coletados = int(tot_row[3] or 0)
    backlog_coleta = int(tot_row[4] or 0)
    vol_dropoff = int(tot_row[5] or 0)
    vol_pickup = int(tot_row[6] or 0)
    backlog_estrito_md = int(tot_row[7] or 0)
    total_hubs = int(tot_row[8] or 0)
    circuito_fechado = int(tot_row[9] or 0)
    em_transito = int(tot_row[10] or 0)
    foi_assinado = int(tot_row[11] or 0)
    backlog = backlog_coleta

    # Fallback para detalhe_md_historico se criacao_pedidos_historico estiver vazio nesta data
    if total_pedidos == 0:
        row_md_tot = db.execute(text("""
            SELECT 
                COALESCE(SUM(total), 0) as total,
                COUNT(DISTINCT CASE WHEN (UPPER(TRIM(md)) LIKE 'MD-%' OR UPPER(TRIM(md)) LIKE '__-W-MD%') THEN md END) as total_mds,
                COALESCE(SUM(carregamento + descarregamento), 0) as coletados,
                COALESCE(SUM(backlog), 0) as backlog
            FROM detalhe_md_historico
            WHERE dia_base LIKE :dia;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchone()
        if row_md_tot and (row_md_tot[0] or 0) > 0:
            total_pedidos = int(row_md_tot[0] or 0)
            total_mds = int(row_md_tot[1] or 0)
            coletados = int(row_md_tot[2] or 0)
            backlog = int(row_md_tot[3] or 0)
            backlog_coleta = backlog
            backlog_estrito_md = backlog
            circuito_fechado = coletados
            em_transito = 0
            foi_assinado = 0
            vol_dropoff = total_pedidos
            vol_pickup = 0

    if coletados == 0 and backlog == 0 and total_pedidos > 0:
        coletados = total_pedidos
        circuito_fechado = total_pedidos

    taxa_coleta = round((coletados / max(total_pedidos, 1) * 100), 1) if total_pedidos > 0 else 0.0

    # 3. Alertas Inteligentes
    # A. Pontos Cadastrados no Banco
    rows_cadastrados = db.execute(text("""
        SELECT DISTINCT UPPER(TRIM(md_codigo)) FROM md_mapping WHERE md_codigo IS NOT NULL
        UNION
        SELECT DISTINCT UPPER(TRIM(md_codigo)) FROM malha_coordenadas WHERE md_codigo IS NOT NULL
    """)).fetchall()
    cadastrados_set = set([r[0] for r in rows_cadastrados if r[0]])

    # B. Pontos que biparam no dia
    rows_pontos_dia = db.execute(text("""
        SELECT UPPER(TRIM(ponto_colecao)), SUM(total_pedidos)
        FROM criacao_pedidos_historico
        WHERE dia_base LIKE :dia
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY UPPER(TRIM(ponto_colecao));
    """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

    pontos_dia_dict = {r[0]: int(r[1] or 0) for r in rows_pontos_dia if r[0]}

    # Identificar Pontos Não Cadastrados
    pontos_nao_cadastrados = []
    for ponto, vol in pontos_dia_dict.items():
        if ponto not in cadastrados_set and "SP-R-TFK001" not in ponto and "ANJUN" not in ponto:
            pontos_nao_cadastrados.append({
                "md_codigo": ponto,
                "tipo_ponto": determinar_tipo_ponto(ponto),
                "is_md": eh_md(ponto),
                "volume": vol
            })
    pontos_nao_cadastrados.sort(key=lambda x: x["volume"], reverse=True)

    # Identificar Primeira Bipagem (ponto que nunca bipou antes desta data)
    pontos_primeira_bipagem = []
    try:
        # Pega pontos históricos em datas anteriores a :dia
        partes = dia.split("/")
        if len(partes) == 3:
            dia_iso = f"{partes[2]}-{partes[1]}-{partes[0]}"
            rows_anteriores = db.execute(text("""
                SELECT DISTINCT UPPER(TRIM(ponto_colecao)) 
                FROM criacao_pedidos_historico 
                WHERE (SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2)) < :dia_iso
                  AND ponto_colecao IS NOT NULL AND trim(ponto_colecao) != '';
            """), {"dia_iso": dia_iso}).fetchall()
            pontos_anteriores_set = set([r[0] for r in rows_anteriores if r[0]])

            for ponto, vol in pontos_dia_dict.items():
                if ponto not in pontos_anteriores_set and vol > 0:
                    pontos_primeira_bipagem.append({
                        "md_codigo": ponto,
                        "tipo_ponto": determinar_tipo_ponto(ponto),
                        "is_md": eh_md(ponto),
                        "volume": vol
                    })
            pontos_primeira_bipagem.sort(key=lambda x: x["volume"], reverse=True)
    except Exception:
        pass

    # Identificar Pickups dropados indevidamente em MDs de balcão (em vez de Hubs/Galpões)
    desvios_pickup_em_md = []
    try:
        rows_desvios = db.execute(text("""
            SELECT 
                UPPER(TRIM(c.ponto_colecao)) as md_codigo,
                COALESCE(m.nome_ponto, mc.nome_ponto, c.ponto_colecao) as nome_ponto,
                SUM(c.total_pedidos) as volume_pickup_indevido
            FROM criacao_pedidos_historico c
            LEFT JOIN md_mapping m ON UPPER(TRIM(c.ponto_colecao)) = UPPER(TRIM(m.md_codigo))
            LEFT JOIN malha_coordenadas mc ON UPPER(TRIM(c.ponto_colecao)) = UPPER(TRIM(mc.md_codigo))
            WHERE c.dia_base LIKE :dia
              AND (LOWER(c.maneira_coleta) LIKE '%coleta%' OR LOWER(c.maneira_coleta) LIKE '%pickup%')
              AND (
                  UPPER(c.ponto_colecao) LIKE 'MD-%'
                  OR UPPER(c.ponto_colecao) LIKE '__-W-MD%'
              )
              AND UPPER(c.ponto_colecao) NOT LIKE '%-H%'
              AND UPPER(c.ponto_colecao) NOT LIKE '%HUB%'
              AND UPPER(c.ponto_colecao) NOT LIKE '%GLP%'
            GROUP BY UPPER(TRIM(c.ponto_colecao))
            HAVING SUM(c.total_pedidos) > 0
            ORDER BY SUM(c.total_pedidos) DESC
            LIMIT 20;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()
        for r in rows_desvios:
            desvios_pickup_em_md.append({
                "md_codigo": r[0],
                "nome_ponto": r[1] or r[0],
                "volume": int(r[2] or 0)
            })
    except Exception:
        pass

    # 4. Distribuição de Clientes (com separação de Marketplaces W2D / D2D e Demais Clientes)
    clientes_rows = db.execute(text(f"""
        SELECT 
            nome_cliente, 
            SUM(total_pedidos) as volume,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%' THEN total_pedidos ELSE 0 END) as vol_dropoff,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%' THEN total_pedidos ELSE 0 END) as vol_pickup,
            COUNT(DISTINCT UPPER(TRIM(ponto_colecao))) as qtd_pontos,
            COUNT(DISTINCT merchant_nome) as qtd_sellers
        FROM criacao_pedidos_historico
        {where_sql}
        GROUP BY nome_cliente
        ORDER BY SUM(total_pedidos) DESC;
    """), params).fetchall()

    # Mapear IDs dos clientes cadastrados em cliente_mapping
    cli_id_map: Dict[str, List[str]] = {}
    todos_clientes_cad: List[str] = []
    try:
        rows_cm = db.execute(text("SELECT cliente_id, nome_exibicao FROM cliente_mapping WHERE ativo = 1 ORDER BY nome_exibicao;")).fetchall()
        for cid, cnome in rows_cm:
            if cnome:
                k_low = cnome.strip().lower()
                if cid:
                    cli_id_map.setdefault(k_low, []).append(str(cid).strip())
                if cnome.strip() not in todos_clientes_cad:
                    todos_clientes_cad.append(cnome.strip())
    except Exception:
        pass

    clientes_breakdown = []
    clientes_vistos_low = set()

    for c in clientes_rows:
        c_nome = (c[0] or "Outros").strip()
        clientes_vistos_low.add(c_nome.lower())
        c_vol = int(c[1] or 0)
        c_col = int(c[2] or 0)
        c_bkl = int(c[3] or 0)
        c_dp = int(c[4] or 0)
        c_pk = int(c[5] or 0)
        c_pts = int(c[6] or 0)
        c_sel = int(c[7] or 0)
        if c_col == 0 and c_bkl == 0 and c_vol > 0:
            c_col = c_vol
        c_pct = round((c_vol / max(total_pedidos, 1) * 100), 1)
        c_taxa = round((c_col / max(c_vol, 1) * 100), 1) if c_vol > 0 else 0.0
        is_mkt = eh_cliente_marketplace(c_nome)
        mkt_grupo = classificar_marketplace_grupo(c_nome)
        n_low = c_nome.lower()
        if "d2d" in n_low:
            mod_tag = "D2D"
        elif "w2d" in n_low or "w2s" in n_low:
            mod_tag = "W2D / W2S"
        elif "xborder" in n_low:
            mod_tag = "Cross-Border"
        elif c_dp > 0 and c_pk == 0:
            mod_tag = "D2D (Dropoff)"
        elif c_pk > 0 and c_dp == 0:
            mod_tag = "W2D (Pickup)"
        else:
            mod_tag = "W2D & D2D"

        clientes_breakdown.append({
            "cliente": c_nome,
            "nome_cliente": c_nome,
            "cliente_ids": cli_id_map.get(n_low, []),
            "is_marketplace": is_mkt,
            "marketplace_grupo": mkt_grupo,
            "modalidade_tag": mod_tag,
            "volume": c_vol,
            "coletados": c_col,
            "backlog": c_bkl,
            "vol_dropoff": c_dp,
            "vol_pickup": c_pk,
            "qtd_pontos": c_pts,
            "qtd_sellers": c_sel,
            "taxa_pct": c_taxa,
            "pct_total": c_pct,
            "share_pct": c_pct
        })

    # Incluir também os clientes cadastrados em cliente_mapping que tiveram 0 pedidos no dia (se não houver filtro de cliente único)
    if not cliente or cliente.strip().upper() in ["TODOS", ""]:
        for c_cad in todos_clientes_cad:
            if c_cad.lower() not in clientes_vistos_low:
                clientes_vistos_low.add(c_cad.lower())
                is_mkt = eh_cliente_marketplace(c_cad)
                mkt_grupo = classificar_marketplace_grupo(c_cad)
                n_low = c_cad.lower()
                if "d2d" in n_low:
                    mod_tag = "D2D"
                elif "w2d" in n_low or "w2s" in n_low:
                    mod_tag = "W2D / W2S"
                elif "xborder" in n_low:
                    mod_tag = "Cross-Border"
                else:
                    mod_tag = "Cadastrado"
                clientes_breakdown.append({
                    "cliente": c_cad,
                    "nome_cliente": c_cad,
                    "cliente_ids": cli_id_map.get(n_low, []),
                    "is_marketplace": is_mkt,
                    "marketplace_grupo": mkt_grupo,
                    "modalidade_tag": mod_tag,
                    "volume": 0,
                    "coletados": 0,
                    "backlog": 0,
                    "vol_dropoff": 0,
                    "vol_pickup": 0,
                    "qtd_pontos": 0,
                    "qtd_sellers": 0,
                    "taxa_pct": 0.0,
                    "pct_total": 0.0,
                    "share_pct": 0.0
                })

    # 5. Construir Cards por Macro-Região (Sudeste, Sul, Centro-Oeste, Nordeste, Norte) + Estados (UF)
    # Separando Dropoff vs Pickup pelo PONTO que fez a coleta (MD = Dropoff, HUB/CD = Pickup) e os 4 Status Oficiais
    ESTADOS_NOMES = {
        "SP": "São Paulo", "RJ": "Rio de Janeiro", "MG": "Minas Gerais", "ES": "Espírito Santo",
        "PR": "Paraná", "SC": "Santa Catarina", "RS": "Rio Grande do Sul",
        "GO": "Goiás", "DF": "Distrito Federal", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul",
        "BA": "Bahia", "PE": "Pernambuco", "CE": "Ceará", "RN": "Rio Grande do Norte",
        "PB": "Paraíba", "AL": "Alagoas", "SE": "Sergipe", "MA": "Maranhão", "PI": "Piauí",
        "AM": "Amazonas", "PA": "Pará", "RO": "Rondônia", "TO": "Tocantins",
        "AC": "Acre", "AP": "Amapá", "RR": "Roraima",
    }
    MACRO_REGIOES_DEF = [
        ("Sudeste", ["SP", "RJ", "MG", "ES"]),
        ("Sul", ["PR", "SC", "RS"]),
        ("Centro-Oeste", ["GO", "DF", "MT", "MS"]),
        ("Nordeste", ["BA", "PE", "CE", "RN", "PB", "AL", "SE", "MA", "PI"]),
        ("Norte", ["AM", "PA", "RO", "TO", "AC", "AP", "RR"]),
    ]

    # Mapa de UF por ponto cadastrado
    uf_por_ponto: Dict[str, str] = {}
    try:
        for r_uf in db.execute(text("SELECT UPPER(TRIM(md_codigo)), UPPER(TRIM(COALESCE(uf, estado, ''))) FROM malha_coordenadas WHERE md_codigo IS NOT NULL")).fetchall():
            if r_uf[0] and len(r_uf[1]) == 2:
                uf_por_ponto[r_uf[0]] = r_uf[1]
        for r_uf in db.execute(text("SELECT UPPER(TRIM(md_codigo)), UPPER(TRIM(COALESCE(estado, ''))) FROM md_mapping WHERE md_codigo IS NOT NULL")).fetchall():
            if r_uf[0] and len(r_uf[1]) == 2:
                uf_por_ponto[r_uf[0]] = r_uf[1]
    except Exception:
        pass

    rows_reg_pts = db.execute(text(f"""
        SELECT 
            UPPER(TRIM(ponto_colecao)) as ponto,
            MAX(UPPER(TRIM(COALESCE(estado, 'SP')))) as uf_col,
            SUM(total_pedidos) as total,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'circuito fechado' THEN total_pedidos ELSE 0 END) as circuito_fechado,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as em_transito,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('coleta', 'coletado', 'saco selado', 'não coletado', 'nao coletado', 'pendente', 'aguardando', 'no ponto', 'problema') OR status_pedido IS NULL OR TRIM(status_pedido) = '' THEN total_pedidos ELSE 0 END) as backlog_coleta,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'foi assinado' THEN total_pedidos ELSE 0 END) as foi_assinado
        FROM criacao_pedidos_historico
        {where_sql}
        GROUP BY UPPER(TRIM(ponto_colecao));
    """), params).fetchall()

    if len(rows_reg_pts) == 0:
        rows_reg_pts = db.execute(text("""
            SELECT 
                UPPER(TRIM(md)) as ponto,
                MAX(UPPER(TRIM(COALESCE(estado, 'SP')))) as uf_col,
                SUM(total) as total,
                SUM(carregamento + descarregamento) as circuito_fechado,
                0 as em_transito,
                SUM(backlog) as backlog_coleta,
                0 as foi_assinado
            FROM detalhe_md_historico
            WHERE dia_base LIKE :dia AND md IS NOT NULL AND TRIM(md) != ''
            GROUP BY UPPER(TRIM(md));
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

    dados_uf: Dict[str, Dict[str, Any]] = {}
    for uf_sigla in ESTADOS_NOMES.keys():
        dados_uf[uf_sigla] = {
            "uf": uf_sigla,
            "estado": uf_sigla,
            "nome_estado": ESTADOS_NOMES[uf_sigla],
            "volume": 0,
            "vol_dropoff": 0,
            "vol_pickup": 0,
            "qtd_pontos_dropoff": 0,
            "qtd_pontos_pickup": 0,
            "circuito_fechado": 0,
            "em_transito": 0,
            "backlog_coleta": 0,
            "foi_assinado": 0,
            "coletados": 0,
            "backlog": 0,
        }

    for rp in rows_reg_pts:
        pt = str(rp[0] or "").strip().upper()
        uf_col = str(rp[1] or "SP").strip().upper()
        vol_p = int(rp[2] or 0)
        cf_p = int(rp[3] or 0)
        tr_p = int(rp[4] or 0)
        bk_p = int(rp[5] or 0)
        fa_p = int(rp[6] or 0)
        if vol_p <= 0:
            continue

        # Determinar UF real baseada no ponto que fez a coleta
        prefixo_pt = pt[:2] if len(pt) >= 3 and pt[2] == "-" else ""
        if prefixo_pt in ESTADOS_NOMES:
            uf_ponto = prefixo_pt
        elif pt in uf_por_ponto and uf_por_ponto[pt] in ESTADOS_NOMES:
            uf_ponto = uf_por_ponto[pt]
        elif uf_col in ESTADOS_NOMES:
            uf_ponto = uf_col
        else:
            uf_ponto = "SP"

        # Separar Dropoff vs Pickup baseado no ponto que fez a coleta (MD = Dropoff, HUB/Galpão = Pickup)
        is_ponto_dropoff = eh_md(pt)

        du = dados_uf[uf_ponto]
        du["volume"] += vol_p
        du["circuito_fechado"] += cf_p
        du["em_transito"] += tr_p
        du["backlog_coleta"] += bk_p
        du["foi_assinado"] += fa_p
        du["coletados"] += (cf_p + tr_p)
        du["backlog"] += bk_p
        if is_ponto_dropoff:
            du["vol_dropoff"] += vol_p
            du["qtd_pontos_dropoff"] += 1
        else:
            du["vol_pickup"] += vol_p
            du["qtd_pontos_pickup"] += 1

    macro_regioes = []
    regionais_flat = []

    for nome_regiao, lista_ufs in MACRO_REGIOES_DEF:
        vol_reg = 0
        dp_reg = 0
        pk_reg = 0
        pts_dp_reg = 0
        pts_pk_reg = 0
        cf_reg = 0
        tr_reg = 0
        bk_reg = 0
        fa_reg = 0
        estados_reg = []

        for uf_s in lista_ufs:
            du = dados_uf[uf_s]
            v_u = du["volume"]
            c_u = du["coletados"]
            du["taxa_coleta"] = round((c_u / max(v_u, 1)) * 100, 1) if v_u > 0 else 0.0
            du["taxa_finalizacao_pct"] = round((du["circuito_fechado"] / max(v_u, 1)) * 100, 1) if v_u > 0 else 0.0
            du["share_nacional_pct"] = round((v_u / max(total_pedidos, 1)) * 100, 1) if total_pedidos > 0 else 0.0

            vol_reg += v_u
            dp_reg += du["vol_dropoff"]
            pk_reg += du["vol_pickup"]
            pts_dp_reg += du["qtd_pontos_dropoff"]
            pts_pk_reg += du["qtd_pontos_pickup"]
            cf_reg += du["circuito_fechado"]
            tr_reg += du["em_transito"]
            bk_reg += du["backlog_coleta"]
            fa_reg += du["foi_assinado"]

            estados_reg.append(du)
            if v_u > 0:
                regionais_flat.append(du)

        # Ordenar estados dentro da região por volume decrescente
        estados_reg.sort(key=lambda x: x["volume"], reverse=True)
        for est_item in estados_reg:
            est_item["share_regiao_pct"] = round((est_item["volume"] / max(vol_reg, 1)) * 100, 1) if vol_reg > 0 else 0.0

        macro_regioes.append({
            "regiao": nome_regiao,
            "volume_total": vol_reg,
            "share_pct": round((vol_reg / max(total_pedidos, 1)) * 100, 1) if total_pedidos > 0 else 0.0,
            "vol_dropoff": dp_reg,
            "dropoff_pct": round((dp_reg / max(vol_reg, 1)) * 100, 1) if vol_reg > 0 else 0.0,
            "qtd_pontos_dropoff": pts_dp_reg,
            "vol_pickup": pk_reg,
            "pickup_pct": round((pk_reg / max(vol_reg, 1)) * 100, 1) if vol_reg > 0 else 0.0,
            "qtd_pontos_pickup": pts_pk_reg,
            "circuito_fechado": cf_reg,
            "em_transito": tr_reg,
            "backlog_coleta": bk_reg,
            "foi_assinado": fa_reg,
            "taxa_finalizacao_pct": round((cf_reg / max(vol_reg, 1)) * 100, 1) if vol_reg > 0 else 0.0,
            "estados": estados_reg,
        })

    regionais_flat.sort(key=lambda x: x["volume"], reverse=True)

    kpis_data = {
        "total_pedidos": total_pedidos,
        "total_mds": total_mds,
        "total_hubs": total_hubs,
        "total_sellers": total_sellers,
        "total_coletados": coletados,
        "coletados": coletados,
        "circuito_fechado": circuito_fechado,
        "circuito_fechado_pct": round(circuito_fechado / max(total_pedidos, 1) * 100, 1),
        "em_transito": em_transito,
        "em_transito_pct": round(em_transito / max(total_pedidos, 1) * 100, 1),
        "backlog_coleta": backlog_coleta,
        "backlog_coleta_pct": round(backlog_coleta / max(total_pedidos, 1) * 100, 1),
        "foi_assinado": foi_assinado,
        "foi_assinado_pct": round(foi_assinado / max(total_pedidos, 1) * 100, 1),
        "backlog_md": backlog_estrito_md,
        "backlog_hub": max(0, backlog - backlog_estrito_md),
        "backlog": backlog,
        "taxa_coleta_pct": taxa_coleta,
        "taxa_coleta": taxa_coleta,
        "dropoff_volume": vol_dropoff,
        "dropoff_pct": round(vol_dropoff / max(total_pedidos, 1) * 100, 1),
        "pickup_volume": vol_pickup,
        "pickup_pct": round(vol_pickup / max(total_pedidos, 1) * 100, 1),
    }

    return {
        "dia_selecionado": dia,
        "kpis": kpis_data,
        "totais": kpis_data,
        "macro_regioes": macro_regioes,
        "regionais": regionais_flat,
        "alertas": {
            "total_primeira_bipagem": len(pontos_primeira_bipagem),
            "primeira_bipagem": pontos_primeira_bipagem[:10],
            "total_nao_cadastrados": len(pontos_nao_cadastrados),
            "nao_cadastrados": pontos_nao_cadastrados[:15],
            "total_desvios_pickup": sum(d["volume"] for d in desvios_pickup_em_md),
            "desvios_pickup_em_md": desvios_pickup_em_md[:15]
        },
        "clientes_breakdown": clientes_breakdown
    }


@router.get("/mds")
def get_coletas_mds(
    dia: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    filtro_tipo: Optional[str] = Query("TODOS"),
    db: Session = Depends(get_db)
):
    """Lista detalhada de Minidrops (MDs) no dia com volume, coletado, backlog e indicadores de alerta."""
    if not dia or dia.strip().upper() in ["", "TODOS"]:
        row_dia = db.execute(text("SELECT dia_base FROM criacao_pedidos_historico ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC LIMIT 1;")).fetchone()
        dia = row_dia[0] if row_dia else "06/10/2026"

    clauses = [
        "dia_base LIKE :dia",
        "ponto_colecao IS NOT NULL",
        "TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')",
        "UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'",
        "UPPER(ponto_colecao) NOT LIKE '%ANJUN%'"
    ]
    params: Dict[str, Any] = {"dia": _normalizar_parametro_dia(dia)}

    if cliente and cliente.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(nome_cliente) = :cli")
        params["cli"] = cliente.strip().lower()

    if regional and regional.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(estado) = :reg")
        params["reg"] = regional.strip().lower()

    if search and search.strip():
        clauses.append("(LOWER(ponto_colecao) LIKE :q OR LOWER(cidade) LIKE :q OR LOWER(estado) LIKE :q)")
        params["q"] = f"%{search.strip().lower()}%"

    where_sql = "WHERE " + " AND ".join(clauses)

    rows = db.execute(text(f"""
        SELECT 
            UPPER(TRIM(ponto_colecao)) as md,
            MAX(estado) as estado,
            MAX(cidade) as cidade,
            SUM(total_pedidos) as total,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog,
            COUNT(DISTINCT merchant_nome) as qtd_sellers,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%' THEN total_pedidos ELSE 0 END) as vol_pickup,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%' THEN total_pedidos ELSE 0 END) as vol_dropoff
        FROM criacao_pedidos_historico
        {where_sql}
        GROUP BY UPPER(TRIM(ponto_colecao))
        ORDER BY SUM(total_pedidos) DESC;
    """), params).fetchall()

    if len(rows) == 0:
        rows = db.execute(text("""
            SELECT 
                UPPER(TRIM(md)) as md,
                MAX(estado) as estado,
                MAX(cidade) as cidade,
                SUM(total) as total,
                SUM(carregamento + descarregamento) as coletados,
                SUM(backlog) as backlog,
                1 as qtd_sellers,
                0 as vol_pickup,
                SUM(total) as vol_dropoff
            FROM detalhe_md_historico
            WHERE dia_base LIKE :dia AND md IS NOT NULL AND trim(md) != ''
            GROUP BY UPPER(TRIM(md))
            ORDER BY SUM(total) DESC;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

    # Dicionário de cadastrados
    rows_cad = db.execute(text("""
        SELECT UPPER(TRIM(md_codigo)), estado, regional, '' as cidade, COALESCE(tipo_ponto, 'MD (Ponto de Coleta)') as tipo FROM md_mapping WHERE md_codigo IS NOT NULL
        UNION
        SELECT UPPER(TRIM(md_codigo)), estado, regional, cidade, COALESCE(tipo_ponto, 'MD (Ponto de Coleta)') as tipo FROM malha_coordenadas WHERE md_codigo IS NOT NULL;
    """)).fetchall()
    cad_map = {}
    for r in rows_cad:
        if not r[0]:
            continue
        cd = r[0]
        if cd not in cad_map or (r[3] and not cad_map[cd]["cidade"]):
            cad_map[cd] = {
                "estado": r[1] or "",
                "regional": r[2] or "",
                "cidade": r[3] or "",
                "tipo_ponto": r[4] or "MD (Ponto de Coleta)"
            }

    # Data de referência para contagem de dias sem bipar
    try:
        partes = dia.split("/")
        dt_ref = date(int(partes[2]), int(partes[1]), int(partes[0]))
        dia_iso = f"{partes[2]}-{partes[1]}-{partes[0]}"
    except Exception:
        dt_ref = date.today()
        dia_iso = dt_ref.strftime("%Y-%m-%d")

    # Mapear última data de bipagem histórica de cada ponto
    rows_ultimas = db.execute(text("""
        SELECT 
            UPPER(TRIM(ponto_colecao)) as md,
            MAX(SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2)) as ultima_iso,
            MAX(dia_base) as ultima_br
        FROM criacao_pedidos_historico
        WHERE ponto_colecao IS NOT NULL AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
        GROUP BY UPPER(TRIM(ponto_colecao));
    """)).fetchall()
    mapa_ultimas_bipagens = {}
    for md_u, iso_u, br_u in rows_ultimas:
        mapa_ultimas_bipagens[md_u] = (iso_u, br_u)

    # Pontos anteriores para primeira bipagem
    rows_ant = db.execute(text("""
        SELECT DISTINCT UPPER(TRIM(ponto_colecao)) 
        FROM criacao_pedidos_historico 
        WHERE (SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2)) < :dia_iso
          AND ponto_colecao IS NOT NULL;
    """), {"dia_iso": dia_iso}).fetchall()
    pontos_anteriores_set = set([r[0] for r in rows_ant if r[0]])

    mds_processados_set = set()
    resultado = []

    for r in rows:
        md = r[0]
        mds_processados_set.add(md)
        total_p = int(r[3] or 0)
        col_p = int(r[4] or 0)
        bk_p = int(r[5] or 0)
        if col_p == 0 and bk_p == 0 and total_p > 0:
            col_p = total_p

        taxa = round(col_p / max(total_p, 1) * 100, 1)
        cad_info = cad_map.get(md, {})
        is_cadastrado = md in cad_map
        is_primeira = md not in pontos_anteriores_set

        # Cálculo da Tag de Bipagem (Opção 2: 5 a 7 dias sem bipar)
        info_u = mapa_ultimas_bipagens.get(md)
        if info_u and info_u[0]:
            try:
                dt_u = date.fromisoformat(info_u[0])
                dias_sem = max(0, (dt_ref - dt_u).days)
            except Exception:
                dias_sem = 0
            data_u_str = info_u[1]
        else:
            dias_sem = 0
            data_u_str = dia

        # Se bipou no dia atual (total_p > 0), a tag SEMPRE some
        if total_p > 0:
            is_sem_bipagem = False
            tag_bipagem = "🟢 Bipando Constante"
            dias_sem = 0
        else:
            is_sem_bipagem = dias_sem >= 5
            tag_bipagem = f"⚠️ Sem Bipagem ({dias_sem}d)" if is_sem_bipagem else "🟢 Bipando Constante"

        # Filtros rápidos (Por padrão, a aba de MDs mostra APENAS MDs estritos; HUBs como SP-Z-H005 ficam no filtro HUBS)
        filtro_upper = (filtro_tipo or "").strip().upper()
        is_unidade_md = eh_md(md)

        if filtro_upper in ["HUBS", "HUB", "GALPOES"]:
            if is_unidade_md:
                continue
        else:
            if not is_unidade_md:
                continue

        if filtro_upper in ["BACKLOG", "COM_BACKLOG"] and bk_p == 0:
            continue
        if filtro_upper in ["PRIMEIRA_BIPAGEM", "PRIMEIRA_VEZ", "1A_BIPAGEM"] and not is_primeira:
            continue
        vol_pk = int(r[7] or 0)
        vol_dp = int(r[8] or 0)
        tipo_pt = determinar_tipo_ponto(md)
        is_desvio_pk = (is_unidade_md and vol_pk > 0)

        if filtro_upper in ["NAO_CADASTRADOS", "NAO_CADASTRADO"] and is_cadastrado:
            continue
        if filtro_upper in ["SEM_BIPAGEM", "DORMENTE", "SEM_MOVIMENTO"] and not is_sem_bipagem:
            continue
        if filtro_upper in ["BIPANDO", "BIPANDO_CONSTANTE", "ATIVO_OPERANDO"] and is_sem_bipagem:
            continue
        if filtro_upper in ["DESVIO_PICKUP", "PICKUP_INCORRETO", "PICKUP_MD"] and not is_desvio_pk:
            continue

        resultado.append({
            "md": md,
            "md_codigo": md,
            "regional": cad_info.get("regional") or r[1] or "SP",
            "estado": cad_info.get("estado") or r[1] or "SP",
            "cidade": cad_info.get("cidade") or r[2] or "São Paulo",
            "tipo_ponto": tipo_pt,
            "is_md": is_unidade_md,
            "total_pedidos": total_p,
            "volume": total_p,
            "vol_pickup": vol_pk,
            "vol_dropoff": vol_dp,
            "is_desvio_pickup": is_desvio_pk,
            "coletados": col_p,
            "backlog": bk_p,
            "taxa_coleta": taxa,
            "taxa_coleta_pct": taxa,
            "qtd_sellers": int(r[6] or 0),
            "is_primeira_bipagem": is_primeira,
            "is_cadastrado": is_cadastrado,
            "is_sem_bipagem": is_sem_bipagem,
            "dias_sem_bipar": dias_sem,
            "tag_bipagem": tag_bipagem,
            "data_ultima_bipagem": data_u_str
        })

    # Incluir pontos cadastrados que não biparam no dia mas estão sem bipagem há 5+ dias (se filtro permitir, apenas para MDs)
    filtro_upper = (filtro_tipo or "").strip().upper()
    if filtro_upper in ["TODOS", "", "SEM_BIPAGEM", "DORMENTE"]:
        for md_cad, c_info in cad_map.items():
            if md_cad in mds_processados_set or "TFK" in md_cad or "ANJUN" in md_cad:
                continue
            if not eh_md(md_cad):
                continue
            info_u = mapa_ultimas_bipagens.get(md_cad)
            if info_u and info_u[0]:
                try:
                    dt_u = date.fromisoformat(info_u[0])
                    dias_sem = max(0, (dt_ref - dt_u).days)
                except Exception:
                    dias_sem = 999
                data_u_str = info_u[1]
            else:
                dias_sem = 999
                data_u_str = "Nunca Bipou"

            if dias_sem >= 5:
                # Aplicar filtros de busca e regional se preenchidos
                if regional and regional.strip().upper() not in ["TODOS", ""]:
                    if c_info.get("estado", "").lower() != regional.strip().lower():
                        continue
                if search and search.strip():
                    q = search.strip().lower()
                    if q not in md_cad.lower() and q not in c_info.get("cidade", "").lower() and q not in c_info.get("estado", "").lower():
                        continue

                resultado.append({
                    "md": md_cad,
                    "md_codigo": md_cad,
                    "regional": c_info.get("regional") or "SP",
                    "estado": c_info.get("estado") or "SP",
                    "cidade": c_info.get("cidade") or "São Paulo",
                    "tipo_ponto": determinar_tipo_ponto(md_cad),
                    "is_md": True,
                    "total_pedidos": 0,
                    "volume": 0,
                    "coletados": 0,
                    "backlog": 0,
                    "taxa_coleta": 0.0,
                    "taxa_coleta_pct": 0.0,
                    "qtd_sellers": 0,
                    "is_primeira_bipagem": False,
                    "is_cadastrado": True,
                    "is_sem_bipagem": True,
                    "dias_sem_bipar": dias_sem,
                    "tag_bipagem": f"⚠️ Sem Bipagem ({dias_sem}d)",
                    "data_ultima_bipagem": data_u_str
                })

    tot_bipando = sum(1 for m in resultado if not m["is_sem_bipagem"] and m["volume"] > 0)
    tot_sem_bipagem = sum(1 for m in resultado if m["is_sem_bipagem"])

    return {
        "mds": resultado,
        "total_mds": len(resultado),
        "total_bipando_constante": tot_bipando,
        "total_sem_bipagem": tot_sem_bipagem
    }


@router.get("/cliente-detalhes")
def get_cliente_detalhes(
    cliente: str = Query(..., description="Nome do cliente (ex: shein, sheind2d, temud2d, shopmulti)"),
    dia: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    modalidade: Optional[str] = Query("TODOS"),
    status_filtro: Optional[str] = Query("TODOS"),
    ponto_filtro: Optional[str] = Query("TODOS"),
    search: Optional[str] = Query(None),
    limit: int = Query(150),
    db: Session = Depends(get_db)
):
    """
    Drill-down completo de um cliente específico:
    Retorna KPIs do cliente (W2D vs D2D, Coletados vs Backlog), distribuição por Ponto (MDs e HUBs),
    distribuição por Seller e listagem de pacotes com filtro dropdown e busca rápida.
    """
    if not dia or dia.strip().upper() in ["", "TODOS"]:
        row_dia = db.execute(text("SELECT dia_base FROM criacao_pedidos_historico ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC LIMIT 1;")).fetchone()
        dia = row_dia[0] if row_dia else "20/10/2026"

    cli_clean = cliente.strip()
    cli_low = cli_clean.lower()

    # Descobrir cliente_ids associados em cliente_mapping
    rows_ids = db.execute(text("SELECT cliente_id FROM cliente_mapping WHERE LOWER(TRIM(nome_exibicao)) = :c AND ativo = 1;"), {"c": cli_low}).fetchall()
    cliente_ids = [str(r[0]).strip() for r in rows_ids if r[0]]

    clauses_hist = [
        "dia_base LIKE :dia",
        "LOWER(TRIM(nome_cliente)) = :cli",
        "ponto_colecao IS NOT NULL",
        "TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')",
        "UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'",
        "UPPER(ponto_colecao) NOT LIKE '%ANJUN%'"
    ]
    params_hist: Dict[str, Any] = {"dia": _normalizar_parametro_dia(dia), "cli": cli_low}

    if regional and regional.strip().upper() not in ["TODOS", ""]:
        clauses_hist.append("LOWER(estado) = :reg")
        params_hist["reg"] = regional.strip().lower()

    if modalidade and modalidade.strip().upper() not in ["TODOS", ""]:
        mod_up = modalidade.strip().upper()
        if mod_up in ["D2D", "DROPOFF", "ENTREGA"]:
            clauses_hist.append("(LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%')")
        elif mod_up in ["W2D", "PICKUP", "COLETA"]:
            clauses_hist.append("(LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%')")

    if status_filtro and status_filtro.strip().upper() not in ["TODOS", ""]:
        st_up = status_filtro.strip().upper()
        if st_up == "COLETADOS":
            clauses_hist.append("LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento')")
        elif st_up == "BACKLOG":
            clauses_hist.append("LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando')")

    if ponto_filtro and ponto_filtro.strip().upper() not in ["TODOS", ""]:
        clauses_hist.append("UPPER(TRIM(ponto_colecao)) = :pt")
        params_hist["pt"] = ponto_filtro.strip().upper()

    if search and search.strip():
        clauses_hist.append("(LOWER(merchant_nome) LIKE :q OR LOWER(ponto_colecao) LIKE :q OR LOWER(cidade) LIKE :q OR LOWER(cep_remetente) LIKE :q)")
        params_hist["q"] = f"%{search.strip().lower()}%"

    where_hist = "WHERE " + " AND ".join(clauses_hist)

    # 1. Resumo Geral do Cliente
    row_res = db.execute(text(f"""
        SELECT 
            COALESCE(SUM(total_pedidos), 0) as total,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%' THEN total_pedidos ELSE 0 END) as vol_dropoff,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%' THEN total_pedidos ELSE 0 END) as vol_pickup,
            COUNT(DISTINCT UPPER(TRIM(ponto_colecao))) as qtd_pontos,
            COUNT(DISTINCT merchant_nome) as qtd_sellers
        FROM criacao_pedidos_historico
        {where_hist};
    """), params_hist).fetchone()

    tot_cli = int(row_res[0] or 0)
    col_cli = int(row_res[1] or 0)
    bkl_cli = int(row_res[2] or 0)
    dp_cli = int(row_res[3] or 0)
    pk_cli = int(row_res[4] or 0)
    pts_cli = int(row_res[5] or 0)
    sel_cli = int(row_res[6] or 0)
    taxa_cli = round((col_cli / max(tot_cli, 1)) * 100, 1) if tot_cli > 0 else 0.0

    # 2. Distribuição por Ponto (MD vs HUB)
    rows_pts = db.execute(text(f"""
        SELECT 
            UPPER(TRIM(ponto_colecao)) as ponto,
            MAX(cidade) as cidade,
            MAX(estado) as estado,
            SUM(total_pedidos) as volume,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%' THEN total_pedidos ELSE 0 END) as vol_dropoff,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%' THEN total_pedidos ELSE 0 END) as vol_pickup,
            COUNT(DISTINCT merchant_nome) as qtd_sellers
        FROM criacao_pedidos_historico
        {where_hist}
        GROUP BY UPPER(TRIM(ponto_colecao))
        ORDER BY SUM(total_pedidos) DESC
        LIMIT 100;
    """), params_hist).fetchall()

    por_ponto = []
    pontos_disponiveis = []
    for rp in rows_pts:
        pt_cod = rp[0] or "N/A"
        pontos_disponiveis.append(pt_cod)
        v_p = int(rp[3] or 0)
        c_p = int(rp[4] or 0)
        b_p = int(rp[5] or 0)
        por_ponto.append({
            "ponto_colecao": pt_cod,
            "tipo_ponto": determinar_tipo_ponto(pt_cod),
            "is_md": eh_md(pt_cod),
            "cidade": rp[1] or "São Paulo",
            "estado": rp[2] or "SP",
            "volume": v_p,
            "coletados": c_p,
            "backlog": b_p,
            "vol_dropoff": int(rp[6] or 0),
            "vol_pickup": int(rp[7] or 0),
            "qtd_sellers": int(rp[8] or 0),
            "taxa_coleta_pct": round((c_p / max(v_p, 1)) * 100, 1)
        })

    # 3. Distribuição por Seller
    rows_sel = db.execute(text(f"""
        SELECT 
            COALESCE(merchant_nome, 'Seller Não Identificado') as seller,
            MAX(merchant_id) as merchant_id,
            MAX(cidade) as cidade,
            MAX(estado) as estado,
            MAX(UPPER(TRIM(ponto_colecao))) as ponto,
            MAX(maneira_coleta) as maneira,
            SUM(total_pedidos) as volume,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        {where_hist}
        GROUP BY COALESCE(merchant_nome, 'Seller Não Identificado'), UPPER(TRIM(ponto_colecao))
        ORDER BY SUM(total_pedidos) DESC
        LIMIT 100;
    """), params_hist).fetchall()

    por_seller = []
    for rs in rows_sel:
        v_s = int(rs[6] or 0)
        c_s = int(rs[7] or 0)
        b_s = int(rs[8] or 0)
        man_s = rs[5] or "Dropoff"
        por_seller.append({
            "merchant_nome": rs[0],
            "merchant_id": rs[1] or "N/A",
            "cidade": rs[2] or "",
            "estado": rs[3] or "",
            "ponto_colecao": rs[4] or "N/A",
            "tipo_ponto": determinar_tipo_ponto(rs[4] or ""),
            "maneira_coleta": man_s,
            "modalidade": "W2D / Pickup" if ("coleta" in man_s.lower() or "pickup" in man_s.lower()) else "D2D / Dropoff",
            "volume": v_s,
            "coletados": c_s,
            "backlog": b_s,
            "taxa_coleta_pct": round((c_s / max(v_s, 1)) * 100, 1)
        })

    # 4. Listagem de Pacotes Individuais (de operacional_pedidos_completo se disponível para a data, ou lotes de criacao_pedidos_historico)
    pacotes = []
    usa_pacotes_individuais = False
    try:
        clauses_op = [
            "dia_base LIKE :dia",
            "ponto_colecao IS NOT NULL",
            "TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')",
            "UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'",
            "UPPER(ponto_colecao) NOT LIKE '%ANJUN%'"
        ]
        params_op: Dict[str, Any] = {"dia": _normalizar_parametro_dia(dia), "limit": min(limit, 300)}

        if cliente_ids:
            id_list_sql = ", ".join([f"'{cid}'" for cid in cliente_ids])
            clauses_op.append(f"TRIM(numero_cliente) IN ({id_list_sql})")
        else:
            clauses_op.append("(LOWER(remetente_nome) LIKE :cli_like OR LOWER(merchant_nome) LIKE :cli_like OR TRIM(numero_cliente) = :cli_raw)")
            params_op["cli_like"] = f"%{cli_low}%"
            params_op["cli_raw"] = cli_clean.replace("Cliente ", "").strip()

        if regional and regional.strip().upper() not in ["TODOS", ""]:
            clauses_op.append("LOWER(remetente_uf) = :reg")
            params_op["reg"] = regional.strip().lower()

        if modalidade and modalidade.strip().upper() not in ["TODOS", ""]:
            mod_up = modalidade.strip().upper()
            if mod_up in ["D2D", "DROPOFF", "ENTREGA"]:
                clauses_op.append("(LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%')")
            elif mod_up in ["W2D", "PICKUP", "COLETA"]:
                clauses_op.append("(LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%')")

        if status_filtro and status_filtro.strip().upper() not in ["TODOS", ""]:
            st_up = status_filtro.strip().upper()
            if st_up == "COLETADOS":
                clauses_op.append("LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento')")
            elif st_up == "BACKLOG":
                clauses_op.append("LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando')")

        if ponto_filtro and ponto_filtro.strip().upper() not in ["TODOS", ""]:
            clauses_op.append("UPPER(TRIM(ponto_colecao)) = :pt")
            params_op["pt"] = ponto_filtro.strip().upper()

        if search and search.strip():
            clauses_op.append("(LOWER(codigo_barras) LIKE :q OR LOWER(pedido_cliente) LIKE :q OR LOWER(numero_pacote) LIKE :q OR LOWER(numero_saca) LIKE :q OR LOWER(merchant_nome) LIKE :q OR LOWER(ponto_colecao) LIKE :q OR LOWER(destinatario_cidade) LIKE :q)")
            params_op["q"] = f"%{search.strip().lower()}%"

        where_op = "WHERE " + " AND ".join(clauses_op)
        rows_op = db.execute(text(f"""
            SELECT 
                codigo_barras,
                pedido_cliente,
                numero_pacote,
                numero_saca,
                COALESCE(merchant_nome, remetente_nome, 'N/A') as seller,
                UPPER(TRIM(ponto_colecao)) as ponto,
                maneira_coleta,
                status_pedido,
                tempo_criacao,
                tempo_coleta,
                remetente_cidade,
                remetente_uf,
                destinatario_cidade,
                destinatario_uf,
                peso_kg,
                valor_declarado
            FROM operacional_pedidos_completo
            {where_op}
            ORDER BY tempo_coleta DESC, id DESC
            LIMIT :limit;
        """), params_op).fetchall()

        if rows_op:
            usa_pacotes_individuais = True
            for ro in rows_op:
                pt_c = ro[5] or "N/A"
                man_c = ro[6] or ""
                pacotes.append({
                    "codigo_barras": ro[0] or "-",
                    "pedido_cliente": ro[1] or "-",
                    "numero_pacote": ro[2] or "-",
                    "numero_saca": ro[3] or "-",
                    "merchant_nome": ro[4] or "-",
                    "ponto_colecao": pt_c,
                    "tipo_ponto": determinar_tipo_ponto(pt_c),
                    "is_md": eh_md(pt_c),
                    "maneira_coleta": man_c,
                    "modalidade": "W2D / Pickup" if ("coleta" in man_c.lower() or "pickup" in man_c.lower()) else "D2D / Dropoff",
                    "status_pedido": ro[7] or "-",
                    "tempo_criacao": ro[8] or "-",
                    "tempo_coleta": ro[9] or "-",
                    "origem": f"{ro[10] or ''}/{ro[11] or ''}".strip("/"),
                    "destino": f"{ro[12] or ''}/{ro[13] or ''}".strip("/"),
                    "peso_kg": round(float(ro[14] or 0.0), 3),
                    "valor_declarado": round(float(ro[15] or 0.0), 2),
                    "qtd_pacotes": 1
                })
    except Exception:
        pass

    # Fallback para lotes de criacao_pedidos_historico se operacional_pedidos_completo não tiver linhas na data
    if not pacotes:
        rows_lotes = db.execute(text(f"""
            SELECT 
                COALESCE(merchant_nome, 'Seller') as seller,
                COALESCE(merchant_id, '-') as mid,
                UPPER(TRIM(ponto_colecao)) as ponto,
                COALESCE(maneira_coleta, 'Dropoff') as maneira,
                COALESCE(status_pedido, '-') as status,
                COALESCE(cidade, '') as cid,
                COALESCE(estado, '') as uf,
                COALESCE(cep_remetente, '-') as cep,
                SUM(total_pedidos) as qtd
            FROM criacao_pedidos_historico
            {where_hist}
            GROUP BY merchant_nome, merchant_id, UPPER(TRIM(ponto_colecao)), maneira_coleta, status_pedido, cidade, estado, cep_remetente
            ORDER BY SUM(total_pedidos) DESC
            LIMIT :limit;
        """), {**params_hist, "limit": min(limit, 300)}).fetchall()

        for idx_l, rl in enumerate(rows_lotes):
            pt_c = rl[2] or "N/A"
            man_c = rl[3] or ""
            pacotes.append({
                "codigo_barras": f"LOTE-{idx_l + 1:03d} ({rl[8]} pcts)",
                "pedido_cliente": cli_clean,
                "numero_pacote": f"{rl[8]} pacotes",
                "numero_saca": f"CEP {rl[7]}",
                "merchant_nome": rl[0],
                "ponto_colecao": pt_c,
                "tipo_ponto": determinar_tipo_ponto(pt_c),
                "is_md": eh_md(pt_c),
                "maneira_coleta": man_c,
                "modalidade": "W2D / Pickup" if ("coleta" in man_c.lower() or "pickup" in man_c.lower()) else "D2D / Dropoff",
                "status_pedido": rl[4],
                "tempo_criacao": dia,
                "tempo_coleta": dia,
                "origem": f"{rl[5]}/{rl[6]}".strip("/"),
                "destino": "Malha ANJUN",
                "peso_kg": 0.0,
                "valor_declarado": 0.0,
                "qtd_pacotes": int(rl[8] or 0)
            })

    return {
        "status": "success",
        "cliente": cli_clean,
        "cliente_ids": cliente_ids,
        "is_marketplace": eh_cliente_marketplace(cli_clean),
        "marketplace_grupo": classificar_marketplace_grupo(cli_clean),
        "dia_selecionado": dia,
        "usa_pacotes_individuais": usa_pacotes_individuais,
        "resumo": {
            "total_pedidos": tot_cli,
            "coletados": col_cli,
            "backlog": bkl_cli,
            "taxa_coleta_pct": taxa_cli,
            "vol_dropoff": dp_cli,
            "vol_pickup": pk_cli,
            "qtd_pontos": pts_cli,
            "qtd_sellers": sel_cli
        },
        "pontos_disponiveis": pontos_disponiveis,
        "por_ponto": por_ponto,
        "por_seller": por_seller,
        "pacotes": pacotes
    }



@router.get("/sellers")
def get_coletas_sellers(
    dia: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Lista os sellers que geraram pedidos para coleta no dia selecionado."""
    if not dia or dia.strip().upper() in ["", "TODOS"]:
        row_dia = db.execute(text("SELECT dia_base FROM criacao_pedidos_historico ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC LIMIT 1;")).fetchone()
        dia = row_dia[0] if row_dia else "06/10/2026"

    clauses = ["dia_base LIKE :dia", "merchant_nome IS NOT NULL", "trim(merchant_nome) != ''"]
    params: Dict[str, Any] = {"dia": _normalizar_parametro_dia(dia)}

    if cliente and cliente.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(nome_cliente) = :cli")
        params["cli"] = cliente.strip().lower()

    if regional and regional.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(estado) = :reg")
        params["reg"] = regional.strip().lower()

    if search and search.strip():
        clauses.append("(LOWER(merchant_nome) LIKE :q OR LOWER(cidade) LIKE :q OR LOWER(bairro) LIKE :q OR LOWER(ponto_colecao) LIKE :q)")
        params["q"] = f"%{search.strip().lower()}%"

    where_sql = "WHERE " + " AND ".join(clauses)

    rows = db.execute(text(f"""
        SELECT 
            merchant_nome,
            merchant_id,
            nome_cliente,
            cidade,
            estado,
            bairro,
            maneira_coleta,
            ponto_colecao,
            SUM(total_pedidos) as volume,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        {where_sql}
        GROUP BY merchant_nome, nome_cliente, cidade, maneira_coleta, ponto_colecao
        ORDER BY SUM(total_pedidos) DESC
        LIMIT :limit;
    """), {**params, "limit": limit}).fetchall()

    if len(rows) == 0:
        rows = db.execute(text("""
            SELECT 
                nome_cliente as merchant_nome,
                'CONTA' as merchant_id,
                nome_cliente,
                cidade,
                estado,
                regional as bairro,
                'Dropoff (Balcão)' as maneira_coleta,
                md as ponto_colecao,
                SUM(total) as volume,
                SUM(carregamento + descarregamento) as coletados,
                SUM(backlog) as backlog
            FROM detalhe_md_historico
            WHERE dia_base LIKE :dia AND nome_cliente IS NOT NULL AND trim(nome_cliente) != ''
            GROUP BY nome_cliente, cidade, md
            ORDER BY SUM(total) DESC
            LIMIT :limit;
        """), {"dia": _normalizar_parametro_dia(dia), "limit": limit}).fetchall()

    sellers = []
    for r in rows:
        vol = int(r[8] or 0)
        col = int(r[9] or 0)
        bk = int(r[10] or 0)
        if col == 0 and bk == 0 and vol > 0:
            col = vol
        taxa = round(col / max(vol, 1) * 100, 1)
        maneira = r[6] or "coleta porta-a-porta"
        is_pickup = "coleta" in maneira.lower()
        modalidade_label = "Pickup (Coleta)" if is_pickup else "Dropoff (Balcão)"
        nome_seller = r[0] or "Seller Sem Nome"
        ponto_destino = r[7] or "N/A"

        sellers.append({
            "seller_nome": nome_seller,
            "merchant_nome": nome_seller,
            "merchant_id": r[1] or "N/A",
            "nome_cliente": r[2] or "Outros",
            "cliente": r[2] or "Outros",
            "cidade": r[3] or "",
            "estado": r[4] or "",
            "bairro": r[5] or "",
            "maneira_coleta": maneira,
            "modalidade": modalidade_label,
            "ponto_md": ponto_destino,
            "ponto_colecao": ponto_destino,
            "volume": vol,
            "coletados": col,
            "backlog": bk,
            "taxa_coleta": taxa,
            "taxa_coleta_pct": taxa,
            "status_coleta": "100% Coletado" if bk == 0 else f"{taxa}% Coletado ({bk} pendentes)"
        })

    return {"sellers": sellers, "total": len(sellers)}


@router.get("/horarios")
def get_coletas_horarios(
    dia: Optional[str] = Query(None),
    md: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Inteligência da Coluna M: Horário de Bipagem no Ponto de Coleta.
    Mapeia a curva horária (08h às 22h) e calcula a janela ideal de passagem do caminhão da ANJUN.
    """
    if not dia or dia.strip().upper() in ["", "TODOS"]:
        row_dia = db.execute(text("SELECT dia_base FROM criacao_pedidos_historico ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC LIMIT 1;")).fetchone()
        dia = row_dia[0] if row_dia else "06/10/2026"

    # Buscar MDs disponíveis para o seletor
    rows_mds = db.execute(text("""
        SELECT DISTINCT UPPER(TRIM(ponto_colecao)) 
        FROM criacao_pedidos_historico 
        WHERE dia_base LIKE :dia AND ponto_colecao IS NOT NULL AND trim(ponto_colecao) != ''
        ORDER BY 1;
    """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()
    mds_disponiveis = [r[0] for r in rows_mds if r[0]]

    # Consultar detalhe_pico_historico
    clauses = ["dia_base LIKE :dia"]
    params: Dict[str, Any] = {"dia": _normalizar_parametro_dia(dia)}

    if md and md.strip().upper() not in ["TODOS", ""]:
        clauses.append("UPPER(TRIM(md)) = :md")
        params["md"] = md.strip().upper()

    where_sql = "WHERE " + " AND ".join(clauses)

    rows_pico = db.execute(text(f"""
        SELECT hora_bipagem, SUM(volume) as vol
        FROM detalhe_pico_historico
        {where_sql}
        GROUP BY hora_bipagem
        ORDER BY CAST(hora_bipagem as INTEGER);
    """), params).fetchall()

    dict_horas = {str(r[0]).strip().zfill(2): int(r[1] or 0) for r in rows_pico if r[0]}

    # Se a tabela de pico estiver vazia para essa data, gerar curva simulada baseada na distribuição operacional real
    total_volume_pico = sum(dict_horas.values())
    if total_volume_pico == 0:
        # Busca total de pedidos da data
        tot_ped = db.execute(text("SELECT COALESCE(SUM(total_pedidos), 0) FROM criacao_pedidos_historico WHERE dia_base LIKE :dia;"), {"dia": dia}).scalar() or 20000
        # Curva típica de bipagem em First Mile / Minidrop (pico entre 14h e 17h)
        dist_padrao = {
            "08": 0.02, "09": 0.04, "10": 0.07, "11": 0.09, "12": 0.08,
            "13": 0.10, "14": 0.14, "15": 0.16, "16": 0.18, "17": 0.12,
            "18": 0.08, "19": 0.05, "20": 0.03, "21": 0.01, "22": 0.00
        }
        for h, pct in dist_padrao.items():
            dict_horas[h] = int(tot_ped * pct)
        total_volume_pico = sum(dict_horas.values())

    # Construir tabela horária completa
    horas_lista = [f"{h:02d}" for h in range(8, 23)]
    curva_horaria = []
    acumulado = 0
    maior_vol = -1
    hora_pico = "16:00"
    hora_80_pct = "17:00"
    passou_80 = False

    for h in horas_lista:
        vol = dict_horas.get(h, 0)
        acumulado += vol
        pct = round(vol / max(total_volume_pico, 1) * 100, 1)
        acum_pct = round(acumulado / max(total_volume_pico, 1) * 100, 1)

        if vol > maior_vol:
            maior_vol = vol
            hora_pico = f"{h}:00"

        if acum_pct >= 80 and not passou_80:
            hora_80_pct = f"{h}:00"
            passou_80 = True

        curva_horaria.append({
            "hora": f"{h}:00",
            "volume": vol,
            "percentual": pct,
            "acumulado_pct": acum_pct
        })

    # Recomendação logística de rota ANJUN
    # Coleta recomendada: logo após a hora de 80% atingida até 1 hora depois
    h_num = int(hora_80_pct.split(":")[0])
    janela_recomendada = f"{h_num:02d}:30 às {(h_num + 1):02d}:30"

    distribuicao_horaria = [
        {
            "hora": c["hora"],
            "rotulo": c["hora"],
            "volume": c["volume"],
            "pct": c["percentual"],
            "percentual": c["percentual"],
            "acumulado_pct": c["acumulado_pct"]
        }
        for c in curva_horaria
    ]

    return {
        "dia": dia,
        "md_filtrado": md or "Todos os Pontos",
        "total_volume": total_volume_pico,
        "total_com_horario": total_volume_pico,
        "horario_pico": hora_pico,
        "volume_pico": maior_vol,
        "janela_recomendada_anjun": janela_recomendada,
        "recomendacao_texto": f"O pico de bipagem do lojista ocorre por volta das {hora_pico}. A rota de coleta da ANJUN deve passar nesta região entre {janela_recomendada} para recolher mais de 80% dos pacotes sem gerar viagens vazias.",
        "curva_horaria": curva_horaria,
        "distribuicao_horaria": distribuicao_horaria,
        "mds_disponiveis": mds_disponiveis
    }


@router.post("/cadastrar-ponto")
def post_cadastrar_ponto(payload: CadastrarPontoPayload, db: Session = Depends(get_db)):
    """Cadastra detalhadamente um ponto/HUB/Galpão na malha e dicionário de MDs."""
    codigo = payload.md_codigo.strip().upper()
    if not codigo:
        raise HTTPException(status_code=400, detail="Código do ponto é obrigatório.")

    try:
        tipo = payload.tipo_ponto.strip() if payload.tipo_ponto else "MD (Ponto de Coleta)"
        uf = payload.estado.strip().upper()[:2]
        reg = payload.regional.strip().upper()
        cid = payload.cidade.strip().title()
        nome = payload.nome_ponto.strip() if payload.nome_ponto else codigo
        end = payload.endereco.strip() if payload.endereco else None
        cep_clean = payload.cep.strip() if payload.cep else None
        horario = payload.horario_trabalho.strip() if payload.horario_trabalho else None
        lat = payload.latitude
        lng = payload.longitude

        # Inserir ou atualizar em md_mapping
        db.execute(text("""
            INSERT OR REPLACE INTO md_mapping (md_codigo, estado, regional, tipo_ponto, ativo)
            VALUES (:cd, :uf, :reg, :tipo, 1);
        """), {
            "cd": codigo,
            "uf": uf,
            "reg": reg,
            "tipo": tipo
        })

        # Inserir ou atualizar em malha_coordenadas
        db.execute(text("""
            INSERT OR REPLACE INTO malha_coordenadas (
                md_codigo, nome_ponto, tipo_ponto, cep, endereco, horario_trabalho, 
                cidade, estado, regional, latitude, longitude, funcionando
            )
            VALUES (
                :cd, :nm, :tipo, :cep, :end, :horario,
                :cid, :uf, :reg, :lat, :lng, 'ATIVADO'
            );
        """), {
            "cd": codigo,
            "nm": nome,
            "tipo": tipo,
            "cep": cep_clean,
            "end": end or f"Cidade {cid}",
            "horario": horario or "08:00 - 18:00",
            "cid": cid,
            "uf": uf,
            "reg": reg,
            "lat": lat,
            "lng": lng
        })

        db.commit()
        return {"status": "success", "message": f"{tipo} '{codigo}' ({nome}) cadastrado com sucesso na malha!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao cadastrar ponto: {e}")


# ─────────────────────────────────────────────────────────────────
# Módulo "No Dia" (D0 / Operação em Tempo Real & Drop-off Preditivo)
# ─────────────────────────────────────────────────────────────────

@router.get("/no-dia")
def get_coletas_no_dia(
    dia: Optional[str] = Query(None, description="Data operacional DD/MM/YYYY"),
    regional: Optional[str] = Query(None),
    tipo_ponto: Optional[str] = Query("TODOS"),
    status_filtro: Optional[str] = Query("TODOS"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Retorna o monitoramento em tempo real do dia atual (D0).
    Regras Cruciais:
    1. Não exclui pontos vazios: Todos os pontos ativos na malha são preservados.
    2. Drop-off Preditivo via CEP: Pacotes criados sem ponto definido são alocados ao MD mais próximo pelo CEP.
    3. Status Inteligente: 'Operação Ativa', 'Aguardando 1ª Bipagem', 'Alerta de Backlog', 'Sem Previsão Hoje'.
    """
    # 1. Definir dia operacional (prioriza o mais recente com dados criados se não fornecido)
    dia_str = dia if isinstance(dia, str) else None
    if not dia_str or dia_str.strip().upper() in ["", "TODOS", "LATEST", "HOJE"]:
        row_dia = db.execute(text("""
            SELECT dia_base FROM criacao_pedidos_historico 
            WHERE dia_base IS NOT NULL AND dia_base != '' 
            ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC 
            LIMIT 1;
        """)).fetchone()
        dia = row_dia[0] if row_dia else datetime.now().strftime("%d/%m/%Y")
    else:
        dia = dia_str.strip()

    # Função Haversine rápida para cálculo de distância entre coordenadas
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        from math import radians, sin, cos, sqrt, asin
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
        c = 2 * asin(sqrt(a))
        return c * 6371.0

    # 2. Carregar TODOS os pontos cadastrados na malha (malha_coordenadas)
    rows_malha = db.execute(text("""
        SELECT 
            UPPER(TRIM(md_codigo)) as md_codigo,
            COALESCE(nome_ponto, md_codigo) as nome_ponto,
            COALESCE(tipo_ponto, 'MD (Ponto de Coleta)') as tipo_ponto,
            cidade,
            estado,
            regional,
            cep,
            latitude,
            longitude
        FROM malha_coordenadas
        WHERE md_codigo IS NOT NULL AND trim(md_codigo) != '';
    """)).fetchall()

    md_dict: Dict[str, Dict[str, Any]] = {}
    mds_com_coords: List[Dict[str, Any]] = []
    cep5_to_coords: Dict[str, tuple] = {}
    cep8_to_coords: Dict[str, tuple] = {}
    cidade_uf_to_mds: Dict[str, List[Dict[str, Any]]] = {}

    for r in rows_malha:
        code = str(r[0]).strip().upper()
        raw_cep = re.sub(r'\D', '', str(r[6] or ''))
        cid = (r[3] or '').strip().title()
        uf = (r[4] or '').strip().upper()
        reg = (r[5] or '').strip()
        tipo = determinar_tipo_ponto(code)
        lat = float(r[7]) if r[7] is not None else None
        lng = float(r[8]) if r[8] is not None else None

        item_md = {
            "md_codigo": code,
            "nome_ponto": r[1] or code,
            "tipo_ponto": tipo,
            "cidade": cid or "São Paulo",
            "estado": uf or "SP",
            "regional": reg or uf or "SP",
            "cep": raw_cep,
            "latitude": lat,
            "longitude": lng,
            "previstos_diretos": 0,
            "previstos_dropoff_cep": 0,
            "total_previstos": 0,
            "bipados": 0,
            "backlog": 0,
            "pendentes": 0,
            "ritmo_pct": 0.0,
            "status_operacional": "Sem Previsão Hoje"
        }
        md_dict[code] = item_md

        if lat is not None and lng is not None:
            mds_com_coords.append(item_md)
            if len(raw_cep) >= 5:
                cep5_to_coords.setdefault(raw_cep[:5], (lat, lng))
            if len(raw_cep) == 8:
                cep8_to_coords.setdefault(raw_cep, (lat, lng))

        if cid and uf:
            k_cu = f"{cid.upper()}_{uf}"
            cidade_uf_to_mds.setdefault(k_cu, []).append(item_md)

    # 3. Carregar pedidos agregados do dia
    orders_rows = db.execute(text("""
        SELECT 
            UPPER(TRIM(COALESCE(ponto_colecao, ''))) as ponto_colecao,
            COALESCE(merchant_nome, '') as merchant_nome,
            COALESCE(nome_cliente, 'Outros') as nome_cliente,
            cep_remetente,
            cidade,
            estado,
            bairro,
            COALESCE(maneira_coleta, 'Dropoff') as maneira_coleta,
            status_pedido,
            SUM(total_pedidos) as volume
        FROM criacao_pedidos_historico
        WHERE dia_base LIKE :dia
        GROUP BY UPPER(TRIM(COALESCE(ponto_colecao, ''))), merchant_nome, nome_cliente, cep_remetente, cidade, estado, bairro, maneira_coleta, status_pedido;
    """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

    vol_alocado_preditivo = 0
    dropoffs_sem_md_dict: Dict[tuple, Dict[str, Any]] = {}
    cep_routing_cache: Dict[tuple, tuple] = {}

    for row in orders_rows:
        ponto_raw = str(row[0] or '').strip().upper()
        merchant_order = str(row[1] or '').strip()
        cliente_order = str(row[2] or '').strip()
        cep_clean = re.sub(r'\D', '', str(row[3] or ''))
        cid_order = (row[4] or '').strip().title()
        uf_order = (row[5] or '').strip().upper()
        bairro_order = (row[6] or '').strip().title()
        maneira_order = str(row[7] or '').strip()
        st_order = str(row[8] or '').strip().lower()
        vol = int(row[9] or 0)

        is_bipado = st_order in ['circuito fechado', 'carregamento', 'descarregamento']
        is_backlog = st_order in ['coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando']

        # Caso A: Ponto de coleção explícito já existe na malha
        if ponto_raw and ponto_raw in md_dict:
            target = md_dict[ponto_raw]
            target["previstos_diretos"] += vol
            if is_bipado:
                target["bipados"] += vol
            elif is_backlog:
                target["backlog"] += vol
        # Caso B: Ponto de coleção novo/não cadastrado formalmente
        elif ponto_raw and ponto_raw not in ["", "NONE", "NULL", "N/A"]:
            if ponto_raw not in md_dict:
                tipo_u = determinar_tipo_ponto(ponto_raw)
                md_dict[ponto_raw] = {
                    "md_codigo": ponto_raw,
                    "nome_ponto": ponto_raw,
                    "tipo_ponto": tipo_u,
                    "cidade": cid_order or "São Paulo",
                    "estado": uf_order or "SP",
                    "regional": uf_order or "SP",
                    "cep": cep_clean,
                    "latitude": None,
                    "longitude": None,
                    "previstos_diretos": 0,
                    "previstos_dropoff_cep": 0,
                    "total_previstos": 0,
                    "bipados": 0,
                    "backlog": 0,
                    "pendentes": 0,
                    "ritmo_pct": 0.0,
                    "status_operacional": "Operação Ativa"
                }
            target = md_dict[ponto_raw]
            target["previstos_diretos"] += vol
            if is_bipado:
                target["bipados"] += vol
            elif is_backlog:
                target["backlog"] += vol
        # Caso C: Drop-off criado sem ponto definido (Atribuição preditiva por CEP e Roteirização exclusiva para MDs)
        else:
            k_geo = (cep_clean[:5] if len(cep_clean) >= 5 else cid_order, uf_order)
            if k_geo in cep_routing_cache:
                md_mais_prox, menor_dist = cep_routing_cache[k_geo]
            else:
                coords = None
                if len(cep_clean) == 8 and cep_clean in cep8_to_coords:
                    coords = cep8_to_coords[cep_clean]
                elif len(cep_clean) >= 5 and cep_clean[:5] in cep5_to_coords:
                    coords = cep5_to_coords[cep_clean[:5]]

                md_mais_prox = None
                menor_dist = None

                # Candidatos para drop-off do seller são estritamente Mini Drops (MDs)
                cands_md = [m for m in mds_com_coords if eh_md(m["md_codigo"])] or mds_com_coords

                if coords:
                    lat_p, lng_p = coords
                    candidatos = [m for m in cands_md if m["estado"] == uf_order] or cands_md
                    best_d = 9999.0
                    best_m = None
                    for m in candidatos:
                        d = _haversine_km(lat_p, lng_p, m["latitude"], m["longitude"])
                        if d < best_d:
                            best_d = d
                            best_m = m
                    if best_m:
                        md_mais_prox = best_m
                        menor_dist = round(best_d, 1)
                else:
                    k_cu = f"{cid_order.upper()}_{uf_order}"
                    if k_cu in cidade_uf_to_mds:
                        cand_cidade = [m for m in cidade_uf_to_mds[k_cu] if eh_md(m["md_codigo"])]
                        md_mais_prox = cand_cidade[0] if cand_cidade else cidade_uf_to_mds[k_cu][0]
                        menor_dist = 4.5 # Estimativa de centro municipal
                    else:
                        cand_uf = [m for m in cands_md if m["estado"] == uf_order]
                        if cand_uf:
                            md_mais_prox = cand_uf[0]
                            menor_dist = 12.0
                cep_routing_cache[k_geo] = (md_mais_prox, menor_dist)

            if md_mais_prox:
                target = md_dict.get(md_mais_prox["md_codigo"])
                if target:
                    target["previstos_dropoff_cep"] += vol
                    vol_alocado_preditivo += vol
                    if is_bipado:
                        target["bipados"] += vol
                    elif is_backlog:
                        target["backlog"] += vol

            # Registrar para a visão de Drop-offs sem Ponto
            k_group = (
                merchant_order or "Seller Não Identificado",
                cliente_order,
                cep_clean or "00000000",
                cid_order or "São Paulo",
                uf_order or "SP",
                bairro_order,
                maneira_order or "Dropoff"
            )

            if k_group not in dropoffs_sem_md_dict:
                status_rot = (
                    f"Sugerido (Raio {menor_dist} km)"
                    if (menor_dist is not None and menor_dist <= 5.0)
                    else (f"Sugerido ({cid_order})" if md_mais_prox else "Sem MD Próximo")
                )
                dropoffs_sem_md_dict[k_group] = {
                    "id": f"{cep_clean}_{merchant_order[:15]}_{len(dropoffs_sem_md_dict)}",
                    "merchant_nome": merchant_order or "Seller Não Identificado",
                    "nome_cliente": cliente_order,
                    "cep": cep_clean,
                    "cidade": cid_order or "São Paulo",
                    "estado": uf_order or "SP",
                    "bairro": bairro_order,
                    "maneira_coleta": maneira_order or "Dropoff",
                    "ponto_atual": "Vazio (Não Dropado)",
                    "volume": 0,
                    "status_pedido": st_order,
                    "md_provavel_codigo": md_mais_prox["md_codigo"] if md_mais_prox else "N/A",
                    "md_provavel_nome": md_mais_prox["nome_ponto"] if md_mais_prox else "Nenhum Ponto Próximo",
                    "md_provavel_tipo": md_mais_prox["tipo_ponto"] if md_mais_prox else "MD",
                    "distancia_km": menor_dist,
                    "status_roteirizacao": status_rot
                }
            dropoffs_sem_md_dict[k_group]["volume"] += vol

    # 4. Calcular métricas finais de cada ponto
    lista_final: List[Dict[str, Any]] = []
    tot_prev = 0
    tot_bip = 0
    tot_bkl = 0
    tot_pend = 0

    for code, m in md_dict.items():
        previsto = m["previstos_diretos"] + m["previstos_dropoff_cep"]
        m["total_previstos"] = previsto
        bip = m["bipados"]
        bkl = m["backlog"]

        if bip == 0 and bkl == 0 and previsto > 0:
            pendente = previsto
        else:
            pendente = max(0, previsto - bip)

        m["pendentes"] = pendente

        if previsto > 0:
            ritmo = round((bip / max(previsto, 1)) * 100, 1)
        else:
            ritmo = 100.0 if bip > 0 else 0.0
        m["ritmo_pct"] = min(ritmo, 100.0)

        # Status Operacional Inteligente
        if bip > 0 and (bkl > 200 or (previsto > 200 and ritmo < 40.0)):
            m["status_operacional"] = "Alerta de Backlog"
        elif bip > 0:
            m["status_operacional"] = "Operação Ativa"
        elif bip == 0 and previsto > 0:
            m["status_operacional"] = "Aguardando 1ª Bipagem"
        else:
            m["status_operacional"] = "Sem Previsão Hoje"

        tot_prev += previsto
        tot_bip += bip
        tot_bkl += bkl
        tot_pend += pendente
        lista_final.append(m)

    # 5. Aplicar filtros dinâmicos de visualização
    resultado_filtrado = lista_final

    if isinstance(regional, str) and regional.strip().upper() not in ["TODOS", ""]:
        reg_clean = regional.strip().lower()
        resultado_filtrado = [
            m for m in resultado_filtrado 
            if reg_clean in m["regional"].lower() or reg_clean == m["estado"].lower()
        ]

    if isinstance(tipo_ponto, str) and tipo_ponto.strip().upper() not in ["TODOS", ""]:
        tp_clean = tipo_ponto.strip().upper()
        resultado_filtrado = [
            m for m in resultado_filtrado 
            if tp_clean in m["tipo_ponto"].upper()
        ]

    if isinstance(status_filtro, str) and status_filtro.strip().upper() not in ["TODOS", ""]:
        sf_clean = status_filtro.strip().lower()
        resultado_filtrado = [
            m for m in resultado_filtrado 
            if sf_clean in m["status_operacional"].lower()
        ]

    if isinstance(search, str) and search.strip():
        q_low = search.strip().lower()
        resultado_filtrado = [
            m for m in resultado_filtrado 
            if q_low in m["md_codigo"].lower() 
            or q_low in m["nome_ponto"].lower() 
            or q_low in m["cidade"].lower()
            or q_low in m["estado"].lower()
        ]

    # Ordenação inteligente da rede de MDs
    ordem_status = {
        "Alerta de Backlog": 0,
        "Operação Ativa": 1,
        "Aguardando 1ª Bipagem": 2,
        "Sem Previsão Hoje": 3
    }
    resultado_filtrado.sort(key=lambda x: (
        ordem_status.get(x["status_operacional"], 9),
        -x["total_previstos"],
        -x["bipados"]
    ))

    # Lista de drop-offs sem MD ordenada pelo maior volume
    lista_dropoffs = list(dropoffs_sem_md_dict.values())
    lista_dropoffs.sort(key=lambda x: -x["volume"])

    # 6. Geração dos Alertas Operacionais Inteligentes
    alertas_operacionais: List[Dict[str, Any]] = []

    # Alerta Tipo 1: MDs com pacotes bipados e backlog aguardando coleta
    mds_com_backlog = [m for m in lista_final if m["bipados"] > 0 and (m["backlog"] > 0 or m["pendentes"] > 50)]
    mds_com_backlog.sort(key=lambda x: (-x["backlog"], -x["bipados"]))
    for m in mds_com_backlog[:4]:
        alertas_operacionais.append({
            "tipo": "COLETA_PENDENTE",
            "nivel": "warning" if m["backlog"] > 150 else "info",
            "titulo": f"Pacotes Bipados Aguardando Coleta no Ponto {m['md_codigo']}",
            "mensagem": f"O ponto {m['md_codigo']} ({m['nome_ponto']}) tem {m['bipados']:,} pacotes bipados e {m['backlog']:,} pendentes de recolhimento pelo caminhão ANJUN.",
            "md_codigo": m["md_codigo"],
            "volume": m["backlog"] or m["bipados"],
            "cidade": m["cidade"],
            "estado": m["estado"]
        })

    # Alerta Tipo 2: Concentração de Drop-off por CEP sem ponto (Raio 1 a 5 km)
    ceps_concentracao: Dict[str, Dict[str, Any]] = {}
    for d in lista_dropoffs:
        c_k = d["cep"]
        if not c_k or c_k in ["00000000", "00852000"]:
            continue
        if c_k not in ceps_concentracao:
            ceps_concentracao[c_k] = {
                "cep": c_k,
                "cidade": d["cidade"],
                "estado": d["estado"],
                "md_codigo": d["md_provavel_codigo"],
                "md_nome": d["md_provavel_nome"],
                "distancia_km": d["distancia_km"],
                "volume": 0
            }
        ceps_concentracao[c_k]["volume"] += d["volume"]

    ceps_ordenados = sorted(ceps_concentracao.values(), key=lambda x: -x["volume"])
    for c_info in ceps_ordenados[:5]:
        if c_info["volume"] >= 50:
            dist_str = f"a {c_info['distancia_km']} km" if c_info["distancia_km"] is not None else "na região"
            alertas_operacionais.append({
                "tipo": "DROPOFF_CONCENTRACAO_CEP",
                "nivel": "info",
                "titulo": f"Concentração de Drop-off no CEP {c_info['cep']}",
                "mensagem": f"Foram criados {c_info['volume']:,} pacotes no CEP {c_info['cep']} ({c_info['cidade']}/{c_info['estado']}). O MD provável mais próximo é {c_info['md_codigo']} ({c_info['md_nome']}), localizado {dist_str}.",
                "cep": c_info["cep"],
                "cidade": c_info["cidade"],
                "estado": c_info["estado"],
                "md_codigo": c_info["md_codigo"],
                "distancia_km": c_info["distancia_km"],
                "volume": c_info["volume"]
            })

    # 7. Consolidação de KPIs Executivos do Dia
    ritmo_geral = round((tot_bip / max(tot_prev, 1)) * 100, 1) if tot_prev > 0 else 0.0

    kpis = {
        "dia_operacional": dia,
        "total_previstos": tot_prev,
        "total_bipados": tot_bip,
        "total_pendentes": tot_pend,
        "total_backlog": tot_bkl,
        "ritmo_geral_pct": ritmo_geral,
        "total_mds_rede": sum(1 for m in lista_final if eh_md(m["md_codigo"])),
        "total_unidades_rede": len(lista_final),
        "total_hubs_rede": sum(1 for m in lista_final if "HUB" in m["tipo_ponto"]),
        "mds_operando": sum(1 for m in lista_final if eh_md(m["md_codigo"]) and m["status_operacional"] in ["Operação Ativa", "Alerta de Backlog"]),
        "mds_aguardando": sum(1 for m in lista_final if eh_md(m["md_codigo"]) and m["status_operacional"] == "Aguardando 1ª Bipagem"),
        "mds_alerta": sum(1 for m in lista_final if eh_md(m["md_codigo"]) and m["status_operacional"] == "Alerta de Backlog"),
        "mds_sem_previsao": sum(1 for m in lista_final if eh_md(m["md_codigo"]) and m["status_operacional"] == "Sem Previsão Hoje"),
        "vol_dropoff_preditivo_cep": vol_alocado_preditivo,
        "total_dropoffs_sem_md": sum(d["volume"] for d in lista_dropoffs),
        "qtd_sellers_sem_md": len(lista_dropoffs)
    }

    return {
        "status": "success",
        "dia_selecionado": dia,
        "kpis": kpis,
        "total_pontos": len(resultado_filtrado),
        "mds": resultado_filtrado,
        "dropoffs_sem_md": lista_dropoffs[:500],
        "total_dropoffs_sem_md": len(lista_dropoffs),
        "alertas_operacionais": alertas_operacionais
    }


# ─────────────────────────────────────────────────────────────────
# Projeto D2D SP — Fase 1 (8 Pilotos) & Fase 2 (Expansão SP)
# ─────────────────────────────────────────────────────────────────

PILOTOS_D2D_INICIAIS = [
    "HAV-01",
    "CAN-01",
    "GAS-02",
    "RLM-01",
    "CAR-01",
    "JUU-01",
    "CMS-01",
    "POE-01",
]


def _normalizar_codigo_curto(md_str: str) -> str:
    """Extrai o código base do MD (ex: 'MD-HAV-01' ou 'SP-HAV-01' -> 'HAV-01')."""
    if not md_str:
        return ""
    s = md_str.strip().upper()
    if s.startswith("MD-"):
        return s[3:]
    if s.startswith("SP-MD-"):
        return s[6:]
    return s


def _formatar_horas_perus(horas: Optional[float]) -> Optional[str]:
    if horas is None or horas <= 0:
        return None
    h_int = int(horas)
    m_int = int(round((horas - h_int) * 60))
    if m_int == 60:
        h_int += 1
        m_int = 0
    return f"{h_int}h {m_int:02d}m"


class PromoverMdD2DPayload(BaseModel):
    md_codigo: str


@router.post("/d2d-sp/promover")
def promover_md_d2d_sp(payload: PromoverMdD2DPayload, db: Session = Depends(get_db)):
    """Promove um novo MD da Fase 2 para a lista de MDs ativos do D2D SP."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS d2d_sp_pilotos_extras (
            codigo_curto TEXT PRIMARY KEY,
            md_codigo TEXT,
            adicionado_em TEXT
        );
    """))
    raw_cd = (payload.md_codigo or "").strip().upper()
    if not raw_cd:
        raise HTTPException(status_code=400, detail="Código do MD inválido.")
    curto = _normalizar_codigo_curto(raw_cd)
    full_md = raw_cd if raw_cd.startswith("MD-") else f"MD-{curto}"
    agora = datetime.now().strftime("%d/%m/%Y %H:%M")
    db.execute(text("""
        INSERT OR REPLACE INTO d2d_sp_pilotos_extras (codigo_curto, md_codigo, adicionado_em)
        VALUES (:c, :m, :dt);
    """), {"c": curto, "m": full_md, "dt": agora})
    db.commit()
    return {"status": "success", "codigo_curto": curto, "md_codigo": full_md}


@router.delete("/d2d-sp/remover/{codigo}")
def remover_md_d2d_sp(codigo: str, db: Session = Depends(get_db)):
    """Remove um MD promovido da lista extra (os 8 pilotos iniciais são fixos)."""
    curto = _normalizar_codigo_curto(codigo)
    if curto in PILOTOS_D2D_INICIAIS:
        raise HTTPException(status_code=400, detail="Os 8 MDs iniciais do projeto D2D SP são fixos da Fase 1.")
    db.execute(text("DELETE FROM d2d_sp_pilotos_extras WHERE codigo_curto = :c OR md_codigo = :m"), {"c": curto, "m": codigo.upper()})
    db.commit()
    return {"status": "success", "removido": curto}


@router.get("/d2d-sp")
def get_d2d_sp_analise(
    periodo: Optional[str] = Query("DIA"),
    dia: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    filtro_expansao: Optional[str] = Query("TODOS"),
    db: Session = Depends(get_db)
):
    """
    Painel Analítico D2D SP:
    - Fase 1: Destaque dos 8 MDs que startaram o projeto (HAV-01, CAN-01, GAS-02, RLM-01, CAR-01, JUU-01, CMS-01, POE-01)
      mostrando se teve visita, volume recebido (exceto cancelado), backlog (Coletado + Saco selado) e chegada/tempo em Perus (Descarregamento + Circuito fechado / Coluna U).
    - Fase 2: Radar de expansão para outros MDs de SP (bipagem consecutiva, retenção de backlog e tempo até Perus).
    """
    # 1. Obter todas as datas disponíveis em criacao_pedidos_historico ordenadas cronologicamente
    rows_dias = db.execute(text("""
        SELECT DISTINCT dia_base
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND dia_base != ''
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC;
    """)).fetchall()
    todos_dias_desc = [r[0] for r in rows_dias if r[0]]
    if not todos_dias_desc:
        todos_dias_desc = ["15/10/2026"]

    dia_ref = dia if (dia and dia in todos_dias_desc) else todos_dias_desc[0]
    try:
        idx_ref = todos_dias_desc.index(dia_ref)
    except ValueError:
        idx_ref = 0

    dias_ate_ref_desc = todos_dias_desc[idx_ref:]
    periodo_upper = (periodo or "DIA").strip().upper()

    if periodo_upper == "DIA":
        dias_selecionados = [dia_ref]
    elif periodo_upper in ["7D", "7DIAS", "ULTIMOS_7"]:
        dias_selecionados = dias_ate_ref_desc[:7]
    elif periodo_upper in ["15D", "15DIAS", "ULTIMOS_15"]:
        dias_selecionados = dias_ate_ref_desc[:15]
    else:
        dias_selecionados = dias_ate_ref_desc[:30]

    # Para o cálculo de dias consecutivos (streak) e matriz histórica, usamos os últimos 10 dias até dia_ref
    dias_historico_desc = dias_ate_ref_desc[:10]
    dias_historico_asc = list(reversed(dias_historico_desc))

    # 2. Carregar lista de pilotos (8 iniciais + extras promovidos)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS d2d_sp_pilotos_extras (
            codigo_curto TEXT PRIMARY KEY,
            md_codigo TEXT,
            adicionado_em TEXT
        );
    """))
    extras_rows = db.execute(text("SELECT codigo_curto FROM d2d_sp_pilotos_extras")).fetchall()
    extras_curtos = [r[0] for r in extras_rows if r[0] and r[0] not in PILOTOS_D2D_INICIAIS]
    todos_pilotos_curtos = PILOTOS_D2D_INICIAIS + extras_curtos
    pilotos_set = set(todos_pilotos_curtos)

    # 3. Metadados geográficos da malha
    malha_rows = db.execute(text("""
        SELECT UPPER(TRIM(md_codigo)), COALESCE(nome_ponto, md_codigo), COALESCE(cidade, 'São Paulo'), COALESCE(estado, 'SP'), COALESCE(regional, 'GRANDE SP'), COALESCE(endereco, '')
        FROM malha_coordenadas
        WHERE md_codigo IS NOT NULL;
    """)).fetchall()
    malha_info: Dict[str, Dict[str, str]] = {}
    for r in malha_rows:
        cd = r[0]
        curto = _normalizar_codigo_curto(cd)
        info_obj = {
            "md_codigo": cd,
            "nome_ponto": r[1] or cd,
            "cidade": r[2] or "São Paulo",
            "estado": r[3] or "SP",
            "regional": r[4] or "GRANDE SP",
            "endereco": r[5] or ""
        }
        malha_info[cd] = info_obj
        malha_info[curto] = info_obj

    # 4. Carregar tempos de chegada em Perus (Coluna U - Coluna M) da tabela d2d_perus_tempos
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS d2d_perus_tempos (
            dia_base TEXT,
            md_codigo TEXT,
            qtd_amostras INTEGER DEFAULT 0,
            media_horas_perus REAL,
            min_horas_perus REAL,
            max_horas_perus REAL,
            hora_media_bipagem TEXT,
            hora_media_perus TEXT,
            PRIMARY KEY (dia_base, md_codigo)
        );
    """))
    for col_nova in ['qtd_lacres', 'qtd_lacres_sp', 'qtd_lacres_outros']:
        try:
            db.execute(text(f"ALTER TABLE d2d_perus_tempos ADD COLUMN {col_nova} INTEGER DEFAULT 0;"))
        except Exception:
            pass

    tempos_rows = db.execute(text("""
        SELECT dia_base, UPPER(TRIM(md_codigo)), qtd_amostras, media_horas_perus, min_horas_perus, max_horas_perus,
               hora_media_bipagem, hora_media_perus,
               COALESCE(qtd_destino_sp, 0), COALESCE(qtd_destino_outros, 0), COALESCE(qtd_confirmado_perus, 0),
               COALESCE(placas_veiculos, ''), COALESCE(ajvs_veiculos, ''), COALESCE(iatas_descarga, ''),
               COALESCE(qtd_lacres, 0), COALESCE(qtd_lacres_sp, 0), COALESCE(qtd_lacres_outros, 0)
        FROM d2d_perus_tempos;
    """)).fetchall()

    # Mapa: (dia_base, codigo_curto) -> dict e fallback geral por codigo_curto
    tempos_por_dia_md: Dict[tuple, Dict[str, Any]] = {}
    tempos_geral_md: Dict[str, List[Dict[str, Any]]] = {}
    for tr in tempos_rows:
        d_b, md_c, q_a, med_h, min_h, max_h, h_bip, h_per, q_sp, q_out, q_conf, plc, ajv, iatas, q_lac, q_lac_sp, q_lac_out = tr
        if not md_c:
            continue
        curto = _normalizar_codigo_curto(md_c)
        obj_t = {
            "qtd": int(q_a or 0),
            "media_horas": float(med_h) if med_h is not None else None,
            "min_horas": float(min_h or med_h) if (min_h is not None or med_h is not None) else None,
            "max_horas": float(max_h or med_h) if (max_h is not None or med_h is not None) else None,
            "hora_bipagem": h_bip or "10:00",
            "hora_perus": h_per or "19:30",
            "qtd_destino_sp": int(q_sp or 0),
            "qtd_destino_outros": int(q_out or 0),
            "qtd_confirmado_perus": int(q_conf or 0),
            "placas_veiculos": plc or "",
            "ajvs_veiculos": ajv or "",
            "iatas_descarga": iatas or "",
            "qtd_lacres": int(q_lac or 0),
            "qtd_lacres_sp": int(q_lac_sp or 0),
            "qtd_lacres_outros": int(q_lac_out or 0)
        }
        tempos_por_dia_md[(d_b, curto)] = obj_t
        tempos_geral_md.setdefault(curto, []).append(obj_t)

    # Mapa auxiliar de hora média de bipagem em detalhe_pico_historico para dias anteriores
    pico_rows = db.execute(text("""
        SELECT UPPER(TRIM(md)), SUM(hora_bipagem * volume) * 1.0 / MAX(SUM(volume), 1)
        FROM detalhe_pico_historico
        GROUP BY UPPER(TRIM(md));
    """)).fetchall()
    hora_bip_pico_map: Dict[str, float] = {}
    for pr in pico_rows:
        if pr[0] and pr[1] is not None:
            hora_bip_pico_map[_normalizar_codigo_curto(pr[0])] = float(pr[1])

    def _obter_tempo_perus(curto: str, dias_alvo: List[str], tem_perus: bool = False) -> Dict[str, Any]:
        amostras = [tempos_por_dia_md[(d, curto)] for d in dias_alvo if (d, curto) in tempos_por_dia_md]
        is_estimado_historico = False
        if not amostras and curto in tempos_geral_md:
            amostras = tempos_geral_md[curto]
            is_estimado_historico = True

        amostras_validas = [a for a in amostras if a.get("media_horas") is not None]
        if not amostras_validas:
            if tem_perus:
                h_med_bip = hora_bip_pico_map.get(curto, 10.25)
                h_cheg = 20.35
                diff_h = round(max(3.5, h_cheg - h_med_bip), 2)
                mm_b = int(round(h_med_bip * 60)) % 1440
                mm_u = int(round(h_cheg * 60)) % 1440
                return {
                    "media_horas": diff_h,
                    "tempo_fmt": _formatar_horas_perus(diff_h) or "9h 50m",
                    "hora_bipagem": f"{mm_b // 60:02d}:{mm_b % 60:02d}",
                    "hora_perus": f"{mm_u // 60:02d}:{mm_u % 60:02d}",
                    "is_historico": True
                }
            return {
                "media_horas": None,
                "tempo_fmt": "Sem descarregamento",
                "hora_bipagem": None,
                "hora_perus": None,
                "is_historico": False
            }

        tot_q = sum(max(a["qtd"], 1) for a in amostras_validas)
        pond_h = round(sum(float(a["media_horas"]) * max(a["qtd"], 1) for a in amostras_validas) / tot_q, 2)
        return {
            "media_horas": pond_h,
            "tempo_fmt": _formatar_horas_perus(pond_h) or "N/A",
            "hora_bipagem": amostras_validas[0].get("hora_bipagem"),
            "hora_perus": amostras_validas[0].get("hora_perus"),
            "is_historico": is_estimado_historico
        }

    # 5. Consultar movimentação nos dias do histórico + dias selecionados
    dias_consulta = list(set(dias_selecionados + dias_historico_desc))
    placeholders = ", ".join([f":d{i}" for i in range(len(dias_consulta))])
    params_q = {f"d{i}": d for i, d in enumerate(dias_consulta)}

    rows_mov = db.execute(text(f"""
        SELECT 
            dia_base,
            UPPER(TRIM(ponto_colecao)) as md_raw,
            MAX(cidade) as cidade,
            MAX(estado) as estado,
            SUM(CASE WHEN LOWER(COALESCE(status_pedido, '')) NOT LIKE '%cancelad%' AND LOWER(COALESCE(status_pedido, '')) != 'foi assinado' THEN total_pedidos ELSE 0 END) as qtd_recebida,
            SUM(CASE WHEN LOWER(COALESCE(status_pedido, '')) IN ('coletado', 'saco selado') THEN total_pedidos ELSE 0 END) as qtd_backlog,
            SUM(CASE WHEN LOWER(COALESCE(status_pedido, '')) IN ('descarregamento', 'circuito fechado') THEN total_pedidos ELSE 0 END) as qtd_perus,
            SUM(CASE WHEN LOWER(COALESCE(status_pedido, '')) = 'carregamento' THEN total_pedidos ELSE 0 END) as qtd_em_transito,
            SUM(CASE WHEN LOWER(COALESCE(status_pedido, '')) = 'foi assinado' THEN total_pedidos ELSE 0 END) as qtd_assinado
        FROM criacao_pedidos_historico
        WHERE dia_base IN ({placeholders})
          AND LOWER(COALESCE(nome_cliente, '')) LIKE '%d2d%'
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
          AND UPPER(ponto_colecao) NOT LIKE '%-H%'
          AND (
              UPPER(TRIM(ponto_colecao)) LIKE 'MD-%'
              OR UPPER(TRIM(ponto_colecao)) LIKE '__-W-MD%'
          )
        GROUP BY dia_base, UPPER(TRIM(ponto_colecao));
    """), params_q).fetchall()

    # Organizar por codigo_curto e dia_base
    mov_por_md_dia: Dict[str, Dict[str, Dict[str, Any]]] = {}
    meta_por_md: Dict[str, Dict[str, str]] = {}

    for r in rows_mov:
        d_b, md_raw, cid, uf, q_rec, q_bkl, q_per, q_trn, q_ass = r
        if not md_raw:
            continue
        curto = _normalizar_codigo_curto(md_raw)
        if curto not in meta_por_md:
            m_inf = malha_info.get(curto) or malha_info.get(md_raw) or {}
            meta_por_md[curto] = {
                "md_codigo": m_inf.get("md_codigo") or md_raw,
                "codigo_curto": curto,
                "nome_ponto": m_inf.get("nome_ponto") or md_raw,
                "cidade": m_inf.get("cidade") or cid or "São Paulo",
                "estado": m_inf.get("estado") or uf or "SP",
                "regional": m_inf.get("regional") or "GRANDE SP",
                "endereco": m_inf.get("endereco") or ""
            }
        mov_por_md_dia.setdefault(curto, {})[d_b] = {
            "qtd_recebida": int(q_rec or 0),
            "qtd_backlog": int(q_bkl or 0),
            "qtd_perus": int(q_per or 0),
            "qtd_em_transito": int(q_trn or 0),
            "qtd_assinado": int(q_ass or 0)
        }

    # Garantir que todos os pilotos existam em meta_por_md mesmo se nunca biparam
    for p_curto in todos_pilotos_curtos:
        if p_curto not in meta_por_md:
            m_inf = malha_info.get(p_curto) or malha_info.get(f"MD-{p_curto}") or {}
            meta_por_md[p_curto] = {
                "md_codigo": m_inf.get("md_codigo") or f"MD-{p_curto}",
                "codigo_curto": p_curto,
                "nome_ponto": m_inf.get("nome_ponto") or f"MD-{p_curto}",
                "cidade": m_inf.get("cidade") or "São Paulo",
                "estado": m_inf.get("estado") or "SP",
                "regional": m_inf.get("regional") or "GRANDE SP",
                "endereco": m_inf.get("endereco") or ""
            }

    def _calcular_metricas_md(curto: str) -> Dict[str, Any]:
        meta = meta_por_md[curto]
        mapa_dias = mov_por_md_dia.get(curto, {})

        # Soma no período selecionado
        tot_rec = 0
        tot_bkl = 0
        tot_per = 0
        tot_trn = 0
        tot_ass = 0
        dias_visitados_periodo = 0

        for d in dias_selecionados:
            m_d = mapa_dias.get(d)
            if m_d:
                if m_d["qtd_recebida"] > 0:
                    dias_visitados_periodo += 1
                tot_rec += m_d["qtd_recebida"]
                tot_bkl += m_d["qtd_backlog"]
                tot_per += m_d["qtd_perus"]
                tot_trn += m_d["qtd_em_transito"]
                tot_ass += m_d["qtd_assinado"]

        # Calcular streak consecutivo (a partir de dia_ref voltando no tempo em dias_historico_desc)
        streak = 0
        for d in dias_historico_desc:
            m_d = mapa_dias.get(d)
            if m_d and m_d["qtd_recebida"] > 0:
                streak += 1
            else:
                break

        dias_ativos_hist = sum(1 for d in dias_historico_desc if (mapa_dias.get(d, {}).get("qtd_recebida", 0) > 0))

        # Histórico diário para matriz visual
        historico_diario = []
        for d in dias_historico_asc:
            m_d = mapa_dias.get(d, {})
            q_r = m_d.get("qtd_recebida", 0)
            q_b = m_d.get("qtd_backlog", 0)
            q_p = m_d.get("qtd_perus", 0)
            q_a = m_d.get("qtd_assinado", 0)
            t_d = _obter_tempo_perus(curto, [d], tem_perus=(q_p > 0))
            historico_diario.append({
                "dia": d,
                "dia_curto": d[:5],
                "teve_visita": q_r > 0,
                "qtd_recebida": q_r,
                "qtd_backlog": q_b,
                "qtd_perus": q_p,
                "qtd_assinado": q_a,
                "tempo_perus_fmt": t_d["tempo_fmt"] if q_p > 0 else "-"
            })

        t_info = _obter_tempo_perus(curto, dias_selecionados, tem_perus=(tot_per > 0))
        backlog_pct = round((tot_bkl / max(tot_rec, 1)) * 100, 1) if tot_rec > 0 else 0.0
        perus_pct = round((tot_per / max(tot_rec, 1)) * 100, 1) if tot_rec > 0 else 0.0
        media_diaria = int(round(tot_rec / max(dias_visitados_periodo, 1))) if dias_visitados_periodo > 0 else 0

        # Agregar métricas de Destino SP vs Outros e Caminhões estritamente das amostras do período selecionado
        amostras_p = [tempos_por_dia_md[(d, curto)] for d in dias_selecionados if (d, curto) in tempos_por_dia_md]

        tot_dest_sp = sum(a.get("qtd_destino_sp", 0) for a in amostras_p)
        tot_dest_outros = sum(a.get("qtd_destino_outros", 0) for a in amostras_p)
        tot_conf_perus = sum(a.get("qtd_confirmado_perus", 0) for a in amostras_p)
        placas_set = sorted(set(p for a in amostras_p for p in a.get("placas_veiculos", "").split(", ") if p))
        iatas_set = sorted(set(i for a in amostras_p for i in a.get("iatas_descarga", "").split(", ") if i))
        ajvs_set = sorted(set(v for a in amostras_p for v in a.get("ajvs_veiculos", "").split(", ") if v))

        tot_amostra_dest = tot_dest_sp + tot_dest_outros
        pct_dest_sp = round((tot_dest_sp / max(tot_amostra_dest, 1)) * 100, 1) if tot_amostra_dest > 0 else 0.0
        pct_conf_perus = round((tot_conf_perus / max(tot_dest_sp, 1)) * 100, 1) if tot_dest_sp > 0 else 0.0

        # ── STATUS DE RASTREABILIDADE OPERACIONAL D2D SP (AUDITORIA JUSTA) ──
        # Identifica se houve comprovação física de entrega em Perus, trânsito ou se não houve pacotes de SP
        r5_visita_ok = (tot_rec > 0)
        tem_iata_perus = "SP-RR-001" in iatas_set or "PERUS" in " ".join(iatas_set).upper()
        foi_validado_perus = (tot_conf_perus > 0 or tem_iata_perus or tot_per > 0)

        if not r5_visita_ok:
            status_rastreio = "SEM_VISITA"
            label_rastreio = "Sem Visita D2D"
            cor_status = "slate"
            motivo_rastreio = "Nenhum pacote bipado no período"
        elif tot_dest_sp == 0:
            status_rastreio = "INTERESTADUAL"
            label_rastreio = "100% Interestadual (G3/GLP)"
            cor_status = "blue"
            motivo_rastreio = "Carga sem destino SP"
        elif foi_validado_perus:
            status_rastreio = "CONFIRMADO_PERUS"
            label_rastreio = "Despachado p/ Perus"
            cor_status = "emerald"
            motivo_rastreio = f"{tot_conf_perus or tot_dest_sp} pcts confirmados em Perus"
        else:
            status_rastreio = "AGUARDANDO_CONCILIACAO"
            label_rastreio = "Aguardando Conciliação"
            cor_status = "amber"
            motivo_rastreio = f"{tot_dest_sp} pcts SP em trânsito / aguardando vínculo de descarga"

        # Indicador de responsabilidade exclusiva do MD (Backlog e Presença)
        md_operou_correto = r5_visita_ok and (backlog_pct <= 5.0)

        return {
            "codigo_curto": curto,
            "md_codigo": meta["md_codigo"],
            "nome_ponto": meta["nome_ponto"],
            "cidade": meta["cidade"],
            "estado": meta["estado"],
            "regional": meta["regional"],
            "endereco": meta["endereco"],
            "is_piloto_original": curto in PILOTOS_D2D_INICIAIS,
            "teve_visita": tot_rec > 0,
            "dias_com_visita": dias_visitados_periodo,
            "total_dias_periodo": len(dias_selecionados),
            "dias_ativos_historico": dias_ativos_hist,
            "total_dias_historico": len(dias_historico_desc),
            "streak_consecutivo": streak,
            "qtd_recebida": tot_rec,
            "media_diaria": media_diaria,
            "qtd_backlog": tot_bkl,
            "backlog_pct": backlog_pct,
            "qtd_perus": tot_per,
            "perus_pct": perus_pct,
            "qtd_em_transito": tot_trn,
            "qtd_assinado": tot_ass,
            "tempo_perus_horas": t_info["media_horas"],
            "tempo_perus_fmt": t_info["tempo_fmt"],
            "hora_media_bipagem": t_info["hora_bipagem"],
            "hora_media_perus": t_info["hora_perus"],
            "qtd_destino_sp": tot_dest_sp,
            "qtd_destino_outros": tot_dest_outros,
            "pct_destino_sp": pct_dest_sp,
            "qtd_confirmado_perus": tot_conf_perus,
            "pct_confirmado_perus": pct_conf_perus,
            "placas_veiculos": ", ".join(placas_set),
            "iatas_descarga": ", ".join(iatas_set),
            "ajvs_veiculos": ", ".join(ajvs_set),
            "historico_diario": historico_diario,
            "status_rastreio": status_rastreio,
            "label_rastreio": label_rastreio,
            "cor_status": cor_status,
            "motivo_rastreio": motivo_rastreio,
            "foi_validado_perus": foi_validado_perus,
            "md_operou_correto": md_operou_correto
        }

    # 6. Construir Fase 1: Lista de MDs Piloto D2D SP
    pilotos_lista = [_calcular_metricas_md(c) for c in todos_pilotos_curtos]

    # KPIs Consolidados da Fase 1 (Pilotos)
    tot_pilotos_rec = sum(p["qtd_recebida"] for p in pilotos_lista)
    tot_pilotos_bkl = sum(p["qtd_backlog"] for p in pilotos_lista)
    tot_pilotos_per = sum(p["qtd_perus"] for p in pilotos_lista)
    tot_pilotos_ass = sum(p["qtd_assinado"] for p in pilotos_lista)
    tot_pilotos_sp = sum(p["qtd_destino_sp"] for p in pilotos_lista)
    tot_pilotos_outros = sum(p["qtd_destino_outros"] for p in pilotos_lista)
    tot_pilotos_conf_perus = sum(p["qtd_confirmado_perus"] for p in pilotos_lista)
    pilotos_com_visita = sum(1 for p in pilotos_lista if p["teve_visita"])
    pilotos_confirmados_perus = sum(1 for p in pilotos_lista if p["status_rastreio"] == "CONFIRMADO_PERUS")
    tempos_validos_pilotos = [p["tempo_perus_horas"] for p in pilotos_lista if p["tempo_perus_horas"] is not None]
    media_horas_pilotos = round(sum(tempos_validos_pilotos) / len(tempos_validos_pilotos), 2) if tempos_validos_pilotos else None

    kpis_pilotos = {
        "total_pilotos": len(pilotos_lista),
        "pilotos_com_visita": pilotos_com_visita,
        "pilotos_sem_visita": len(pilotos_lista) - pilotos_com_visita,
        "pilotos_confirmados_perus": pilotos_confirmados_perus,
        "taxa_confirmacao_perus": round((pilotos_confirmados_perus / max(len(pilotos_lista), 1)) * 100, 1),
        "qtd_recebida_total": tot_pilotos_rec,
        "qtd_backlog_total": tot_pilotos_bkl,
        "backlog_pct_geral": round((tot_pilotos_bkl / max(tot_pilotos_rec, 1)) * 100, 1) if tot_pilotos_rec > 0 else 0.0,
        "qtd_perus_total": tot_pilotos_per,
        "perus_pct_geral": round((tot_pilotos_per / max(tot_pilotos_rec, 1)) * 100, 1) if tot_pilotos_rec > 0 else 0.0,
        "qtd_critico_assinado_total": tot_pilotos_ass,
        "qtd_destino_sp_total": tot_pilotos_sp,
        "qtd_destino_outros_total": tot_pilotos_outros,
        "pct_destino_sp_geral": round((tot_pilotos_sp / max(tot_pilotos_rec, 1)) * 100, 1) if tot_pilotos_rec > 0 else 0.0,
        "qtd_confirmado_perus_total": tot_pilotos_conf_perus,
        "pct_confirmado_perus_geral": round((tot_pilotos_conf_perus / max(tot_pilotos_sp, 1)) * 100, 1) if tot_pilotos_sp > 0 else 0.0,
        "tempo_medio_perus_horas": media_horas_pilotos,
        "tempo_medio_perus_fmt": _formatar_horas_perus(media_horas_pilotos) or "N/A"
    }

    # 7. Construir Fase 2: Candidatos de Expansão (Outros MDs de SP — nunca HUBs como SP-Z-H005)
    candidatos_lista = []
    for curto, meta in meta_por_md.items():
        if curto in pilotos_set:
            continue
        if not eh_md(meta["md_codigo"]):
            continue
        # Filtrar apenas SP
        if meta["estado"].upper() != "SP" and not meta["md_codigo"].startswith(("SP-W-MD", "MD-")):
            continue

        item = _calcular_metricas_md(curto)
        if item["qtd_recebida"] == 0 and item["dias_ativos_historico"] == 0:
            continue

        # Classificação de elegibilidade para Fase 2
        if item["streak_consecutivo"] >= 4 and item["backlog_pct"] <= 10.0 and item["qtd_recebida"] >= 100:
            status_exp = "Pronto para Expansão"
        elif item["streak_consecutivo"] >= 3 and item["backlog_pct"] > 10.0:
            status_exp = "Atenção: Retém Backlog"
        elif item["streak_consecutivo"] >= 3:
            status_exp = "Consistente (Volume Moderado)"
        else:
            status_exp = "Bipagem Intermitente"

        item["status_expansao"] = status_exp
        candidatos_lista.append(item)

    # Filtros de busca e tipo na Fase 2
    filtro_exp_upper = (filtro_expansao or "TODOS").strip().upper()
    if filtro_exp_upper == "PRONTOS":
        candidatos_lista = [c for c in candidatos_lista if c["status_expansao"] == "Pronto para Expansão"]
    elif filtro_exp_upper == "COM_BACKLOG":
        candidatos_lista = [c for c in candidatos_lista if c["qtd_backlog"] > 0]
    elif filtro_exp_upper == "CONSECUTIVOS":
        candidatos_lista = [c for c in candidatos_lista if c["streak_consecutivo"] >= 3]

    if search and search.strip():
        q = search.strip().lower()
        candidatos_lista = [
            c for c in candidatos_lista
            if q in c["codigo_curto"].lower()
            or q in c["md_codigo"].lower()
            or q in c["cidade"].lower()
            or q in c["status_expansao"].lower()
        ]

    # Ordenar candidatos priorizando maior streak consecutivo e maior volume recebido
    candidatos_lista.sort(key=lambda x: (-x["streak_consecutivo"], -x["dias_ativos_historico"], -x["qtd_recebida"]))

    return {
        "status": "success",
        "periodo_selecionado": periodo_upper,
        "dia_referencia": dia_ref,
        "dias_considerados": dias_selecionados,
        "dias_historico_matriz": [d[:5] for d in dias_historico_asc],
        "todos_dias_disponiveis": todos_dias_desc,
        "kpis_pilotos": kpis_pilotos,
        "pilotos": pilotos_lista,
        "candidatos_expansao": candidatos_lista[:200],
        "total_candidatos": len(candidatos_lista)
    }


@router.post("/d2d-sp/upload-caminhoes")
async def post_upload_caminhoes_d2d(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Recebe a planilha 'Monitoramento de dados de caminhões de carga e descarga' (.xlsx/.csv),
    grava os registros de veículos/rotas e cruza com os pacotes D2D para confirmar a IATA de descarga (SP-RR-001 Perus).
    """
    try:
        import io
        from python_calamine import CalamineWorkbook

        content = await file.read()
        try:
            wb = CalamineWorkbook.from_filelike(io.BytesIO(content))
        except Exception:
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tf:
                tf.write(content)
                tf_path = tf.name
            wb = CalamineWorkbook.from_path(tf_path)

        rows = wb.get_sheet_by_index(0).to_python()
        if not rows or len(rows) < 2:
            raise HTTPException(status_code=400, detail="Planilha de caminhões vazia ou inválida.")

        db.execute(text("""
            CREATE TABLE IF NOT EXISTS d2d_caminhoes_monitoramento (
                ajv TEXT PRIMARY KEY,
                placa TEXT,
                carregador_nome TEXT,
                rede_carregador TEXT,
                endereco_carregamento TEXT,
                tempo_carregamento TEXT,
                seguinte_secao TEXT,
                descarregador_nome TEXT,
                rede_descarregador TEXT,
                endereco_descarga TEXT,
                tempo_descarregamento TEXT,
                sacos_carregados REAL,
                sacos_descarregados REAL,
                votos_carregados REAL,
                votos_descarregados REAL,
                tipo_veiculo TEXT
            );
        """))

        inserts = []
        for r in rows[1:]:
            if not r or not r[0]:
                continue
            ajv = str(r[0]).strip()
            if not ajv:
                continue
            placa = str(r[1]).strip() if len(r) > 1 and r[1] else ""
            carr_nm = str(r[2]).strip() if len(r) > 2 and r[2] else ""
            rede_carr = str(r[3]).strip() if len(r) > 3 and r[3] else ""
            end_carr = str(r[4]).strip() if len(r) > 4 and r[4] else ""
            t_carr = str(r[5]).strip() if len(r) > 5 and r[5] else ""
            seg_sec = str(r[6]).strip() if len(r) > 6 and r[6] else ""
            desc_nm = str(r[7]).strip() if len(r) > 7 and r[7] else ""
            rede_desc = str(r[8]).strip() if len(r) > 8 and r[8] else ""
            end_desc = str(r[9]).strip() if len(r) > 9 and r[9] else ""
            t_desc = str(r[10]).strip() if len(r) > 10 and r[10] else ""
            sc_c = float(r[11]) if len(r) > 11 and r[11] is not None and str(r[11]) != '' else 0.0
            sc_d = float(r[12]) if len(r) > 12 and r[12] is not None and str(r[12]) != '' else 0.0
            vt_c = float(r[14]) if len(r) > 14 and r[14] is not None and str(r[14]) != '' else 0.0
            vt_d = float(r[15]) if len(r) > 15 and r[15] is not None and str(r[15]) != '' else 0.0
            tipo_v = str(r[18]).strip() if len(r) > 18 and r[18] else ""
            inserts.append({
                "ajv": ajv, "plc": placa, "cnm": carr_nm, "rcarr": rede_carr, "ecarr": end_carr, "tcarr": t_carr,
                "ssec": seg_sec, "dnm": desc_nm, "rdesc": rede_desc, "edesc": end_desc, "tdesc": t_desc,
                "scc": sc_c, "scd": sc_d, "vtc": vt_c, "vtd": vt_d, "tpv": tipo_v
            })

        if inserts:
            # Batch insert in chunks of 500
            for i in range(0, len(inserts), 500):
                chunk = inserts[i:i+500]
                db.execute(text("""
                    INSERT OR REPLACE INTO d2d_caminhoes_monitoramento
                    (ajv, placa, carregador_nome, rede_carregador, endereco_carregamento, tempo_carregamento,
                     seguinte_secao, descarregador_nome, rede_descarregador, endereco_descarga, tempo_descarregamento,
                     sacos_carregados, sacos_descarregados, votos_carregados, votos_descarregados, tipo_veiculo)
                    VALUES (:ajv, :plc, :cnm, :rcarr, :ecarr, :tcarr, :ssec, :dnm, :rdesc, :edesc, :tdesc,
                            :scc, :scd, :vtc, :vtd, :tpv);
                """), chunk)
            db.commit()

        # Cruzamento automático com d2d_perus_tempos (dados da Central de Coletas)
        reconciled_count = 0
        try:
            truck_rows = db.execute(text(
                "SELECT ajv, placa, rede_descarregador, endereco_descarga FROM d2d_caminhoes_monitoramento;"
            )).fetchall()
            truck_map = {r[0]: (r[1] or "", r[2] or "", r[3] or "") for r in truck_rows if r and r[0]}

            d2d_rows = db.execute(text("""
                SELECT dia_base, md_codigo, ajvs_veiculos, qtd_destino_sp, qtd_confirmado_perus 
                FROM d2d_perus_tempos 
                WHERE ajvs_veiculos IS NOT NULL AND ajvs_veiculos != '';
            """)).fetchall()

            updates = []
            for dia, md, ajvs_str, q_sp, q_conf in d2d_rows:
                ajvs = [a.strip() for a in (ajvs_str or "").split(',') if a.strip()]
                placas = set()
                iatas = set()
                foi_perus = False
                for a in ajvs:
                    if a in truck_map:
                        plc, iata, end = truck_map[a]
                        if plc: placas.add(plc)
                        if iata: iatas.add(iata)
                        if iata == 'SP-RR-001' or 'perus' in (end or "").lower():
                            foi_perus = True
                if placas or iatas:
                    placas_txt = ", ".join(sorted(placas))[:200]
                    iatas_txt = ", ".join(sorted(iatas))[:200]
                    novo_conf = q_sp if (foi_perus and (q_conf == 0 or q_conf is None)) else (q_conf or 0)
                    updates.append({
                        "dia": dia, "md": md, "plc": placas_txt, "iata": iatas_txt, "conf": novo_conf
                    })
                    reconciled_count += 1

            if updates:
                for u in updates:
                    db.execute(text("""
                        UPDATE d2d_perus_tempos
                        SET placas_veiculos = :plc, iatas_descarga = :iata, qtd_confirmado_perus = :conf
                        WHERE dia_base LIKE :dia AND md_codigo = :md;
                    """), u)
                db.commit()
        except Exception as err_reconcile:
            print(f"[Aviso] Erro na reconciliação D2D x Caminhões: {err_reconcile}")

        return {
            "status": "success",
            "message": f"Planilha de caminhões processada! {len(inserts):,} viagens cadastradas e {reconciled_count} MDs cruzados com os dados da Central de Coletas."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao processar planilha de caminhões: {str(e)}")


@router.get("/metricas-completas")
def get_metricas_completas(dia: Optional[str] = None, db: Session = Depends(get_db)):
    """Retorna indicadores aprofundados baseados na tabela completa de 66 colunas."""
    try:
        # Se dia não foi informado, pegar o mais recente
        if not dia:
            row_dia = db.execute(text("SELECT MAX(dia_base) FROM operacional_pedidos_completo;")).fetchone()
            dia = row_dia[0] if row_dia and row_dia[0] else None

        if not dia:
            return {"status": "sem_dados", "mensagem": "Nenhuma carga operacional encontrada ainda."}

        # 1. Totais Gerais (Pacotes, Peso, Valor Declarado)
        row_totais = db.execute(text("""
            SELECT 
                COUNT(*) as total_pacotes,
                ROUND(SUM(peso_kg), 2) as peso_total_kg,
                ROUND(AVG(peso_kg), 3) as peso_medio_kg,
                ROUND(SUM(valor_declarado), 2) as valor_total_declarado,
                ROUND(AVG(valor_declarado), 2) as ticket_medio,
                SUM(is_destino_sp) as pacotes_sp,
                SUM(1 - is_destino_sp) as pacotes_outras_ufs
            FROM operacional_pedidos_completo
            WHERE dia_base LIKE :dia;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchone()

        # 2. Distribuição por Merchant (Shein, Temu, etc.)
        rows_merchants = db.execute(text("""
            SELECT 
                COALESCE(merchant_nome, 'Outros') as merchant,
                COUNT(*) as total,
                ROUND(SUM(peso_kg), 2) as peso_kg,
                ROUND(SUM(valor_declarado), 2) as valor_total
            FROM operacional_pedidos_completo
            WHERE dia_base LIKE :dia
            GROUP BY merchant_nome
            ORDER BY total DESC
            LIMIT 10;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

        # 3. Top UFs de Destino
        rows_ufs = db.execute(text("""
            SELECT 
                COALESCE(destinatario_uf, 'N/D') as uf,
                COUNT(*) as total,
                ROUND(SUM(peso_kg), 2) as peso_kg
            FROM operacional_pedidos_completo
            WHERE dia_base LIKE :dia
            GROUP BY destinatario_uf
            ORDER BY total DESC
            LIMIT 10;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

        # 4. Top Cidades de Entrega em SP
        rows_cidades_sp = db.execute(text("""
            SELECT 
                destinatario_cidade as cidade,
                COUNT(*) as total
            FROM operacional_pedidos_completo
            WHERE dia_base LIKE :dia AND is_destino_sp = 1
            GROUP BY destinatario_cidade
            ORDER BY total DESC
            LIMIT 10;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

        # 5. Resumo de Backlog do Dia Anterior
        row_bk = db.execute(text("""
            SELECT 
                COUNT(*) as total_dia,
                SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'pendente', 'aguardando', 'no ponto')
                         OR (LOWER(status_pedido) NOT IN ('circuito fechado', 'carregamento', 'descarregamento', 'foi assinado', 'cancelado') AND status_pedido IS NOT NULL)
                         THEN 1 ELSE 0 END) as backlog_total,
                SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento', 'foi assinado') 
                         THEN 1 ELSE 0 END) as coletados_caminhao
            FROM operacional_pedidos_completo
            WHERE dia_base LIKE :dia;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchone()

        rows_top_bk = db.execute(text("""
            SELECT 
                ponto_colecao,
                COUNT(*) as volume_total,
                SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'pendente', 'aguardando', 'no ponto')
                         OR (LOWER(status_pedido) NOT IN ('circuito fechado', 'carregamento', 'descarregamento', 'foi assinado', 'cancelado') AND status_pedido IS NOT NULL)
                         THEN 1 ELSE 0 END) as backlog_retido,
                SUM(is_destino_sp) as sp_bipados,
                SUM(1 - is_destino_sp) as outros_bipados
            FROM operacional_pedidos_completo
            WHERE dia_base LIKE :dia
              AND ponto_colecao IS NOT NULL
              AND TRIM(ponto_colecao) NOT IN ('', 'NAN', 'NONE', 'NULL', '-')
              AND UPPER(ponto_colecao) NOT LIKE '%-H%'
              AND (
                  UPPER(TRIM(ponto_colecao)) LIKE 'MD-%'
                  OR UPPER(TRIM(ponto_colecao)) LIKE '__-W-MD%'
              )
            GROUP BY ponto_colecao
            HAVING backlog_retido > 0
            ORDER BY backlog_retido DESC
            LIMIT 10;
        """), {"dia": _normalizar_parametro_dia(dia)}).fetchall()

        top_mds_bk_list = [
            {
                "md_codigo": r[0],
                "volume_total": int(r[1] or 0),
                "backlog_retido": int(r[2] or 0),
                "sp_bipados": int(r[3] or 0),
                "outros_bipados": int(r[4] or 0)
            }
            for r in rows_top_bk
        ]

        total_d = int(row_bk[0] or 0)
        bk_tot = int(row_bk[1] or 0)
        col_cam = int(row_bk[2] or 0)

        return {
            "status": "sucesso",
            "dia_base": dia,
            "resumo": {
                "total_pacotes": int(row_totais[0] or 0),
                "peso_total_kg": float(row_totais[1] or 0.0),
                "peso_medio_kg": float(row_totais[2] or 0.0),
                "valor_total_declarado": float(row_totais[3] or 0.0),
                "ticket_medio": float(row_totais[4] or 0.0),
                "pacotes_sp": int(row_totais[5] or 0),
                "pacotes_outras_ufs": int(row_totais[6] or 0)
            },
            "resumo_backlog": {
                "total_dia": total_d,
                "backlog_total": bk_tot,
                "coletados_caminhao": col_cam,
                "taxa_coleta_pct": round((col_cam / max(total_d, 1)) * 100, 1),
                "top_mds_backlog": top_mds_bk_list
            },
            "top_merchants": [
                {"merchant": r[0], "total": r[1], "peso_kg": r[2], "valor_total": r[3]}
                for r in rows_merchants
            ],
            "top_ufs": [
                {"uf": r[0], "total": r[1], "peso_kg": r[2]}
                for r in rows_ufs
            ],
            "top_cidades_sp": [
                {"cidade": r[0], "total": r[1]}
                for r in rows_cidades_sp
            ]
        }
    except Exception as e:
        return {"status": "erro", "detalhe": str(e)}





# === LINHA DO TEMPO & EVENTOS DA MALHA ===

class NotaDiarioBordoPayload(BaseModel):
    dia_base: str
    categoria: Optional[str] = "OPERACIONAL"
    ponto_codigo: Optional[str] = ""
    titulo: str
    descricao: Optional[str] = ""
    autor: Optional[str] = "Torre de Controle"


def _garantir_tabela_diario_bordo(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS diario_bordo_operacional (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_base TEXT NOT NULL,
            categoria TEXT DEFAULT 'OPERACIONAL',
            ponto_codigo TEXT DEFAULT '',
            titulo TEXT NOT NULL,
            descricao TEXT DEFAULT '',
            autor TEXT DEFAULT 'Torre de Controle',
            criado_em TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """))
    db.commit()


def _normalizar_categoria_malha_evento(codigo: str, tipo_raw: str = "") -> str:
    t = (tipo_raw or "").strip().upper()
    c = (codigo or "").strip().upper()
    if t in ["HUB", "MINIDROP", "PONTO DE REDE", "PONTO DE APOIO"]:
        return t
    if "HUB" in t or "GALP" in t or "TRANSFER" in t or "CD" in t:
        return "HUB"
    if "APOIO" in t or "P.A" in t or "BASE" in t:
        return "PONTO DE APOIO"
    if "REDE" in t or "CROSS" in t or "FRANQUIA" in t:
        return "PONTO DE REDE"
    if "MD" in t or "MINIDROP" in t or "PONTO DE COLETA" in t:
        return "MINIDROP"
    if c.startswith("MD-") or re.match(r"^[A-Z]{2}-W-MD", c):
        return "MINIDROP"
    if "-H" in c or c.startswith("HUB") or "GLP" in c:
        return "HUB"
    if "-PA" in c or "-RR-" in c:
        return "PONTO DE APOIO"
    return "PONTO DE REDE"


def _dia_para_iso(dia_str: str) -> str:
    if not dia_str or len(dia_str) < 10:
        return "0000-00-00"
    return f"{dia_str[6:10]}-{dia_str[3:5]}-{dia_str[0:2]}"


def construir_indice_eventos_malha(db: Session) -> Dict[str, Any]:
    """Constrói o índice histórico completo de eventos da malha (estreia do 1º pacote bipado por ponto,
    clientes e sellers estreantes por data, paradas súbitas, linha do tempo diária e catálogo de estreia)."""
    _garantir_tabela_diario_bordo(db)

    # 1. Metadados de pontos cadastrados (md_mapping + malha_coordenadas)
    meta_pontos: Dict[str, Dict[str, str]] = {}
    try:
        rows_mc = db.execute(text("""
            SELECT UPPER(TRIM(md_codigo)), COALESCE(cidade, ''), COALESCE(uf, ''), COALESCE(tipo, '')
            FROM malha_coordenadas
            WHERE md_codigo IS NOT NULL AND TRIM(md_codigo) != ''
        """)).fetchall()
        for r in rows_mc:
            cd = r[0]
            meta_pontos[cd] = {
                "cidade": r[1] or "São Paulo",
                "estado": r[2] or (cd[:2] if len(cd) >= 2 and cd[:2].isalpha() else "SP"),
                "tipo_ponto": _normalizar_categoria_malha_evento(cd, r[3] or ""),
            }
    except Exception:
        pass

    try:
        rows_mm = db.execute(text("""
            SELECT UPPER(TRIM(md_codigo)), COALESCE(cidade, ''), COALESCE(estado, ''), COALESCE(tipo_ponto, '')
            FROM md_mapping
            WHERE md_codigo IS NOT NULL AND TRIM(md_codigo) != ''
        """)).fetchall()
        for r in rows_mm:
            cd = r[0]
            prev = meta_pontos.get(cd, {})
            meta_pontos[cd] = {
                "cidade": r[1] or prev.get("cidade") or "São Paulo",
                "estado": r[2] or prev.get("estado") or (cd[:2] if len(cd) >= 2 and cd[:2].isalpha() else "SP"),
                "tipo_ponto": _normalizar_categoria_malha_evento(cd, r[3] or prev.get("tipo_ponto") or ""),
            }
    except Exception:
        pass

    # 2. Movimentação diária por ponto em criacao_pedidos_historico e detalhe_md_historico
    # Estrutura: mov_dia_ponto[dia][ponto] = vol
    mov_dia_ponto: Dict[str, Dict[str, int]] = {}

    rows_cp = db.execute(text("""
        SELECT 
            dia_base,
            UPPER(TRIM(ponto_colecao)) as ponto,
            SUM(total_pedidos) as vol,
            MAX(cidade) as cidade,
            MAX(estado) as estado
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY dia_base, UPPER(TRIM(ponto_colecao))
        HAVING SUM(total_pedidos) > 0;
    """)).fetchall()

    for r in rows_cp:
        d = str(r[0]).strip()
        pt = str(r[1]).strip()
        vol = int(r[2] or 0)
        if vol <= 0:
            continue
        mov_dia_ponto.setdefault(d, {})[pt] = vol
        if pt not in meta_pontos:
            meta_pontos[pt] = {
                "cidade": r[3] or "São Paulo",
                "estado": r[4] or (pt[:2] if len(pt) >= 2 and pt[:2].isalpha() else "SP"),
                "tipo_ponto": _normalizar_categoria_malha_evento(pt, ""),
            }
        else:
            if not meta_pontos[pt].get("cidade") and r[3]:
                meta_pontos[pt]["cidade"] = r[3]
            if not meta_pontos[pt].get("estado") and r[4]:
                meta_pontos[pt]["estado"] = r[4]

    rows_dm = db.execute(text("""
        SELECT 
            dia_base,
            UPPER(TRIM(md)) as ponto,
            SUM(total) as vol
        FROM detalhe_md_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
          AND md IS NOT NULL
          AND TRIM(md) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(md) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(md) NOT LIKE '%ANJUN%'
        GROUP BY dia_base, UPPER(TRIM(md))
        HAVING SUM(total) > 0;
    """)).fetchall()

    for r in rows_dm:
        d = str(r[0]).strip()
        pt = str(r[1]).strip()
        vol = int(r[2] or 0)
        if vol <= 0:
            continue
        dia_dict = mov_dia_ponto.setdefault(d, {})
        if pt not in dia_dict:
            dia_dict[pt] = vol
        if pt not in meta_pontos:
            meta_pontos[pt] = {
                "cidade": "São Paulo",
                "estado": pt[:2] if len(pt) >= 2 and pt[:2].isalpha() else "SP",
                "tipo_ponto": _normalizar_categoria_malha_evento(pt, ""),
            }

    # 3. Ordenar datas cronologicamente (da mais antiga para a mais recente)
    dias_cronologicos = sorted(mov_dia_ponto.keys(), key=_dia_para_iso)
    dia_mais_recente = dias_cronologicos[-1] if dias_cronologicos else ""

    # 4. Percorrer histórico cronológico de pontos
    historico_ponto: Dict[str, Dict[str, Any]] = {}
    eventos_por_dia: Dict[str, Dict[str, Any]] = {}

    pontos_dia_anterior: Dict[str, int] = {}
    dia_anterior_str: str = ""

    for d in dias_cronologicos:
        pontos_hoje = mov_dia_ponto.get(d, {})
        vol_total_dia = sum(pontos_hoje.values())
        estreias_pontos_dia = []
        pontos_pararam_dia = []
        pontos_retornaram_dia = []

        for pt, vol in sorted(pontos_hoje.items(), key=lambda x: x[1], reverse=True):
            info_meta = meta_pontos.get(pt, {
                "cidade": "São Paulo",
                "estado": "SP",
                "tipo_ponto": _normalizar_categoria_malha_evento(pt, ""),
            })
            if pt not in historico_ponto:
                historico_ponto[pt] = {
                    "md_codigo": pt,
                    "tipo_ponto": info_meta["tipo_ponto"],
                    "cidade": info_meta["cidade"],
                    "estado": info_meta["estado"],
                    "data_primeiro_pacote": d,
                    "iso_primeiro_pacote": _dia_para_iso(d),
                    "volume_primeiro_dia": vol,
                    "data_ultimo_pacote": d,
                    "iso_ultimo_pacote": _dia_para_iso(d),
                    "volume_ultimo_dia": vol,
                    "maior_volume_dia": vol,
                    "data_maior_volume": d,
                    "dias_operando": 1,
                    "volume_total_historico": vol,
                }
                estreias_pontos_dia.append({
                    "md_codigo": pt,
                    "tipo_ponto": info_meta["tipo_ponto"],
                    "cidade": info_meta["cidade"],
                    "estado": info_meta["estado"],
                    "volume_estreia": vol,
                    "dia_estreia": d,
                })
            else:
                hp = historico_ponto[pt]
                hp["data_ultimo_pacote"] = d
                hp["iso_ultimo_pacote"] = _dia_para_iso(d)
                hp["volume_ultimo_dia"] = vol
                hp["dias_operando"] += 1
                hp["volume_total_historico"] += vol
                if vol > hp["maior_volume_dia"]:
                    hp["maior_volume_dia"] = vol
                    hp["data_maior_volume"] = d
                if pontos_dia_anterior and pt not in pontos_dia_anterior:
                    pontos_retornaram_dia.append({
                        "md_codigo": pt,
                        "tipo_ponto": info_meta["tipo_ponto"],
                        "cidade": info_meta["cidade"],
                        "estado": info_meta["estado"],
                        "volume_hoje": vol,
                        "primeiro_dia": hp["data_primeiro_pacote"],
                    })

        if pontos_dia_anterior:
            for pt_ant, vol_ant in sorted(pontos_dia_anterior.items(), key=lambda x: x[1], reverse=True):
                if pt_ant not in pontos_hoje:
                    info_meta = meta_pontos.get(pt_ant, {
                        "cidade": "São Paulo",
                        "estado": "SP",
                        "tipo_ponto": _normalizar_categoria_malha_evento(pt_ant, ""),
                    })
                    pontos_pararam_dia.append({
                        "md_codigo": pt_ant,
                        "tipo_ponto": info_meta["tipo_ponto"],
                        "cidade": info_meta["cidade"],
                        "estado": info_meta["estado"],
                        "volume_dia_anterior": vol_ant,
                        "dia_anterior": dia_anterior_str,
                    })

        top_pontos_dia = [
            {
                "md_codigo": pt,
                "tipo_ponto": meta_pontos.get(pt, {}).get("tipo_ponto", _normalizar_categoria_malha_evento(pt, "")),
                "cidade": meta_pontos.get(pt, {}).get("cidade", "São Paulo"),
                "estado": meta_pontos.get(pt, {}).get("estado", "SP"),
                "volume": vol,
            }
            for pt, vol in sorted(pontos_hoje.items(), key=lambda x: x[1], reverse=True)[:8]
        ]

        eventos_por_dia[d] = {
            "dia": d,
            "dia_anterior": dia_anterior_str,
            "volume_total": vol_total_dia,
            "pontos_ativos": len(pontos_hoje),
            "estreias_pontos": estreias_pontos_dia,
            "pontos_pararam": pontos_pararam_dia[:25],
            "qtd_pontos_pararam": len(pontos_pararam_dia),
            "pontos_retornaram": pontos_retornaram_dia[:20],
            "qtd_pontos_retornaram": len(pontos_retornaram_dia),
            "estreias_clientes": [],
            "estreias_sellers": [],
            "qtd_estreias_sellers": 0,
            "top_pontos": top_pontos_dia,
            "notas_manuais": [],
        }

        pontos_dia_anterior = pontos_hoje
        dia_anterior_str = d

    # 5. Estreia de Clientes e Sellers (em criacao_pedidos_historico)
    rows_cli_dia = db.execute(text("""
        SELECT 
            dia_base,
            TRIM(nome_cliente) as cliente,
            SUM(total_pedidos) as vol,
            COUNT(DISTINCT UPPER(TRIM(ponto_colecao))) as qtd_pontos
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
          AND nome_cliente IS NOT NULL AND TRIM(nome_cliente) NOT IN ('', 'nan', 'None')
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY dia_base, TRIM(nome_cliente)
        HAVING SUM(total_pedidos) > 0;
    """)).fetchall()

    cli_por_dia: Dict[str, List[Any]] = {}
    for r in rows_cli_dia:
        cli_por_dia.setdefault(str(r[0]).strip(), []).append((str(r[1]).strip(), int(r[2] or 0), int(r[3] or 0)))

    clientes_vistos = set()
    for d in dias_cronologicos:
        novos_cli = []
        for cli_nome, vol_c, q_pts in sorted(cli_por_dia.get(d, []), key=lambda x: x[1], reverse=True):
            key_c = cli_nome.lower()
            if key_c not in clientes_vistos:
                clientes_vistos.add(key_c)
                novos_cli.append({
                    "cliente": cli_nome,
                    "volume_estreia": vol_c,
                    "qtd_pontos": q_pts,
                    "dia_estreia": d,
                })
        if d in eventos_por_dia:
            eventos_por_dia[d]["estreias_clientes"] = novos_cli

    rows_sel_dia = db.execute(text("""
        SELECT 
            dia_base,
            TRIM(merchant_nome) as seller,
            MAX(TRIM(nome_cliente)) as cliente,
            MAX(UPPER(TRIM(ponto_colecao))) as ponto,
            MAX(cidade) as cidade,
            MAX(estado) as estado,
            SUM(total_pedidos) as vol
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
          AND merchant_nome IS NOT NULL AND TRIM(merchant_nome) NOT IN ('', 'nan', 'None', 'Seller Não Identificado')
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY dia_base, TRIM(merchant_nome)
        HAVING SUM(total_pedidos) > 0;
    """)).fetchall()

    sel_por_dia: Dict[str, List[Any]] = {}
    for r in rows_sel_dia:
        sel_por_dia.setdefault(str(r[0]).strip(), []).append(r)

    sellers_vistos = set()
    for d in dias_cronologicos:
        novos_sel = []
        for r in sorted(sel_por_dia.get(d, []), key=lambda x: int(x[6] or 0), reverse=True):
            s_nome = str(r[1]).strip()
            key_s = s_nome.lower()
            if key_s not in sellers_vistos:
                sellers_vistos.add(key_s)
                novos_sel.append({
                    "merchant_nome": s_nome,
                    "cliente": r[2] or "N/A",
                    "ponto_colecao": r[3] or "N/A",
                    "cidade": r[4] or "São Paulo",
                    "estado": r[5] or "SP",
                    "volume_estreia": int(r[6] or 0),
                    "dia_estreia": d,
                })
        if d in eventos_por_dia:
            eventos_por_dia[d]["qtd_estreias_sellers"] = len(novos_sel)
            eventos_por_dia[d]["estreias_sellers"] = novos_sel[:30]

    # 6. Notas Manuais do Diário de Bordo Operacional
    rows_notas = db.execute(text("""
        SELECT id, dia_base, categoria, ponto_codigo, titulo, descricao, autor, criado_em
        FROM diario_bordo_operacional
        ORDER BY id DESC;
    """)).fetchall()

    todas_notas = []
    for rn in rows_notas:
        nota_obj = {
            "id": rn[0],
            "dia_base": rn[1],
            "categoria": rn[2] or "OPERACIONAL",
            "ponto_codigo": rn[3] or "",
            "titulo": rn[4] or "",
            "descricao": rn[5] or "",
            "autor": rn[6] or "Torre de Controle",
            "criado_em": rn[7] or "",
        }
        todas_notas.append(nota_obj)
        if rn[1] in eventos_por_dia:
            eventos_por_dia[rn[1]]["notas_manuais"].append(nota_obj)

    # 7. Construir consolidações mensais (MES:MM/YYYY) em eventos_por_dia
    meses_map: Dict[str, List[str]] = {}
    for d in dias_cronologicos:
        if len(d) == 10 and d[2] == "/" and d[5] == "/":
            meses_map.setdefault(d[3:10], []).append(d)

    for mes_ano, dias_do_mes in meses_map.items():
        chave_mes = f"MES:{mes_ano}"
        estreias_pts_mes = []
        estreias_cli_mes = []
        estreias_sel_mes = []
        qtd_sel_mes = 0
        notas_mes = []
        vol_mes = 0
        pontos_ativos_mes_dict: Dict[str, int] = {}

        for dm in sorted(dias_do_mes, key=_dia_para_iso, reverse=True):
            ev_d = eventos_por_dia.get(dm, {})
            vol_mes += int(ev_d.get("volume_total", 0))
            estreias_pts_mes.extend(ev_d.get("estreias_pontos", []))
            estreias_cli_mes.extend(ev_d.get("estreias_clientes", []))
            estreias_sel_mes.extend(ev_d.get("estreias_sellers", []))
            qtd_sel_mes += int(ev_d.get("qtd_estreias_sellers", 0))
            notas_mes.extend(ev_d.get("notas_manuais", []))
            for pt, v in mov_dia_ponto.get(dm, {}).items():
                pontos_ativos_mes_dict[pt] = pontos_ativos_mes_dict.get(pt, 0) + v

        top_pts_mes = [
            {
                "md_codigo": pt,
                "tipo_ponto": meta_pontos.get(pt, {}).get("tipo_ponto", _normalizar_categoria_malha_evento(pt, "")),
                "cidade": meta_pontos.get(pt, {}).get("cidade", "São Paulo"),
                "estado": meta_pontos.get(pt, {}).get("estado", "SP"),
                "volume": vol,
            }
            for pt, vol in sorted(pontos_ativos_mes_dict.items(), key=lambda x: x[1], reverse=True)[:10]
        ]

        eventos_por_dia[chave_mes] = {
            "dia": chave_mes,
            "dia_anterior": f"{len(dias_do_mes)} dias no mês {mes_ano}",
            "volume_total": vol_mes,
            "pontos_ativos": len(pontos_ativos_mes_dict),
            "estreias_pontos": estreias_pts_mes,
            "pontos_pararam": [],
            "qtd_pontos_pararam": 0,
            "pontos_retornaram": [],
            "qtd_pontos_retornaram": 0,
            "estreias_clientes": estreias_cli_mes,
            "estreias_sellers": estreias_sel_mes[:50],
            "qtd_estreias_sellers": qtd_sel_mes,
            "top_pontos": top_pts_mes,
            "notas_manuais": notas_mes,
        }

    # 8. Catálogo Completo de Estreia de Pontos (ordenado pela estreia mais recente primeiro, depois maior volume)
    catalogo_pontos = []
    pontos_ativos_ultimo_dia = set(mov_dia_ponto.get(dia_mais_recente, {}).keys())
    for pt, hp in historico_ponto.items():
        dias_op = max(int(hp["dias_operando"]), 1)
        vol_tot = int(hp["volume_total_historico"])
        catalogo_pontos.append({
            **hp,
            "media_diaria": round(vol_tot / dias_op, 1),
            "ativo_ultimo_dia": pt in pontos_ativos_ultimo_dia,
        })

    catalogo_pontos.sort(
        key=lambda x: (x["iso_primeiro_pacote"], x["volume_primeiro_dia"]),
        reverse=True,
    )

    # 9. Linha do Tempo Cronológica (do dia mais recente para o mais antigo)
    linha_do_tempo = []
    for d in reversed(dias_cronologicos):
        ev = eventos_por_dia[d]
        linha_do_tempo.append({
            "dia": d,
            "volume_total": ev["volume_total"],
            "pontos_ativos": ev["pontos_ativos"],
            "qtd_estreias_pontos": len(ev["estreias_pontos"]),
            "estreias_pontos_resumo": [
                {
                    "md_codigo": p["md_codigo"],
                    "tipo_ponto": p["tipo_ponto"],
                    "volume_estreia": p["volume_estreia"],
                }
                for p in ev["estreias_pontos"][:8]
            ],
            "qtd_estreias_clientes": len(ev["estreias_clientes"]),
            "qtd_estreias_sellers": ev["qtd_estreias_sellers"],
            "qtd_pontos_pararam": ev["qtd_pontos_pararam"],
            "qtd_pontos_retornaram": ev["qtd_pontos_retornaram"],
            "qtd_notas": len(ev["notas_manuais"]),
        })

    return {
        "dia_mais_recente": dia_mais_recente,
        "total_pontos_historico": len(catalogo_pontos),
        "total_dias_historico": len(dias_cronologicos),
        "catalogo_pontos": catalogo_pontos,
        "linha_do_tempo": linha_do_tempo,
        "eventos_por_dia": eventos_por_dia,
        "todas_notas": todas_notas,
    }


@router.get("/eventos-dia")
def get_eventos_dia(
    dia: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Retorna os eventos operacionais de uma data ou mês específico, além do catálogo histórico de estreia
    de todos os pontos da malha e da linha do tempo dia a dia."""
    indice = construir_indice_eventos_malha(db)
    dia_alvo = (dia or "").strip()
    if not dia_alvo or dia_alvo.upper() in ["TODOS", "LATEST", "HOJE"]:
        dia_alvo = indice["dia_mais_recente"]

    eventos_dia = indice["eventos_por_dia"].get(dia_alvo)
    if not eventos_dia and len(dia_alvo) == 7 and dia_alvo[2] == "/":
        eventos_dia = indice["eventos_por_dia"].get(f"MES:{dia_alvo}")

    if not eventos_dia:
        eventos_dia = {
            "dia": dia_alvo,
            "dia_anterior": "",
            "volume_total": 0,
            "pontos_ativos": 0,
            "estreias_pontos": [],
            "pontos_pararam": [],
            "qtd_pontos_pararam": 0,
            "pontos_retornaram": [],
            "qtd_pontos_retornaram": 0,
            "estreias_clientes": [],
            "estreias_sellers": [],
            "qtd_estreias_sellers": 0,
            "top_pontos": [],
            "notas_manuais": [],
        }

    return {
        "dia_selecionado": dia_alvo,
        "dia_mais_recente": indice["dia_mais_recente"],
        "total_pontos_historico": indice["total_pontos_historico"],
        "total_dias_historico": indice["total_dias_historico"],
        "eventos_dia": eventos_dia,
        "catalogo_pontos": indice["catalogo_pontos"],
        "linha_do_tempo": indice["linha_do_tempo"],
    }


@router.post("/eventos-nota")
def adicionar_nota_diario_bordo(
    payload: NotaDiarioBordoPayload,
    db: Session = Depends(get_db)
):
    """Adiciona um registro manual no Diário de Bordo Operacional de uma data."""
    _garantir_tabela_diario_bordo(db)
    if not payload.titulo or not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="O título do registro é obrigatório.")

    dia_b = (payload.dia_base or "").strip()
    if dia_b.upper().startswith("MES:"):
        dia_b = f"01/{dia_b[4:]}"

    db.execute(text("""
        INSERT INTO diario_bordo_operacional (dia_base, categoria, ponto_codigo, titulo, descricao, autor)
        VALUES (:dia_base, :categoria, :ponto_codigo, :titulo, :descricao, :autor)
    """), {
        "dia_base": dia_b,
        "categoria": (payload.categoria or "OPERACIONAL").strip().upper(),
        "ponto_codigo": (payload.ponto_codigo or "").strip().upper(),
        "titulo": payload.titulo.strip(),
        "descricao": (payload.descricao or "").strip(),
        "autor": (payload.autor or "Torre de Controle").strip(),
    })
    db.commit()
    return {"status": "sucesso", "mensagem": "Evento registrado no Diário de Bordo!"}


@router.delete("/eventos-nota/{nota_id}")
def remover_nota_diario_bordo(
    nota_id: int,
    db: Session = Depends(get_db)
):
    """Remove uma nota manual do Diário de Bordo Operacional."""
    _garantir_tabela_diario_bordo(db)
    db.execute(text("DELETE FROM diario_bordo_operacional WHERE id = :id"), {"id": nota_id})
    db.commit()
    return {"status": "sucesso"}



@router.get("/reconciliacao-pacotes")
def get_reconciliacao_pacotes_endpoint(db: Session = Depends(get_db)):
    """Retorna o painel de reconciliação de pacotes atualizados retroativamente e pacotes há X dias sem atualização."""
    from services.reconciliacao_pacotes import construir_painel_atualizacoes_e_aging
    return construir_painel_atualizacoes_e_aging(db)
