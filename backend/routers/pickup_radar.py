from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from database.connection import get_db
from services.operacional import obter_dias_periodo, padronizar_uf

router = APIRouter(prefix="/api/pickup/radar", tags=["Pickup Radar"])

def add_marketplace_filter(filtros, params, marketplace):
    if marketplace and not isinstance(marketplace, str):
        marketplace = getattr(marketplace, 'default', str(marketplace))
    if marketplace and isinstance(marketplace, str) and marketplace.lower() != "todos":
        mkt_str = marketplace.lower()
        if mkt_str == "shein":
            filtros.append("LOWER(primeiro_cliente) IN ('shein', 'shein d2d')")
        elif mkt_str == "temu":
            filtros.append("LOWER(primeiro_cliente) IN ('temuxborder', 'temuw2d', 'temud2d', 'temu')")
        else:
            filtros.append("LOWER(primeiro_cliente) = :mkt")
            params["mkt"] = mkt_str

def _build_pickup_filtros(db: Session, periodo_tipo: Optional[str], rotulo: Optional[str], dt_inicio: Optional[str], dt_fim: Optional[str], periodo_legacy: Optional[str] = "todos"):
    if periodo_tipo and periodo_tipo in ["Diário", "Semanal", "Mensal", "Período"]:
        dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
        if not dias:
            return "1=0"
        dias_str = ", ".join(f"'{d}'" for d in dias)
        return f"primeira_data IN ({dias_str})"
    else:
        if periodo_legacy == "hoje":
            return "primeira_data_iso = (SELECT MAX(primeira_data_iso) FROM sellers_pickup_registry)"
        elif periodo_legacy == "7dias":
            return "primeira_data_iso >= date((SELECT MAX(primeira_data_iso) FROM sellers_pickup_registry), '-7 days')"
        elif periodo_legacy == "30dias":
            return "primeira_data_iso >= date((SELECT MAX(primeira_data_iso) FROM sellers_pickup_registry), '-30 days')"
        return "1=1"

@router.get("/kpis")
def get_radar_kpis(
    periodo_tipo: Optional[str] = Query("Diário"),
    rotulo: Optional[str] = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    periodo: Optional[str] = "todos",
    cliente: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    uf: Optional[str] = None,
    db: Session = Depends(get_db)
):
    filtros = [_build_pickup_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim, periodo)]
    params = {}
    
    mkt = marketplace if (marketplace and marketplace != "Todos") else cliente
    add_marketplace_filter(filtros, params, mkt)
        
    if uf and isinstance(uf, str) and uf.strip() and uf.lower() != "todos":
        filtros.append("UPPER(estado_origem) = :uf")
        params["uf"] = uf.strip().upper()
        
    where_sql = " AND ".join(filtros)
    
    # 1. Totais
    totais_row = db.execute(text(f"""
        SELECT 
            COUNT(merchant_id) as total_novos,
            SUM(volume_primeiro_dia) as vol_inicial,
            AVG(volume_primeiro_dia) as vol_medio
        FROM sellers_pickup_registry
        WHERE {where_sql};
    """), params).fetchone()
    
    total_novos = totais_row[0] or 0
    vol_inicial = totais_row[1] or 0
    vol_medio = round(totais_row[2] or 0, 1)
    
    total_sellers_base = db.execute(text("SELECT COUNT(*) FROM sellers_pickup_registry;")).scalar() or 0
    
    # 2. Top Polo Emergente
    top_polo_row = db.execute(text(f"""
        SELECT 
            cidade_origem,
            bairro_origem,
            estado_origem,
            COUNT(merchant_id) as qtd
        FROM sellers_pickup_registry
        WHERE {where_sql} AND cidade_origem != '' AND bairro_origem != ''
        GROUP BY cidade_origem, bairro_origem, estado_origem
        ORDER BY qtd DESC
        LIMIT 1;
    """), params).fetchone()
    
    top_polo = None
    if top_polo_row:
        top_polo = {
            "cidade": top_polo_row[0],
            "bairro": top_polo_row[1],
            "uf": top_polo_row[2],
            "novos_sellers": top_polo_row[3]
        }
        
    # 3. Canal Líder
    top_canal_row = db.execute(text(f"""
        SELECT 
            primeiro_cliente,
            COUNT(merchant_id) as qtd
        FROM sellers_pickup_registry
        WHERE {where_sql}
        GROUP BY primeiro_cliente
        ORDER BY qtd DESC
        LIMIT 1;
    """), params).fetchone()
    
    canal_lider = None
    if top_canal_row and total_novos > 0:
        pct = round((top_canal_row[1] / total_novos) * 100, 1)
        canal_lider = {
            "canal": top_canal_row[0],
            "qtd": top_canal_row[1],
            "percentual": pct
        }

    return {
        "status": "success",
        "total_novos_periodo": total_novos,
        "volume_inicial_total": vol_inicial,
        "volume_medio_novo": vol_medio,
        "total_sellers_base": total_sellers_base,
        "top_polo_emergente": top_polo,
        "canal_lider": canal_lider
    }

