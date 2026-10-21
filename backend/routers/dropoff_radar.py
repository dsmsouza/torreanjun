from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from database.connection import get_db
from services.operacional import obter_dias_periodo, padronizar_uf

router = APIRouter(prefix="/api/dropoff/radar", tags=["Dropoff Radar"])

def _build_filtros(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: Optional[str] = None, dt_fim: Optional[str] = None):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return "1=0" # Force no results if no days match
    dias_str = ", ".join(f"'{d}'" for d in dias)
    return f"dia_base IN ({dias_str})"

def add_marketplace_filter(filtros, params, marketplace):
    if marketplace and isinstance(marketplace, str) and marketplace.lower() != "todos":
        if marketplace.lower() == "shein":
            filtros.append("nome_cliente IN ('Shein', 'Shein D2D')")
        elif marketplace.lower() == "temu":
            filtros.append("nome_cliente IN ('temuxborder', 'temuw2d', 'temud2d')")
        else:
            filtros.append("nome_cliente = :mkt")
            params["mkt"] = marketplace

def add_cidade_filter(filtros, params, cidade):
    if cidade and isinstance(cidade, str) and cidade.strip() and cidade.lower() != "todas":
        filtros.append(
            "(UPPER(COALESCE(NULLIF(NULLIF(m.cidade, ''), 'NÃO CADASTRADA'), "
            "(SELECT mc.cidade FROM malha_coordenadas mc WHERE mc.md_codigo = m.md LIMIT 1))) = :cid)"
        )
        params["cid"] = cidade.strip().upper()

@router.get("/marketplaces")
def get_marketplaces():
    return {
        "status": "success",
        "marketplaces": ["Todos", "Shein", "Temu", "Kwai", "Tiktok", "C&A"]
    }

@router.get("/kpis")
def get_radar_kpis(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    regional: Optional[str] = None,
    cidade: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    db: Session = Depends(get_db)
):
    filtros = [_build_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim)]
    params = {}
    
    if regional and isinstance(regional, str) and regional.strip() and regional.lower() != "todos":
        filtros.append("UPPER(m.regional) = :reg")
        params["reg"] = regional.strip().upper()
        
    add_cidade_filter(filtros, params, cidade)
    add_marketplace_filter(filtros, params, marketplace)
        
    where_sql = " AND ".join(filtros)
    
    totais_row = db.execute(text(f"""
        SELECT 
            SUM(total) as vol_total,
            SUM(backlog) as backlog_total,
            SUM(carregamento) as total_carr
        FROM detalhe_md_historico m
        WHERE {where_sql};
    """), params).fetchone()
    
    vol_total = (totais_row[0] if totais_row else 0) or 0
    backlog_total = (totais_row[1] if totais_row else 0) or 0
    total_carr = (totais_row[2] if totais_row else 0) or 0
    
    taxa_media = round((total_carr * 100.0) / vol_total, 1) if vol_total > 0 else 100.0
    
    top_reg_row = db.execute(text(f"""
        SELECT 
            regional,
            SUM(total) as vol,
            (SUM(carregamento) * 100.0 / NULLIF(SUM(total), 0)) as taxa
        FROM detalhe_md_historico m
        WHERE {where_sql} AND regional != '' AND regional IS NOT NULL
        GROUP BY regional
        HAVING SUM(total) > 100
        ORDER BY taxa DESC, vol DESC
        LIMIT 1;
    """), params).fetchone()
    
    top_regional = None
    if top_reg_row:
        top_regional = {
            "regional": top_reg_row[0],
            "volume": top_reg_row[1],
            "taxa": round(top_reg_row[2] or 0, 1) if top_reg_row[2] else 100.0
        }

    min_dia = db.execute(text(f"SELECT MIN(dia_base) FROM detalhe_md_historico m WHERE {where_sql};"), params).scalar()
    novos_params = {**params, "min_dia": str(min_dia)} if min_dia else params
    
    novos_mds_row = db.execute(text(f"""
        SELECT COUNT(DISTINCT md), SUM(total)
        FROM detalhe_md_historico m
        WHERE {where_sql} AND md != '' AND md IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM detalhe_md_historico h
              WHERE h.md = m.md AND h.dia_base < :min_dia
          );
    """), novos_params).fetchone() if min_dia else (0, 0)
    
    total_novos_mds = (novos_mds_row[0] if novos_mds_row else 0) or 0
    vol_novos_mds = (novos_mds_row[1] if novos_mds_row else 0) or 0

    return {
        "status": "success",
        "vol_total": vol_total,
        "backlog_total": backlog_total,
        "taxa_media": taxa_media,
        "top_regional": top_regional,
        "total_novos_mds": total_novos_mds,
        "vol_novos_mds": vol_novos_mds
    }

