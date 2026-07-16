import csv
import re
import json
import math
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from models.models import MalhaCoordenadas

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula a distância em quilômetros entre dois pontos geográficos."""
    # Converter graus para radianos
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371.0 # Raio da Terra em km
    return c * r

def extrair_codigo_md(nome: str) -> str:
    """Limpa o nome do ponto e extrai o código padrão de MD da ANJUN."""
    nome_limpo = nome.replace("Anjun_", "").strip()
    
    # Padrão SP-W-MD167, ES-W-D008, PR-W-LIF002
    match = re.search(r'([A-Z]{2}-W-(?:MD|D|LIF)\d+)', nome_limpo, re.IGNORECASE)
    if match:
        return match.group(1).upper()
        
    # Padrão MD-SAN-01, MD-CAT-01
    match2 = re.search(r'(MD-[A-Z0-9]+-\d+)', nome_limpo, re.IGNORECASE)
    if match2:
        return match2.group(1).upper()
        
    return nome_limpo.upper()

def processar_planilha_coordenadas(content_bytes: bytes, filename: str, db: Session) -> Dict[str, Any]:
    """Processa arquivo de coordenadas (Excel ou CSV) de forma flexível e inteligente."""
    import pandas as pd
    import io
    
    # 1. Carregar planilha em um DataFrame do Pandas
    try:
        if filename.lower().endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(content_bytes))
        else:
            try:
                decoded = content_bytes.decode('utf-8-sig', errors='ignore')
                df = pd.read_csv(io.StringIO(decoded))
            except:
                df = pd.read_csv(io.BytesIO(content_bytes))
    except Exception as e:
        return {"status": "error", "message": f"Erro ao ler planilha: {e}"}
        
    if df.empty:
        return {"status": "error", "message": "A planilha informada está vazia."}
        
    # Mapeamento e padronização de colunas
    cols = {str(c).strip().lower(): c for c in df.columns}
    
    def get_col_value(row, aliases, default=None):
        for alias in aliases:
            if alias.lower() in cols:
                orig_col = cols[alias.lower()]
                val = row[orig_col]
                if pd.notna(val):
                    return str(val).strip()
        return default

    # Aliases flexíveis para suportar ambos os formatos (antigo e novo)
    md_aliases = ["minidrop", "nome do ponto de coleta", "md_codigo", "md", "ponto", "ponto de coleta"]
    lat_aliases = ["latitude", "lat"]
    lon_aliases = ["longitude", "lon", "lng"]
    cep_aliases = ["postal code", "cep", "código postal", "codigo postal"]
    addr_aliases = ["collection point address", "endereco", "endereço", "address", "logradouro"]
    city_aliases = ["city", "cidade"]
    state_aliases = ["state/province", "state", "estado", "uf", "provincia"]
    horario_aliases = ["horário de trabalho", "horario de trabalho", "horario", "working hours", "working_hours"]
    wkt_aliases = ["wkt"]
    regional_aliases = ["regional", "regiao", "região", "distrito", "filial"]
    funcionando_aliases = ["funcionando", "status_funcionamento", "funcionamento"]
    divisao_aliases = ["divisao", "divisão", "division", "subdivisao", "subdivisão"]

    # Garantir que a tabela existe no banco
    from database.connection import engine
    from database.connection import Base
    
    try:
        from models.models import MalhaCoordenadas
        db.query(MalhaCoordenadas).delete()
    except Exception as e:
        print(f"Error clearing table: {e}")
        
    Base.metadata.create_all(bind=engine)
        
    registros_inseridos = 0
    processed_mds = set()
    horas_cols = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]
    
    for idx, row in df.iterrows():
        nome_raw = get_col_value(row, md_aliases)
        wkt = get_col_value(row, wkt_aliases, "")
        
        if not nome_raw and wkt:
            nome_raw = wkt
            
        if not nome_raw:
            continue
            
        md_codigo = extrair_codigo_md(nome_raw)
        if not md_codigo or md_codigo in processed_mds:
            continue
            
        # Latitude e Longitude
        lat_val = get_col_value(row, lat_aliases)
        lon_val = get_col_value(row, lon_aliases)
        
        lat = None
        lon = None
        
        if lat_val:
            try:
                lat = float(str(lat_val).replace(",", "."))
            except:
                pass
        if lon_val:
            try:
                lon = float(str(lon_val).replace(",", "."))
            except:
                pass
                
        # Parse fallback WKT: POINT (long lat)
        if (lat is None or lon is None) and wkt:
            wkt_match = re.search(r'POINT\s*\(\s*([-\d\.]+)\s+([-\d\.]+)\s*\)', wkt, re.IGNORECASE)
            if wkt_match:
                lon = float(wkt_match.group(1))
                lat = float(wkt_match.group(2))
                
        if lat is None or lon is None:
            continue # Sem coordenadas, ignorar
            
        cep = get_col_value(row, cep_aliases, "N/A")
        endereco = get_col_value(row, addr_aliases, "N/A")
        cidade = get_col_value(row, city_aliases, "")
        estado = get_col_value(row, state_aliases, "")
        horario = get_col_value(row, horario_aliases, "08:00-18:00")
        regional = get_col_value(row, regional_aliases, "OUTRAS")
        funcionando_raw = get_col_value(row, funcionando_aliases, "ATIVO")
        funcionando = str(funcionando_raw).strip().upper() if funcionando_raw else "ATIVO"
        divisao_raw = get_col_value(row, divisao_aliases, None)
        divisao = str(divisao_raw).strip() if divisao_raw else None
        
        # Dynamic routing for SP regionals based on divisions
        if divisao:
            div_lower = divisao.lower().strip()
            if div_lower in ['sp jau', 'sp birigui', 'jaú', 'jau', 'sp birigui']:
                regional = 'SP JAU'
            elif div_lower in ['sp franca', 'franca', 'sp franca']:
                regional = 'SP FRANCA'
        
        # Histograma de bipagem
        hist_dict = {}
        for h in horas_cols:
            if h.lower() in cols:
                orig_col = cols[h.lower()]
                val = str(row[orig_col]).strip() if pd.notna(row[orig_col]) else ""
                hist_dict[h] = val.count("█")
            else:
                hist_dict[h] = 0
                
        mc = MalhaCoordenadas(
            md_codigo=md_codigo,
            nome_ponto=nome_raw.replace("Anjun_", ""),
            latitude=lat,
            longitude=lon,
            cep=cep,
            endereco=endereco,
            horario_trabalho=horario,
            cidade=cidade,
            estado=estado,
            regional=regional,
            divisao=divisao,
            funcionando=funcionando,
            histograma=json.dumps(hist_dict)
        )
        db.add(mc)
        processed_mds.add(md_codigo)
        registros_inseridos += 1
        
    db.commit()
    return {"status": "success", "rows_imported": registros_inseridos}

def obter_pontos_malha(db: Session, periodo_tipo: str = "Diário", rotulo: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retorna todos os pontos de malha com coordenadas, agregando a volumetria
    e justificativas por período (Diário, Semanal ou Mensal).
    """
    if not rotulo or rotulo == "latest" or rotulo == "Carregando...":
        query_max_dia = """
            SELECT dia_base 
            FROM detalhe_md_historico 
            WHERE dia_base IS NOT NULL
            ORDER BY substr(dia_base,7,4) || '-' || substr(dia_base,4,2) || '-' || substr(dia_base,1,2) DESC 
            LIMIT 1;
        """
        row_dia = db.execute(text(query_max_dia)).fetchone()
        rotulo = row_dia[0] if (row_dia and row_dia[0]) else "latest"

    # 2. Obter dias correspondentes ao período
    from services.operacional import obter_dias_periodo
    dias = obter_dias_periodo(db, periodo_tipo, rotulo)
    if not dias:
        dias = [rotulo]
        
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    
    # 3. Buscar volumetria agregada dos MDs no período
    query_vol = f"""
        SELECT md, SUM(total) as vol_tot, SUM(backlog) as vol_back, MAX(regional) as reg
        FROM detalhe_md_historico
        WHERE dia_base IN ({dias_placeholders})
        GROUP BY md;
    """
    vols = db.execute(text(query_vol), params).fetchall()
    vols_map = {
        row[0]: {
            "volume": row[1] or 0,
            "backlog": row[2] or 0,
            "taxa_coleta": round(((row[1] - row[2]) / row[1] * 100) if row[1] and row[1] > 0 else 100.0, 2),
            "erros_lacre": 0,
            "regional": row[3] or "OUTRAS"
        }
        for row in vols if row[0]
    }
    
    # 4. Buscar coordenadas
    coords = db.query(MalhaCoordenadas).all()
    
    # 5. Buscar observações fixas dos MDs
    try:
        obs_rows = db.execute(text("SELECT md, observacao FROM md_observacoes_fixas;")).fetchall()
        obs_map = {row[0].strip().upper(): row[1] for row in obs_rows if row[0]}
    except Exception as e:
        print(f"Error fetching md_observacoes_fixas: {e}")
        obs_map = {}
        
    # 6. Buscar decisões de permanência (última avaliação cadastrada)
    try:
        eval_rows = db.execute(text("""
            SELECT e.md, e.decisao 
            FROM avaliacao_md e
            INNER JOIN (
                SELECT md, MAX(id) as max_id 
                FROM avaliacao_md 
                GROUP BY md
            ) latest ON e.id = latest.max_id;
        """)).fetchall()
        eval_map = {row[0].strip().upper(): row[1] for row in eval_rows if row[0]}
    except Exception as e:
        print(f"Error fetching evaluations: {e}")
        eval_map = {}
    
    resultado = []
    for c in coords:
        vol_info = vols_map.get(c.md_codigo, {
            "volume": 0,
            "backlog": 0,
            "taxa_coleta": 100.0,
            "erros_lacre": 0,
            "regional": "OUTRAS"
        })
        
        # Determinar se fecha cedo (antes das 18:00)
        fecha_cedo = False
        horario_fechamento = "18:00"
        if c.horario_trabalho:
            # Ex: 08:00-18:00 ou 10:00-16:00
            parts = c.horario_trabalho.split("-")
            if len(parts) == 2:
                horario_fechamento = parts[1].strip()
                try:
                    hora_int = int(horario_fechamento.split(":")[0])
                    if hora_int < 18:
                        fecha_cedo = True
                except Exception:
                    pass
                    
        # Parse histograma
        hist = {}
        if c.histograma:
            try:
                hist = json.loads(c.histograma)
            except Exception:
                pass
                
        # Decisão de permanência padrão é "manter" se não avaliado
        decisao = eval_map.get(c.md_codigo.strip().upper(), "manter").lower()
                
        resultado.append({
            "md_codigo": c.md_codigo,
            "nome_ponto": c.nome_ponto,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "cep": c.cep,
            "endereco": c.endereco,
            "horario_trabalho": c.horario_trabalho,
            "horario_fechamento": horario_fechamento,
            "fecha_cedo": fecha_cedo,
            "cidade": c.cidade,
            "estado": c.estado,
            "regional": vol_info["regional"] if vol_info["regional"] != "OUTRAS" else (c.regional or "OUTRAS"),
            "funcionando": c.funcionando or "ATIVADO",
            "volume": vol_info["volume"],
            "backlog": vol_info["backlog"],
            "taxa_coleta": vol_info["taxa_coleta"],
            "erros_lacre": vol_info["erros_lacre"],
            "histograma": hist,
            "observacao_fixa": obs_map.get(c.md_codigo, ""),
            "decisao": decisao
        })
        
    return resultado