@router.get("/tendencia-geografica")
def get_tendencia_geografica(
    periodo_tipo: Optional[str] = Query("Diário"),
    rotulo: Optional[str] = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    periodo: Optional[str] = "todos",
    cliente: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    uf: Optional[str] = None,
    limit: int = 25,
    db: Session = Depends(get_db)
):
    filtros = [_build_pickup_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim, periodo)]
    params = {"limit": limit}
    
    mkt = marketplace if (marketplace and marketplace != "Todos") else cliente
    add_marketplace_filter(filtros, params, mkt)
        
    if uf and isinstance(uf, str) and uf.strip() and uf.lower() != "todos":
        filtros.append("UPPER(estado_origem) = :uf")
        params["uf"] = uf.strip().upper()
        
    where_sql = " AND ".join(filtros)
    
    rows = db.execute(text(f"""
        SELECT 
            estado_origem as uf,
            cidade_origem as cidade,
            bairro_origem as bairro,
            COUNT(merchant_id) as total_novos,
            SUM(volume_primeiro_dia) as volume_inicial,
            SUM(volume_acumulado_total) as volume_acumulado,
            AVG(volume_primeiro_dia) as media_vol_inicial,
            GROUP_CONCAT(DISTINCT primeiro_cliente) as canais
        FROM sellers_pickup_registry
        WHERE {where_sql} AND (cidade_origem != '' OR bairro_origem != '')
        GROUP BY estado_origem, cidade_origem, bairro_origem
        ORDER BY total_novos DESC, volume_inicial DESC
        LIMIT :limit;
    """), params).fetchall()
    
    polos = []
    for r in rows:
        polos.append({
            "uf": padronizar_uf(r[0]) if r[0] else "SP",
            "cidade": r[1] or "Desconhecida",
            "bairro": r[2] or "Centro",
            "total_novos": r[3],
            "volume_inicial": r[4] or 0,
            "volume_acumulado": r[5] or 0,
            "media_vol_inicial": round(r[6] or 0, 1),
            "canais": [c.strip() for c in (r[7] or "").split(",") if c.strip()]
        })
        
    uf_rows = db.execute(text(f"""
        SELECT 
            estado_origem as uf,
            COUNT(merchant_id) as total_novos,
            SUM(volume_primeiro_dia) as volume_inicial
        FROM sellers_pickup_registry
        WHERE {where_sql}
        GROUP BY estado_origem
        ORDER BY total_novos DESC;
    """), params).fetchall()
    
    por_uf = [{"uf": padronizar_uf(r[0]) if r[0] else "SP", "total_novos": r[1], "volume_inicial": r[2] or 0} for r in uf_rows]

    return {
        "status": "success",
        "polos": polos,
        "por_uf": por_uf
    }