@router.get("/regionais")
def get_radar_regionais(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    regional: Optional[str] = None,
    cidade: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    db: Session = Depends(get_db)
):
    filtros = [_build_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim)]
    params = {}
    
    if regional and isinstance(regional, str) and regional.strip() and regional.lower() != "todos":
        filtros.append("UPPER(m.regional) = :reg")
        params["reg"] = regional.strip().upper()
        
    add_cidade_filter(filtros, params, cidade)
    add_marketplace_filter(filtros, params, marketplace)
        
    where_sql = " AND ".join(filtros)
    
    rows = db.execute(text(f"""
        SELECT 
            regional,
            SUM(total) as vol_total,
            SUM(backlog) as back_total,
            SUM(carregamento) as total_carr
        FROM detalhe_md_historico m
        WHERE {where_sql} AND regional != '' AND regional IS NOT NULL
        GROUP BY regional
        ORDER BY vol_total DESC;
    """), params).fetchall()
    
    dados = []
    for r in rows:
        vol = r[1] or 0
        carr = r[3] or 0
        taxa = round((carr * 100.0) / vol, 1) if vol > 0 else 100.0
        dados.append({
            "regional": r[0],
            "volume": vol,
            "backlog": r[2] or 0,
            "taxa_coleta": taxa
        })
        
    return {"status": "success", "regionais": dados}

@router.get("/evolucao")
def get_radar_evolucao(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    regional: Optional[str] = None,
    cidade: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    db: Session = Depends(get_db)
):
    filtros = [_build_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim)]
    params = {}
    
    if regional and isinstance(regional, str) and regional.strip() and regional.lower() != "todos":
        filtros.append("UPPER(m.regional) = :reg")
        params["reg"] = regional.strip().upper()
        
    add_cidade_filter(filtros, params, cidade)
    add_marketplace_filter(filtros, params, marketplace)
        
    where_sql = " AND ".join(filtros)
    
    rows = db.execute(text(f"""
        SELECT 
            dia_base,
            nome_cliente,
            SUM(total) as vol_total,
            SUM(backlog) as backlog_total
        FROM detalhe_md_historico m
        WHERE {where_sql}
        GROUP BY dia_base, nome_cliente
        ORDER BY 
            substr(dia_base, 7, 4) ASC,
            substr(dia_base, 4, 2) ASC,
            substr(dia_base, 1, 2) ASC
    """), params).fetchall()
    
    dados_dict = {}
    for r in rows:
        dia, cli, vol, bkl = r[0], r[1], r[2] or 0, r[3] or 0
        if dia not in dados_dict:
            dados_dict[dia] = {"data": dia, "volume": 0, "backlog": 0, "breakdown": {}}
        dados_dict[dia]["volume"] += vol
        dados_dict[dia]["backlog"] += bkl
        
        cli_name = cli or "Desconhecido"
        if cli_name not in dados_dict[dia]["breakdown"]:
            dados_dict[dia]["breakdown"][cli_name] = {"volume": 0, "backlog": 0}
        dados_dict[dia]["breakdown"][cli_name]["volume"] += vol
        dados_dict[dia]["breakdown"][cli_name]["backlog"] += bkl
        
    dados = list(dados_dict.values())
        
    return {"status": "success", "evolucao": dados}

