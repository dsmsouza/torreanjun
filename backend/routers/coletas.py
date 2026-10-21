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
    """Verifica se o ponto é estritamente um Mini Drop (MD).
    Regra ANJUN: MD é tudo o que começa com 'MD-' ou '[UF]-W-MD' (ex: SP-W-MD, RJ-W-MD, MG-W-MD, etc.).
    Unidades como SP-Z-H005 são HUBs e NÃO são MDs.
    """
    if not codigo:
        return False
    c = str(codigo).strip().upper()
    return bool(c.startswith("MD-") or re.match(r"^[A-Z]{2}-W-MD", c))


def determinar_tipo_ponto(codigo: str) -> str:
    """Classifica com precisão o tipo da unidade na malha conforme convenção operacional:
    - MD (Ponto de Coleta): prefixos 'MD-' ou '[UF]-W-MD' (ex: SP-W-MD, RJ-W-MD, MG-W-MD)
    - HUB (Transferência): unidades contendo '-H', '-Z-H', '-W-H', 'HUB-' (ex: SP-Z-H005, SP-Z-H001, RJ-W-H001)
    - Galpão / CD (Distribuição): prefixos 'WR-GLP', 'GLP', 'CD'
    - Ponto de Apoio / Base: prefixos contendo '-PA', '-RR-'
    """
    if not codigo:
        return "Outros"
    c = str(codigo).strip().upper()
    if c.startswith("MD-") or re.match(r"^[A-Z]{2}-W-MD", c):
        return "MD (Ponto de Coleta)"
    if re.search(r"-[ZWA]-H|HUB-|-H\d{2,4}$|-H0|-H1|-H2|-H3", c) or c.startswith("HUB") or "HUB" in c:
        return "HUB (Transferência)"
    if c.startswith("WR-GLP") or "GLP" in c or "GALPAO" in c or "CD" in c:
        return "Galpão / CD (Distribuição)"
    if "-PA" in c or "-RR-" in c:
        return "Ponto de Apoio / Base"
    return "Outros"


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
    
    return {"dias": todos_dias, "dia_recente": dia_recente}


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
        "dia_base = :dia",
        "ponto_colecao IS NOT NULL",
        "TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')",
        "UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'",
        "UPPER(ponto_colecao) NOT LIKE '%ANJUN%'"
    ]
    params: Dict[str, Any] = {"dia": dia}

    if cliente and cliente.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(nome_cliente) = :cli")
        params["cli"] = cliente.strip().lower()

    if regional and regional.strip().upper() not in ["TODOS", ""]:
        clauses.append("LOWER(estado) = :reg")
        params["reg"] = regional.strip().lower()

    where_sql = "WHERE " + " AND ".join(clauses)

    # 2. Obter totais da tabela criacao_pedidos_historico
    tot_row = db.execute(text(f"""
        SELECT 
            COALESCE(SUM(total_pedidos), 0) as total,
            COUNT(DISTINCT CASE WHEN ponto_colecao IS NOT NULL AND trim(ponto_colecao) != '' THEN ponto_colecao END) as total_mds,
            COUNT(DISTINCT CASE WHEN merchant_nome IS NOT NULL AND trim(merchant_nome) != '' THEN merchant_nome END) as total_sellers,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%entrega%' OR LOWER(maneira_coleta) LIKE '%dropoff%' THEN total_pedidos ELSE 0 END) as vol_dropoff,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%' THEN total_pedidos ELSE 0 END) as vol_pickup
        FROM criacao_pedidos_historico
        {where_sql};
    """), params).fetchone()

    total_pedidos = int(tot_row[0] or 0)
    total_mds = int(tot_row[1] or 0)
    total_sellers = int(tot_row[2] or 0)
    coletados = int(tot_row[3] or 0)
    backlog = int(tot_row[4] or 0)
    vol_dropoff = int(tot_row[5] or 0)
    vol_pickup = int(tot_row[6] or 0)

    # Fallback para detalhe_md_historico se criacao_pedidos_historico estiver vazio nesta data
    if total_pedidos == 0:
        row_md_tot = db.execute(text("""
            SELECT 
                COALESCE(SUM(total), 0) as total,
                COUNT(DISTINCT CASE WHEN md IS NOT NULL AND trim(md) != '' THEN md END) as total_mds,
                COALESCE(SUM(carregamento + descarregamento), 0) as coletados,
                COALESCE(SUM(backlog), 0) as backlog
            FROM detalhe_md_historico
            WHERE dia_base = :dia;
        """), {"dia": dia}).fetchone()
        if row_md_tot and (row_md_tot[0] or 0) > 0:
            total_pedidos = int(row_md_tot[0] or 0)
            total_mds = int(row_md_tot[1] or 0)
            coletados = int(row_md_tot[2] or 0)
            backlog = int(row_md_tot[3] or 0)
            vol_dropoff = total_pedidos
            vol_pickup = 0

    # Fallback se backlog + coletados não baterem
    if coletados == 0 and backlog == 0 and total_pedidos > 0:
        coletados = total_pedidos

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
        WHERE dia_base = :dia
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY UPPER(TRIM(ponto_colecao));
    """), {"dia": dia}).fetchall()

    pontos_dia_dict = {r[0]: int(r[1] or 0) for r in rows_pontos_dia if r[0]}

    # Identificar Pontos Não Cadastrados
    pontos_nao_cadastrados = []
    for ponto, vol in pontos_dia_dict.items():
        if ponto not in cadastrados_set and "SP-R-TFK001" not in ponto and "ANJUN" not in ponto:
            pontos_nao_cadastrados.append({
                "md_codigo": ponto,
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
            WHERE c.dia_base = :dia
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
        """), {"dia": dia}).fetchall()
        for r in rows_desvios:
            desvios_pickup_em_md.append({
                "md_codigo": r[0],
                "nome_ponto": r[1] or r[0],
                "volume": int(r[2] or 0)
            })
    except Exception:
        pass

    # 4. Distribuição de Clientes
    clientes_rows = db.execute(text(f"""
        SELECT 
            nome_cliente, 
            SUM(total_pedidos) as volume,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado', 'pendente', 'aguardando') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        {where_sql}
        GROUP BY nome_cliente
        ORDER BY SUM(total_pedidos) DESC;
    """), params).fetchall()

    clientes_breakdown = []
    for c in clientes_rows:
        c_nome = c[0] or "Outros"
        c_vol = int(c[1] or 0)
        c_col = int(c[2] or 0)
        c_bkl = int(c[3] or 0)
        if c_col == 0 and c_bkl == 0 and c_vol > 0:
            c_col = c_vol
        c_pct = round((c_vol / max(total_pedidos, 1) * 100), 1)
        c_taxa = round((c_col / max(c_vol, 1) * 100), 1)
        clientes_breakdown.append({
            "cliente": c_nome,
            "nome_cliente": c_nome,
            "volume": c_vol,
            "coletados": c_col,
            "backlog": c_bkl,
            "taxa_pct": c_taxa,
            "pct_total": c_pct,
            "share_pct": c_pct
        })

    kpis_data = {
        "total_pedidos": total_pedidos,
        "total_mds": total_mds,
        "total_sellers": total_sellers,
        "total_coletados": coletados,
        "coletados": coletados,
        "backlog_md": backlog,
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
        "dia_base = :dia",
        "ponto_colecao IS NOT NULL",
        "TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')",
        "UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'",
        "UPPER(ponto_colecao) NOT LIKE '%ANJUN%'"
    ]
    params: Dict[str, Any] = {"dia": dia}

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
            WHERE dia_base = :dia AND md IS NOT NULL AND trim(md) != ''
            GROUP BY UPPER(TRIM(md))
            ORDER BY SUM(total) DESC;
        """), {"dia": dia}).fetchall()

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

        # Filtros rápidos
        filtro_upper = (filtro_tipo or "").strip().upper()
        if filtro_upper in ["BACKLOG", "COM_BACKLOG"] and bk_p == 0:
            continue
        if filtro_upper in ["PRIMEIRA_BIPAGEM", "PRIMEIRA_VEZ", "1A_BIPAGEM"] and not is_primeira:
            continue
        vol_pk = int(r[7] or 0)
        vol_dp = int(r[8] or 0)
        tipo_pt = determinar_tipo_ponto(md) if (not cad_info.get("tipo_ponto") or "-H" in md or "HUB" in md or eh_md(md)) else (cad_info.get("tipo_ponto") or "MD (Ponto de Coleta)")
        is_desvio_pk = (eh_md(md) and vol_pk > 0)

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

    # Incluir pontos cadastrados que não biparam no dia mas estão sem bipagem há 5+ dias (se filtro permitir)
    filtro_upper = (filtro_tipo or "").strip().upper()
    if filtro_upper in ["TODOS", "", "SEM_BIPAGEM", "DORMENTE"]:
        for md_cad, c_info in cad_map.items():
            if md_cad in mds_processados_set or "TFK" in md_cad or "ANJUN" in md_cad:
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
                    "tipo_ponto": c_info.get("tipo_ponto") or "MD (Ponto de Coleta)",
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

    clauses = ["dia_base = :dia", "merchant_nome IS NOT NULL", "trim(merchant_nome) != ''"]
    params: Dict[str, Any] = {"dia": dia}

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
            WHERE dia_base = :dia AND nome_cliente IS NOT NULL AND trim(nome_cliente) != ''
            GROUP BY nome_cliente, cidade, md
            ORDER BY SUM(total) DESC
            LIMIT :limit;
        """), {"dia": dia, "limit": limit}).fetchall()

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
        WHERE dia_base = :dia AND ponto_colecao IS NOT NULL AND trim(ponto_colecao) != ''
        ORDER BY 1;
    """), {"dia": dia}).fetchall()
    mds_disponiveis = [r[0] for r in rows_mds if r[0]]

    # Consultar detalhe_pico_historico
    clauses = ["dia_base = :dia"]
    params: Dict[str, Any] = {"dia": dia}

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
        tot_ped = db.execute(text("SELECT COALESCE(SUM(total_pedidos), 0) FROM criacao_pedidos_historico WHERE dia_base = :dia;"), {"dia": dia}).scalar() or 20000
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
        WHERE dia_base = :dia
        GROUP BY UPPER(TRIM(COALESCE(ponto_colecao, ''))), merchant_nome, nome_cliente, cep_remetente, cidade, estado, bairro, maneira_coleta, status_pedido;
    """), {"dia": dia}).fetchall()

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

    # 7. Construir Fase 2: Candidatos de Expansão (Outros MDs de SP)
    candidatos_lista = []
    for curto, meta in meta_por_md.items():
        if curto in pilotos_set:
            continue
        # Filtrar apenas SP
        if meta["estado"].upper() != "SP" and not meta["md_codigo"].startswith(("SP-", "MD-")):
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
                        WHERE dia_base = :dia AND md_codigo = :md;
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
            WHERE dia_base = :dia;
        """), {"dia": dia}).fetchone()

        # 2. Distribuição por Merchant (Shein, Temu, etc.)
        rows_merchants = db.execute(text("""
            SELECT 
                COALESCE(merchant_nome, 'Outros') as merchant,
                COUNT(*) as total,
                ROUND(SUM(peso_kg), 2) as peso_kg,
                ROUND(SUM(valor_declarado), 2) as valor_total
            FROM operacional_pedidos_completo
            WHERE dia_base = :dia
            GROUP BY merchant_nome
            ORDER BY total DESC
            LIMIT 10;
        """), {"dia": dia}).fetchall()

        # 3. Top UFs de Destino
        rows_ufs = db.execute(text("""
            SELECT 
                COALESCE(destinatario_uf, 'N/D') as uf,
                COUNT(*) as total,
                ROUND(SUM(peso_kg), 2) as peso_kg
            FROM operacional_pedidos_completo
            WHERE dia_base = :dia
            GROUP BY destinatario_uf
            ORDER BY total DESC
            LIMIT 10;
        """), {"dia": dia}).fetchall()

        # 4. Top Cidades de Entrega em SP
        rows_cidades_sp = db.execute(text("""
            SELECT 
                destinatario_cidade as cidade,
                COUNT(*) as total
            FROM operacional_pedidos_completo
            WHERE dia_base = :dia AND is_destino_sp = 1
            GROUP BY destinatario_cidade
            ORDER BY total DESC
            LIMIT 10;
        """), {"dia": dia}).fetchall()

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
            WHERE dia_base = :dia;
        """), {"dia": dia}).fetchone()

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
            WHERE dia_base = :dia
              AND ponto_colecao IS NOT NULL
              AND TRIM(ponto_colecao) NOT IN ('', 'NAN', 'NONE', 'NULL', '-')
            GROUP BY ponto_colecao
            HAVING backlog_retido > 0
            ORDER BY backlog_retido DESC
            LIMIT 10;
        """), {"dia": dia}).fetchall()

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