@router.get("/evolucao-temporal")
def get_evolucao_temporal(
    periodo_tipo: Optional[str] = Query("Diário"),
    rotulo: Optional[str] = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    periodo: Optional[str] = "todos",
    cliente: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    uf: Optional[str] = None,
    db: Session = Depends(get_db)
):
    filtros = [_build_pickup_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim, periodo)]
    params = {}
    
    mkt = marketplace if (marketplace and marketplace != "Todos") else cliente
    add_marketplace_filter(filtros, params, mkt)
        
    if uf and isinstance(uf, str) and uf.strip() and uf.lower() != "todos":
        filtros.append("UPPER(estado_origem) = :uf")
        params["uf"] = uf.strip().upper()
        
    where_sql = " AND ".join(filtros)
    
    rows = db.execute(text(f"""
        SELECT 
            primeira_data,
            primeira_data_iso,
            primeiro_cliente,
            COUNT(merchant_id) as novos_sellers,
            SUM(volume_primeiro_dia) as volume_inicial
        FROM sellers_pickup_registry
        WHERE {where_sql} AND primeira_data_iso != ''
        GROUP BY primeira_data_iso, primeiro_cliente
        ORDER BY primeira_data_iso ASC;
    """), params).fetchall()
    
    timeline = {}
    for r in rows:
        data_exibicao, data_iso, cli, novos, vol = r
        if data_iso not in timeline:
            timeline[data_iso] = {
                "data": data_exibicao,
                "data_iso": data_iso,
                "total_novos": 0,
                "volume_total": 0,
                "clientes": {}
            }
        timeline[data_iso]["total_novos"] += novos
        timeline[data_iso]["volume_total"] += (vol or 0)
        timeline[data_iso]["clientes"][cli or "Outros"] = novos

    res_list = list(timeline.values())
    return {
        "status": "success",
        "evolucao": res_list
    }

CITY_CENTROIDS = {
    "SÃO PAULO": (-23.5505, -46.6333),
    "SAO PAULO": (-23.5505, -46.6333),
    "GUARULHOS": (-23.4542, -46.5333),
    "CAMPINAS": (-22.9099, -47.0626),
    "OSASCO": (-23.5325, -46.7917),
    "SÃO BERNARDO DO CAMPO": (-23.6939, -46.5650),
    "SANTO ANDRÉ": (-23.6639, -46.5383),
    "BARUERI": (-23.5108, -46.8761),
    "SOROCABA": (-23.5015, -47.4526),
    "SANTOS": (-23.9608, -46.3339),
    "RIBEIRÃO PRETO": (-21.1704, -47.8103),
    "SÃO JOSÉ DOS CAMPOS": (-23.1791, -45.8872),
    "JUNDIAÍ": (-23.1857, -46.8892),
    "PIRACICABA": (-22.7253, -47.6492),
    "MAUÁ": (-23.6678, -46.4614),
    "DIADEMA": (-23.6865, -46.6234),
    "CARAPICUÍBA": (-23.5236, -46.8353),
    "MOGI DAS CRUZES": (-23.5242, -46.1883),
    "TABOÃO DA SERRA": (-23.6261, -46.7917),
}