@router.get("/novos-mds")
def get_novos_mds_radar(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    regional: Optional[str] = None,
    cidade: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    db: Session = Depends(get_db)
):
    filtros = [_build_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim), "m.md != '' AND m.md IS NOT NULL"]
    params = {}
    
    if regional and isinstance(regional, str) and regional.strip() and regional.lower() != "todos":
        filtros.append("UPPER(m.regional) = :reg")
        params["reg"] = regional.strip().upper()
        
    add_cidade_filter(filtros, params, cidade)
    add_marketplace_filter(filtros, params, marketplace)
    where_sql = " AND ".join(filtros)
    min_dia = db.execute(text(f"SELECT MIN(dia_base) FROM detalhe_md_historico m WHERE {where_sql};"), params).scalar()
    if not min_dia:
        return {"status": "success", "total": 0, "items": []}

    novos_params = {**params, "min_dia": str(min_dia)}

    sql_novos = text(f"""
        SELECT 
            m.md, 
            COALESCE(NULLIF(m.regional, ''), mc.regional, 'N/A') as regional, 
            COALESCE(NULLIF(m.estado, ''), mc.estado, pc.estado, 'SP') as estado, 
            COALESCE(NULLIF(NULLIF(m.cidade, ''), 'NÃO CADASTRADA'), mc.cidade, pc.cidade, 'Não Cadastrada') as cidade, 
            SUM(m.total) as volume_total,
            SUM(m.backlog) as backlog_total,
            SUM(m.carregamento) as total_carregamento,
            MAX(mc.latitude) as latitude,
            MAX(mc.longitude) as longitude,
            MAX(mc.endereco) as endereco
        FROM detalhe_md_historico m
        LEFT JOIN malha_coordenadas mc ON m.md = mc.md_codigo
        LEFT JOIN pontos_coleta pc ON m.md = pc.iata
        WHERE {where_sql}
          AND NOT EXISTS (
              SELECT 1 
              FROM detalhe_md_historico h 
              WHERE h.md = m.md AND h.dia_base < :min_dia
          )
        GROUP BY m.md
        ORDER BY volume_total DESC;
    """)
    rows = db.execute(sql_novos, novos_params).fetchall()
    
    items = []
    for r in rows:
        vol = r[4] or 0
        carr = r[6] or 0
        taxa = round((carr * 100.0) / vol, 1) if vol > 0 else 100.0
        lat = r[7]
        lng = r[8]
        items.append({
            "md": r[0],
            "regional": r[1] or "N/A",
            "estado": str(r[2] or "SP").upper(),
            "cidade": r[3] or "Não Informada",
            "volume_total": vol,
            "backlog_total": r[5] or 0,
            "taxa_coleta": taxa,
            "status": "Inédito",
            "latitude": lat,
            "longitude": lng,
            "endereco": r[9] or "",
            "tem_coordenadas": lat is not None and lng is not None
        })
    return {"status": "success", "total": len(items), "items": items}