def simular_otimizacao_malha(
    db: Session, 
    md_origem_codigo: str, 
    raio_max_km: float = 5.0,
    periodo_tipo: str = "Diário",
    rotulo: Optional[str] = None
) -> Dict[str, Any]:
    """
    Simula e sugere MDs próximos alternativos para transferência de carga de um MD ofensor.
    Retorna o MD de origem e a lista de candidatos ordenados por proximidade física.
    """
    pontos = obter_pontos_malha(db, periodo_tipo, rotulo)
    
    # Encontrar MD de origem
    origem = next((p for p in pontos if p["md_codigo"] == md_origem_codigo), None)
    if not origem:
        return {"status": "error", "message": f"MD {md_origem_codigo} não encontrado."}
        
    candidatos = []
    for p in pontos:
        if p["md_codigo"] == md_origem_codigo:
            continue
            
        # Ponto candidato deve fechar 18:00 ou mais tarde
        if p["fecha_cedo"]:
            continue
            
        dist = haversine_distance(origem["latitude"], origem["longitude"], p["latitude"], p["longitude"])
        if dist <= raio_max_km:
            candidatos.append({
                **p,
                "distancia_km": round(dist, 2)
            })
            
    # Ordenar candidatos por proximidade (menor distância primeiro)
    candidatos = sorted(candidatos, key=lambda x: x["distancia_km"])
    
    return {
        "status": "success",
        "origem": origem,
        "alternativas": candidatos
    }