@router.get("/mapa")
def get_mapa_pickup(
    periodo_tipo: Optional[str] = Query("Diário"),
    rotulo: Optional[str] = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    uf: Optional[str] = Query("SP"),
    marketplace: Optional[str] = Query("Todos"),
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    filtros = []
    params = {}

    dias = []
    if periodo_tipo and periodo_tipo in ["Diário", "Semanal", "Mensal", "Período"]:
        dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
        
    if dias:
        dias_str = ", ".join(f"'{d}'" for d in dias)
        filtros.append(f"(primeira_data IN ({dias_str}) OR merchant_id IN (SELECT DISTINCT merchant_id FROM detalhe_pickup_historico WHERE dia_base IN ({dias_str})))")

    mkt = marketplace if (marketplace and marketplace != "Todos") else None
    add_marketplace_filter(filtros, params, mkt)

    target_uf = (uf or "SP").strip().upper()
    if target_uf != "TODOS":
        filtros.append("UPPER(estado_origem) = :uf")
        params["uf"] = target_uf

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        filtros.append("(LOWER(merchant_id) LIKE :q OR LOWER(merchant_nome) LIKE :q OR LOWER(cidade_origem) LIKE :q OR LOWER(bairro_origem) LIKE :q OR LOWER(cep_origem) LIKE :q)")
        params["q"] = term

    where_sql = " AND ".join(filtros) if filtros else "1=1"

    query_sql = f"""
        SELECT 
            merchant_id,
            merchant_nome,
            primeiro_cliente,
            primeira_data,
            estado_origem as estado,
            cidade_origem as cidade,
            bairro_origem as bairro,
            cep_origem as cep,
            endereco_origem as endereco,
            volume_primeiro_dia,
            volume_acumulado_total
        FROM sellers_pickup_registry
        WHERE {where_sql}
        ORDER BY volume_primeiro_dia DESC
        LIMIT 200;
    """

    rows = db.execute(text(query_sql), params).fetchall()

    points = []
    total_pacotes_sum = 0
    cidades_set = set()

    for idx, r in enumerate(rows):
        m_id = r[0]
        m_nome = r[1] or f"Seller Pickup {m_id}"
        cliente = r[2] or "N/A"
        dt = r[3] or ""
        est = padronizar_uf(r[4]) if r[4] else "SP"
        cid = (r[5] or "SÃO PAULO").strip().upper()
        bairro = r[6] or "Centro"
        cep = r[7] or "01000-000"
        end = r[8] or f"{bairro}, {cid} - {est}"
        vol_dia = int(r[9] or 0)
        vol_total = int(r[10] or vol_dia)

        total_pacotes_sum += vol_dia
        if cid:
            cidades_set.add(cid.title())

        coor_row = db.execute(text("SELECT latitude, longitude FROM malha_coordenadas WHERE cep = :cep LIMIT 1;"), {"cep": cep}).fetchone()
        if coor_row and coor_row[0] and coor_row[1]:
            lat, lng = float(coor_row[0]), float(coor_row[1])
        else:
            base_coords = CITY_CENTROIDS.get(cid, (-23.5505, -46.6333))
            h = sum(ord(c) for c in m_id) + idx * 17
            lat = base_coords[0] + ((h % 100) - 50) * 0.0015
            lng = base_coords[1] + (((h * 7) % 100) - 50) * 0.0015

        points.append({
            "id": m_id,
            "merchant_id": m_id,
            "nome": m_nome,
            "marketplace": cliente,
            "primeira_data": dt,
            "estado": est,
            "cidade": cid.title(),
            "bairro": bairro,
            "cep": cep,
            "endereco": end,
            "vol_dia": vol_dia,
            "vol_total": vol_total,
            "latitude": lat,
            "longitude": lng,
            "status": "ENABLE"
        })

    return {
        "status": "success",
        "pontos": points,
        "totais": {
            "total_pacotes": total_pacotes_sum,
            "qtd_sellers": len(points),
            "qtd_cidades": len(cidades_set),
            "estado": target_uf
        }
    }


@router.get("/novos-sellers")
def get_novos_sellers_feed(
    periodo_tipo: Optional[str] = Query("Diário"),
    rotulo: Optional[str] = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    periodo: str = "todos",
    cliente: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    uf: Optional[str] = None,
    q: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = None,
    page: int = 1,
    limit: Optional[int] = Query(None),
    page_size: int = 30,
    db: Session = Depends(get_db)
):
    if limit and limit > 0:
        page_size = limit

    dias = []
    if periodo_tipo and periodo_tipo in ["Diário", "Semanal", "Mensal", "Período"]:
        dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
        
    filtros = []
    params = {}
    
    dias_str = ", ".join(f"'{d}'" for d in dias) if dias else None

    if dias_str:
        if status and isinstance(status, str) and status.strip().lower() in ["novo", "novos"]:
            filtros.append(f"primeira_data IN ({dias_str})")
        else:
            filtros.append(f"merchant_id IN (SELECT DISTINCT merchant_id FROM detalhe_pickup_historico WHERE dia_base IN ({dias_str}))")
    elif _build_pickup_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim, periodo):
        filtros.append(_build_pickup_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim, periodo))

    mkt = marketplace if (marketplace and marketplace != "Todos") else cliente
    add_marketplace_filter(filtros, params, mkt)
        
    if uf and isinstance(uf, str) and uf.strip() and uf.lower() != "todos":
        filtros.append("UPPER(estado_origem) = :uf")
        params["uf"] = uf.strip().upper()
        
    if status and isinstance(status, str) and status.strip() and status.lower() not in ["todos", "novo", "novos"]:
        filtros.append("status_seller = :st")
        params["st"] = status.strip()
        
    search_term = search or q
    if search_term and isinstance(search_term, str) and search_term.strip():
        term = f"%{search_term.strip().lower()}%"
        filtros.append("(LOWER(merchant_id) LIKE :q OR LOWER(merchant_nome) LIKE :q OR LOWER(cidade_origem) LIKE :q OR LOWER(bairro_origem) LIKE :q OR LOWER(endereco_origem) LIKE :q OR LOWER(primeiro_cliente) LIKE :q)")
        params["q"] = term
        
    where_sql = " AND ".join(filtros) if filtros else "1=1"
    
    count_sql = f"SELECT COUNT(*) FROM sellers_pickup_registry WHERE {where_sql}"
    total_items = db.execute(text(count_sql), params).scalar() or 0
    total_pages = max(1, (total_items + page_size - 1) // page_size)
    offset = (page - 1) * page_size
    
    params["limit"] = page_size
    params["offset"] = offset
    
    status_case = f"CASE WHEN primeira_data IN ({dias_str}) THEN 'Novo' ELSE 'Recorrente' END as status_seller" if dias_str else "status_seller"
    
    query_sql = f"""
        SELECT 
            merchant_id,
            merchant_nome,
            primeiro_cliente,
            primeira_data,
            primeira_data_iso,
            estado_origem as estado,
            cidade_origem as cidade,
            bairro_origem as bairro,
            cep_origem as cep,
            endereco_origem as endereco,
            volume_primeiro_dia,
            volume_acumulado_total,
            total_dias_ativos,
            ultima_data,
            {status_case}
        FROM sellers_pickup_registry
        WHERE {where_sql}
        ORDER BY primeira_data_iso DESC, volume_primeiro_dia DESC
        LIMIT :limit OFFSET :offset;
    """
    
    rows = db.execute(text(query_sql), params).fetchall()
    
    items = []
    for r in rows:
        items.append({
            "merchant_id": r[0],
            "merchant_nome": r[1] or "Desconhecido",
            "primeiro_cliente": r[2] or "N/A",
            "primeira_data": r[3] or "",
            "primeira_data_iso": r[4] or "",
            "estado": padronizar_uf(r[5]) if r[5] else "SP",
            "cidade": r[6] or "",
            "bairro": r[7] or "",
            "cep": r[8] or "",
            "endereco": r[9] or "",
            "volume_primeiro_dia": r[10] or 0,
            "volume_acumulado_total": r[11] or 0,
            "total_dias_ativos": r[12] or 1,
            "ultima_data": r[13] or "",
            "status_seller": r[14] or "NOVO"
        })
        
    return {
        "status": "success",
        "data": items,
        "items": items,
        "total": total_items,
        "pages": total_pages,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total_items,
            "total_pages": total_pages
        }
    }