@router.get("/mds")
def get_radar_mds(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    regional: Optional[str] = None,
    search: Optional[str] = None,
    marketplace: Optional[str] = Query("Todos"),
    cidade: Optional[str] = None,
    sort_by: Optional[str] = Query("volume"),
    sort_desc: bool = Query(True),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    if not isinstance(page, int): page = 1
    if not isinstance(limit, int): limit = 20
    if not isinstance(sort_by, str): sort_by = "volume"
    if not isinstance(sort_desc, bool): sort_desc = True

    filtros = [_build_filtros(db, periodo_tipo, rotulo, dt_inicio, dt_fim), "m.md != '' AND m.md IS NOT NULL"]
    params = {}
    
    if regional and isinstance(regional, str) and regional.strip() and regional.lower() != "todos":
        filtros.append("UPPER(COALESCE(NULLIF(m.regional, ''), mc.regional, '')) = :reg")
        params["reg"] = regional.strip().upper()
        
    if search and isinstance(search, str) and search.strip():
        term = f"%{search.strip().lower()}%"
        filtros.append("(LOWER(m.md) LIKE :s OR LOWER(m.cidade) LIKE :s OR LOWER(mc.cidade) LIKE :s)")
        params["s"] = term

    add_cidade_filter(filtros, params, cidade)
        
    add_marketplace_filter(filtros, params, marketplace)
        
    where_sql = " AND ".join(filtros)
    
    count_sql = f"""
        SELECT COUNT(DISTINCT m.md)
        FROM detalhe_md_historico m
        LEFT JOIN malha_coordenadas mc ON m.md = mc.md_codigo
        WHERE {where_sql};
    """
    total_items = db.execute(text(count_sql), params).scalar() or 0
    total_pages = max(1, (total_items + limit - 1) // limit)
    
    offset = (page - 1) * limit
    
    sort_col = "vol_total"
    if sort_by == "backlog": sort_col = "back_total"
    elif sort_by == "taxa_coleta": sort_col = "taxa_calc"
    elif sort_by == "md": sort_col = "m.md"
    elif sort_by == "regional": sort_col = "regional"
    elif sort_by == "cidade": sort_col = "cidade"
    elif sort_by == "estado": sort_col = "estado"
    
    dir_sql = "DESC" if sort_desc else "ASC"
    
    data_sql = f"""
        SELECT 
            m.md,
            COALESCE(MAX(NULLIF(m.regional, '')), MAX(mc.regional), 'N/A') as regional,
            COALESCE(MAX(NULLIF(NULLIF(m.cidade, ''), 'NÃO CADASTRADA')), MAX(mc.cidade), MAX(pc.cidade), 'Não Cadastrada') as cidade,
            COALESCE(MAX(NULLIF(m.estado, '')), MAX(mc.estado), MAX(pc.estado), 'SP') as estado,
            MAX(m.divisao) as divisao,
            SUM(m.total) as vol_total,
            SUM(m.backlog) as back_total,
            SUM(m.carregamento) as total_carr,
            (SUM(m.carregamento) * 100.0 / NULLIF(SUM(m.total), 0)) as taxa_calc,
            MAX(mc.latitude) as latitude,
            MAX(mc.longitude) as longitude,
            MAX(mc.endereco) as endereco
        FROM detalhe_md_historico m
        LEFT JOIN malha_coordenadas mc ON m.md = mc.md_codigo
        LEFT JOIN pontos_coleta pc ON m.md = pc.iata
        WHERE {where_sql}
        GROUP BY m.md
        ORDER BY {sort_col} {dir_sql}, m.md ASC
        LIMIT :limit OFFSET :offset;
    """
    
    params["limit"] = limit
    params["offset"] = offset
    
    rows = db.execute(text(data_sql), params).fetchall()
    
    dados = []
    for r in rows:
        vol = r[5] or 0
        carr = r[7] or 0
        taxa = round((carr * 100.0) / vol, 1) if vol > 0 else 100.0
        lat = r[9]
        lng = r[10]
        dados.append({
            "md": r[0],
            "regional": r[1] or "",
            "cidade": r[2] or "",
            "estado": r[3] or "",
            "divisao": r[4] or "",
            "volume": vol,
            "backlog": r[6] or 0,
            "taxa_coleta": taxa,
            "latitude": lat,
            "longitude": lng,
            "endereco": r[11] or "",
            "tem_coordenadas": lat is not None and lng is not None
        })
        
    return {
        "status": "success",
        "data": dados,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_items": total_items,
            "total_pages": total_pages
        }
    }


class EditarCidadeMD(BaseModel):
    md_codigo: str
    cidade: str
    estado: Optional[str] = None
    endereco: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.put("/mds/cidade")
def atualizar_cidade_md(
    payload: EditarCidadeMD,
    db: Session = Depends(get_db)
):
    """Atualiza a cidade e coordenadas de um MD na malha de coordenadas e no histórico."""
    try:
        md_clean = payload.md_codigo.strip().upper()
        cidade_clean = payload.cidade.strip().title()
        estado_clean = padronizar_uf(payload.estado) if payload.estado else None
        endereco_clean = payload.endereco.strip() if payload.endereco else None
        lat = payload.latitude
        lng = payload.longitude

        # 1. Atualizar detalhe_md_historico
        if estado_clean:
            db.execute(text("""
                UPDATE detalhe_md_historico 
                SET cidade = :c, estado = :e 
                WHERE UPPER(TRIM(md)) = :m;
            """), {"c": cidade_clean, "e": estado_clean, "m": md_clean})
        else:
            db.execute(text("""
                UPDATE detalhe_md_historico 
                SET cidade = :c 
                WHERE UPPER(TRIM(md)) = :m;
            """), {"c": cidade_clean, "m": md_clean})

        # 2. Atualizar ou inserir em malha_coordenadas com Lat/Lng e endereço
        exists_malha = db.execute(text("SELECT COUNT(*) FROM malha_coordenadas WHERE UPPER(TRIM(md_codigo)) = :m;"), {"m": md_clean}).scalar()
        if exists_malha and exists_malha > 0:
            sql_update = """
                UPDATE malha_coordenadas 
                SET cidade = :c,
                    estado = COALESCE(:e, estado),
                    endereco = COALESCE(:end, endereco),
                    latitude = COALESCE(:lat, latitude),
                    longitude = COALESCE(:lng, longitude),
                    funcionando = 'ATIVADO'
                WHERE UPPER(TRIM(md_codigo)) = :m;
            """
            db.execute(text(sql_update), {
                "c": cidade_clean, 
                "e": estado_clean, 
                "end": endereco_clean,
                "lat": lat,
                "lng": lng,
                "m": md_clean
            })
        else:
            sql_insert = """
                INSERT INTO malha_coordenadas (md_codigo, nome_ponto, cidade, estado, endereco, latitude, longitude, funcionando)
                VALUES (:m, :m, :c, :e, :end, :lat, :lng, 'ATIVADO');
            """
            db.execute(text(sql_insert), {
                "m": md_clean,
                "c": cidade_clean,
                "e": estado_clean or "SP",
                "end": endereco_clean or f"Cidade {cidade_clean}",
                "lat": lat,
                "lng": lng
            })

        # 3. Atualizar pontos_coleta se existir
        try:
            sql_pc = """
                UPDATE pontos_coleta 
                SET cidade = :c,
                    estado = COALESCE(:e, estado),
                    latitude = COALESCE(:lat, latitude),
                    longitude = COALESCE(:lng, longitude)
                WHERE UPPER(TRIM(iata)) = :m;
            """
            db.execute(text(sql_pc), {"c": cidade_clean, "e": estado_clean, "lat": lat, "lng": lng, "m": md_clean})
        except Exception:
            pass

        db.commit()
        return {
            "status": "success", 
            "message": f"MD '{md_clean}' atualizado com sucesso! Cidade: '{cidade_clean}' - Integrado ao Mapa!",
            "plotado_mapa": lat is not None and lng is not None
        }
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/novos-mds-bipando")
def get_novos_mds_bipando(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retorna MDs que realizaram sua primeira bipagem histórica no banco de dados no período selecionado."""
    try:
        dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
        if not dias:
            return {"status": "success", "novos_mds": [], "count": 0}

        dias_ph = ", ".join([f":d{i}" for i in range(len(dias))])
        params = {f"d{i}": d for i, d in enumerate(dias)}
        min_dia = min(dias)

        q_novos = f"""
            SELECT 
                m.md,
                MAX(m.cidade) as cidade,
                MAX(m.regional) as regional,
                SUM(m.total) as volume_inicial,
                MIN(m.dia_base) as primeira_data
            FROM detalhe_md_historico m
            WHERE m.dia_base IN ({dias_ph})
              AND m.md IS NOT NULL AND m.md != ''
              AND UPPER(m.md) NOT IN (
                  SELECT DISTINCT UPPER(md) 
                  FROM detalhe_md_historico 
                  WHERE dia_base < :min_dia
              )
            GROUP BY m.md
            ORDER BY volume_inicial DESC;
        """
        params["min_dia"] = min_dia
        rows = db.execute(text(q_novos), params).fetchall()

        novos_list = [
            {
                "md": r[0],
                "cidade": r[1] or "N/A",
                "regional": r[2] or "N/A",
                "volume_inicial": r[3] or 0,
                "primeira_data": r[4]
            } for r in rows
        ]

        return {
            "status": "success",
            "count": len(novos_list),
            "novos_mds": novos_list
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/novos-mds-relatorio-diario")
def get_novos_mds_relatorio_diario(
    regional: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retorna o Relatório Diário de Auditoria e Performance de todos os Novos MDs em Ramp-up (<= 60 dias).
    Exibe: MD, Regional, Cidade, Data Credenciamento, Dias em Operação, Volume Coletado, Backlog, Taxa de Coleta,
    Erros de Lacre e Bipagens fora do SLA.
    """
    try:
        from datetime import datetime
        now = datetime.now()
        
        query = """
            SELECT 
                p.iata as md,
                COALESCE(NULLIF(p.estado, ''), 'SP') as regional,
                COALESCE(NULLIF(p.cidade, ''), 'N/A') as cidade,
                p.data_credenciamento,
                p.shein as status_operacional
            FROM pontos_coleta p
        """
        rows = db.execute(text(query)).fetchall()
        
        hist_mds = db.execute(text("""
            SELECT md, regional, cidade, MIN(dia_base) as primeira_data
            FROM detalhe_md_historico
            WHERE md IS NOT NULL AND md != ''
            GROUP BY md
        """)).fetchall()
        
        md_map = {}
        for r in rows:
            md_name = r[0].strip() if r[0] else ""
            if not md_name: continue
            dt_cred = r[3]
            dias = 0
            if dt_cred:
                try:
                    d0 = datetime.strptime(str(dt_cred).split("T")[0], "%Y-%m-%d")
                    dias = (now - d0).days
                except Exception:
                    dias = 0
            md_map[md_name.upper()] = {
                "md": md_name,
                "regional": r[1] or "SP",
                "cidade": r[2] or "N/A",
                "data_credenciamento": dt_cred or "N/A",
                "dias_operacao": max(0, dias),
                "is_novo_md": dias <= 60 and dias >= 0 and dt_cred is not None
            }
            
        for r in hist_mds:
            md_name = r[0].strip() if r[0] else ""
            if not md_name: continue
            key = md_name.upper()
            if key not in md_map:
                p_data = r[3]
                dias = 0
                if p_data:
                    try:
                        d0 = datetime.strptime(p_data, "%d/%m/%Y")
                        dias = (now - d0).days
                    except Exception:
                        dias = 0
                md_map[key] = {
                    "md": md_name,
                    "regional": r[1] or "SP",
                    "cidade": r[2] or "N/A",
                    "data_credenciamento": r[3],
                    "dias_operacao": max(0, dias),
                    "is_novo_md": dias <= 60 and dias >= 0
                }
        
        novos_mds = [m for m in md_map.values() if m["is_novo_md"] or m["dias_operacao"] <= 60]
        
        if regional and regional != "TODOS":
            novos_mds = [m for m in novos_mds if m["regional"].upper() == regional.upper()]
            
        relatorio = []
        for m in novos_mds:
            md_code = m["md"]
            stat_row = db.execute(text("""
                SELECT 
                    SUM(total) as vol_tot,
                    SUM(backlog) as bkl_tot,
                    SUM(carregamento) as carr_tot,
                    SUM(erros_md) as erros_tot
                FROM detalhe_md_historico
                WHERE UPPER(TRIM(md)) = UPPER(TRIM(:m))
            """), {"m": md_code}).fetchone()
            
            vol = (stat_row[0] if stat_row else 0) or 0
            bkl = (stat_row[1] if stat_row else 0) or 0
            carr = (stat_row[2] if stat_row else 0) or 0
            erros = (stat_row[3] if stat_row else 0) or 0
            taxa = round((carr * 100.0) / vol, 1) if vol > 0 else 100.0
            
            fora_sla_row = db.execute(text("""
                SELECT SUM(volume)
                FROM detalhe_pico_historico
                WHERE UPPER(TRIM(md)) = UPPER(TRIM(:m))
                  AND (
                      hora_bipagem < '08:00' OR hora_bipagem > '18:00'
                  )
            """), {"m": md_code}).fetchone()
            fora_sla = (fora_sla_row[0] if fora_sla_row else 0) or 0

            relatorio.append({
                "md": m["md"],
                "regional": m["regional"],
                "cidade": m["cidade"],
                "data_credenciamento": m["data_credenciamento"],
                "dias_operacao": m["dias_operacao"],
                "volume_total": vol,
                "backlog_total": bkl,
                "taxa_coleta": taxa,
                "erros_lacre": erros,
                "bipagens_fora_sla": fora_sla
            })
            
        relatorio.sort(key=lambda x: x["dias_operacao"])
        return {
            "status": "success",
            "total_novos_mds": len(relatorio),
            "relatorio": relatorio
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

