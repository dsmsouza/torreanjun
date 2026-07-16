from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from models.models import MapaPontos
import pandas as pd
import math
import glob
import os

router = APIRouter()

def haversine(lat1, lon1, lat2, lon2):
    """Calcula distância em km entre dois pontos geográficos."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

@router.post("/analyze")
async def analyze_misscan(db: Session = Depends(get_db)):
    misscan_dir = r"C:\ANJUN\misscan"
    try:
        if not os.path.exists(misscan_dir):
            os.makedirs(misscan_dir)
            
        xlsx_files = glob.glob(os.path.join(misscan_dir, "*.xlsx"))
        if not xlsx_files:
            raise HTTPException(status_code=400, detail="Nenhuma planilha .xlsx encontrada na pasta C:\\ANJUN\\misscan")
            
        file_path = xlsx_files[0]
        df = pd.read_excel(file_path)
        
        # Carregar todos os pontos com coordenadas (tanto ativos quanto inativos)
        all_points = db.query(MapaPontos).filter(
            MapaPontos.latitude.isnot(None),
            MapaPontos.longitude.isnot(None),
            MapaPontos.latitude != 0,
            MapaPontos.longitude != 0
        ).all()
        
        def is_active(p):
            status_str = str(p.status).lower() if p.status else ""
            return 'enable' in status_str or 'ativado' in status_str or 'ativo' in status_str

        # Ordenar os pontos para que os ativos fiquem na frente (prioridade)
        sorted_points = sorted(all_points, key=lambda p: 0 if is_active(p) else 1)
        
        # Indexar pontos por CEP, por faixa de CEP, por Estado e por Cidade
        points_by_cep = {}
        cep_prefix_coords = {}
        points_by_state = {}
        points_by_city = {}
        
        for p in sorted_points:
            p_cep = str(p.cep).strip().replace('-', '')
            if p_cep and p_cep.lower() not in ('nan', 'none'):
                if p_cep not in points_by_cep:
                    points_by_cep[p_cep] = []
                points_by_cep[p_cep].append(p)
                
                prefix = p_cep[:5]
                if prefix not in cep_prefix_coords:
                    cep_prefix_coords[prefix] = []
                cep_prefix_coords[prefix].append((p.latitude, p.longitude))
                
            estado = str(p.estado).strip().upper()
            if estado and estado not in ('NAN', 'NONE'):
                points_by_state.setdefault(estado, []).append(p)
                
            cidade = str(p.cidade).strip().upper()
            if cidade and estado and cidade not in ('NAN', 'NONE'):
                chave_cidade = f"{cidade}-{estado}"
                points_by_city.setdefault(chave_cidade, []).append(p)
        
        cep_prefix_avg = {}
        for prefix, coords in cep_prefix_coords.items():
            avg_lat = sum(c[0] for c in coords) / len(coords)
            avg_lon = sum(c[1] for c in coords) / len(coords)
            cep_prefix_avg[prefix] = (avg_lat, avg_lon)
        
        def format_md(p, motivo):
            iata_text = p.iata if p.iata else p.nome
            return f"{iata_text} ({motivo})"
        
        def find_closest_point(lat, lon, max_radius_km=5.0, estado=None):
            min_dist = max_radius_km
            closest = None
            candidates = points_by_state.get(estado, sorted_points) if estado else sorted_points
            
            # 1. Tentar encontrar primeiro um ponto ATIVO no raio máximo
            for p in candidates:
                if not is_active(p):
                    continue
                dist = haversine(lat, lon, p.latitude, p.longitude)
                if dist < min_dist:
                    min_dist = dist
                    closest = p
            
            # 2. Se não achou nenhum ativo, tenta pontos inativos como fallback
            if not closest:
                for p in candidates:
                    if is_active(p):
                        continue
                    dist = haversine(lat, lon, p.latitude, p.longitude)
                    if dist < min_dist:
                        min_dist = dist
                        closest = p
                        
            return closest, min_dist
        
        results = []
        radius_cache = {}  # Cache de tupla (suggested_md_str, point_obj) por prefixo de CEP
        
        for index, row in df.iterrows():
            estado = str(row.get('Estado de origem', row.get('ESTADO DE ORIGEM', row.get('ESTADO', '')))).strip().upper()
            if estado in ('NAN', 'NONE'): estado = ''
                
            cidade = str(row.get('Cidade de origem', row.get('CIDADE DE ORIGEM', row.get('CIDADE', '')))).strip().upper()
            if cidade in ('NAN', 'NONE'): cidade = ''
                
            cep_raw = str(row.get('CEP do remetente', row.get('CEP', ''))).strip()
            cep_clean = cep_raw.replace('-', '')
            if cep_clean.lower() in ('nan', 'none', ''):
                cep_clean = ''
            
            codigo = str(index)
            for col in row.keys():
                col_name = str(col).lower()
                if 'barras' in col_name or 'rastreio' in col_name or 'tracking' in col_name:
                    if not pd.isna(row[col]):
                        codigo = str(row[col]).strip()
                        break
            
            suggested_md = "Nenhum Ponto Encontrado"
            suggested_p = None
            
            if cep_clean and cep_clean in points_by_cep:
                suggested_p = points_by_cep[cep_clean][0]
                suggested_md = format_md(suggested_p, "CEP Exato")
            elif cep_clean:
                cep_prefix = cep_clean[:5]
                found_by_radius = False
                
                # Check cache first
                if cep_prefix in radius_cache:
                    suggested_md, suggested_p = radius_cache[cep_prefix]
                    found_by_radius = True
                else:
                    if cep_prefix in cep_prefix_avg:
                        est_lat, est_lon = cep_prefix_avg[cep_prefix]
                        closest, dist = find_closest_point(est_lat, est_lon, max_radius_km=5.0, estado=estado)
                        if closest:
                            suggested_p = closest
                            suggested_md = format_md(closest, f"Raio {dist:.1f}km")
                            found_by_radius = True
                            radius_cache[cep_prefix] = (suggested_md, suggested_p)
                    
                    if not found_by_radius and cep_prefix.isdigit():
                        prefix_num = int(cep_prefix)
                        for offset in [-1, 1, -2, 2]:
                            neighbor = str(prefix_num + offset).zfill(5)
                            if neighbor in cep_prefix_avg:
                                est_lat, est_lon = cep_prefix_avg[neighbor]
                                closest, dist = find_closest_point(est_lat, est_lon, max_radius_km=10.0, estado=estado)
                                if closest:
                                    suggested_p = closest
                                    suggested_md = format_md(closest, f"Raio ~{dist:.1f}km (faixa vizinha)")
                                    found_by_radius = True
                                    radius_cache[cep_prefix] = (suggested_md, suggested_p)
                                    break
                    
                    if not found_by_radius and cep_prefix in cep_prefix_avg:
                        est_lat, est_lon = cep_prefix_avg[cep_prefix]
                        closest, dist = find_closest_point(est_lat, est_lon, max_radius_km=999.0, estado=estado)
                        if closest:
                            suggested_p = closest
                            suggested_md = format_md(closest, f"Mais próximo: {dist:.0f}km")
                            radius_cache[cep_prefix] = (suggested_md, suggested_p)
                            found_by_radius = True
            
            # Fallback final: por cidade
            if suggested_md == "Nenhum Ponto Encontrado" and cidade and estado:
                chave_cidade = f"{cidade}-{estado}"
                if chave_cidade in points_by_city:
                    suggested_p = points_by_city[chave_cidade][0]
                    suggested_md = format_md(suggested_p, "Cidade Exata")
            
            # Definir status do ponto
            status_ponto = "N/A"
            if suggested_p:
                status_ponto = "Ativo" if is_active(suggested_p) else "Desativado"
                
            results.append({
                "codigo": codigo,
                "estado": estado,
                "cidade": cidade,
                "cep": cep_raw if cep_clean else "",
                "md_sugerido": suggested_md,
                "md_status": status_ponto
            })
            
        return {"data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