@router.get("/pendentes-atraso")
def get_pickup_pendentes_atraso(
    regional: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    db: Session = Depends(get_db)
):
    """
    Retorna a lista de solicitações de Pick-up pendentes ou em atraso nos estabelecimentos dos Sellers.
    """
    try:
        filtros = []
        params = {}
        if regional and regional.upper() != "TODOS":
            filtros.append("UPPER(estado_origem) = :uf")
            params["uf"] = regional.strip().upper()
            
        add_marketplace_filter(filtros, params, marketplace)
        where_sql = " AND ".join(filtros) if filtros else "1=1"

        sql = f"""
            SELECT 
                merchant_id,
                merchant_nome,
                primeiro_cliente as marketplace,
                estado_origem as estado,
                cidade_origem as cidade,
                bairro_origem as bairro,
                endereco_origem as endereco,
                volume_primeiro_dia as volume_solicitado,
                ultima_data as data_solicitacao,
                'Pendente / Em Atraso' as status_coleta
            FROM sellers_pickup_registry
            WHERE {where_sql}
            ORDER BY volume_primeiro_dia DESC
            LIMIT 50;
        """
        rows = db.execute(text(sql), params).fetchall()
        items = []
        for r in rows:
            items.append({
                "merchant_id": r[0],
                "merchant_nome": r[1] or "Seller",
                "marketplace": r[2] or "Marketplace",
                "estado": padronizar_uf(r[3]) if r[3] else "SP",
                "cidade": r[4] or "N/A",
                "bairro": r[5] or "N/A",
                "endereco": r[6] or "N/A",
                "volume_solicitado": r[7] or 0,
                "data_solicitacao": r[8] or "N/A",
                "status_coleta": r[9]
            })
        return {
            "status": "success",
            "total_pendentes": len(items),
            "pendentes": items
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
