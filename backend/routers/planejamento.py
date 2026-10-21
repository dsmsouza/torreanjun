from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timedelta
from fastapi import UploadFile, File, Form
from services.planejamento_service import parse_and_save_rotas
import math

router = APIRouter(prefix="/api/planejamento", tags=["Planejamento"])

def haversine(lat1, lon1, lat2, lon2):
    # Radius of Earth in kilometers
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return distance

@router.post("/regional/{regional}/importar-planilhas")
async def importar_planilhas_rotas(
    regional: str,
    dia_semana: str = Form(...), # "DIAS_UTEIS" ou "SABADOS"
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    file_bytes = await file.read()
    return parse_and_save_rotas(db, file_bytes, dia_semana, regional)

@router.get("/regional/{regional}/clusterizar-rotas")
def clusterizar_rotas(
    regional: str,
    capacidade: int = Query(3000, description="Capacidade de volume do veículo"),
    data_operacao: str = Query(..., description="Data de referência (DD/MM/YYYY)"),
    db: Session = Depends(get_db)
):
    try:
        try:
            ref_dt = datetime.strptime(data_operacao, "%d/%m/%Y")
        except ValueError:
            ref_dt = datetime.now()
            
        # Get last 7 days strings
        last_7_days_dts = [ref_dt - timedelta(days=i) for i in range(6, -1, -1)]
        days_strs = [dt.strftime("%d/%m/%Y") for dt in last_7_days_dts]
        placeholders = ', '.join([f"'{d}'" for d in days_strs])

        # 1. Fetch MD coordinates for the regional (using the same logic from mapa)
        from routers.mapa import obter_pontos
        mapa_mds = obter_pontos(db)
        # Filter for regional and parse lat/lng
        mds_coord = {}
        for m in mapa_mds:
            if str(m.get("estado", "")).strip().upper() == regional.upper():
                lat = m.get("latitude")
                lng = m.get("longitude")
                md_code = m.get("md_codigo")
                if md_code and lat and lng and str(lat).lower() != "nan" and str(lng).lower() != "nan":
                    mds_coord[md_code] = {"lat": float(lat), "lng": float(lng)}

        if not mds_coord:
            return []

        # Escape single quotes in MD keys to prevent SQL syntax errors
        md_keys_sql = ', '.join([f"'{k.replace(chr(39), chr(39)+chr(39))}'" for k in mds_coord.keys()])

        # 2. Fetch Average Volume for the last 7 days
        vol_query = f"""
            SELECT md, AVG(total_pacotes_dia) as avg_vol
            FROM (
                SELECT md, dia_base, SUM(total_pacotes) as total_pacotes_dia
                FROM detalhe_cliente_md_historico
                WHERE md IN ({md_keys_sql}) AND dia_base IN ({placeholders})
                GROUP BY md, dia_base
            )
            GROUP BY md
        """
        vol_rows = db.execute(text(vol_query)).fetchall()
        
        md_data = {}
        for row in vol_rows:
            md_nome = row.md
            avg = row.avg_vol
            if avg and avg > 0:
                md_data[md_nome] = {
                    "md": md_nome,
                    "lat": mds_coord[md_nome]["lat"],
                    "lng": mds_coord[md_nome]["lng"],
                    "volume_medio": round(avg),
                    "anomalias": 0
                }

        if not md_data:
            return []

        md_keys_with_vol_sql = ', '.join([f"'{k.replace(chr(39), chr(39)+chr(39))}'" for k in md_data.keys()])

        # 3. Fetch Anomalies and Average Collection Time for the last 7 days
        anom_query = f"""
            SELECT md, 
                   SUM(CASE WHEN status_coleta IN ('Bipagem Pós-Coleta', 'Não Teve Coleta') THEN 1 ELSE 0 END) as qtd_anomalias,
                   AVG(CAST(strftime('%H', saida) AS INTEGER) * 60 + CAST(strftime('%M', saida) AS INTEGER)) as avg_time
            FROM auditoria_coleta
            WHERE md IN ({md_keys_with_vol_sql}) AND dia_base IN ({placeholders})
            GROUP BY md
        """
        anom_rows = db.execute(text(anom_query)).fetchall()
        for row in anom_rows:
            if row.md in md_data:
                md_data[row.md]["anomalias"] = row.qtd_anomalias
                md_data[row.md]["horario_medio"] = row.avg_time if row.avg_time else 1080 # default 18:00

        # Ensure all MDs have a default horario_medio if not in auditoria
        for md in md_data.values():
            if "horario_medio" not in md:
                md.setdefault("horario_medio", 1080)

        # 4. Fetch Fixed Routes
        is_saturday = ref_dt.weekday() == 5
        dia_semana_str = "SABADOS" if is_saturday else "DIAS_UTEIS"
        
        try:
            fixed_routes_query = text("""
                SELECT md_codigo, carro_id, ordem_coleta
                FROM planejamento_rotas_fixas
                WHERE dia_semana = :dia AND regional = :regional
            """)
            fixed_routes_rows = db.execute(fixed_routes_query, {"dia": dia_semana_str, "regional": regional}).fetchall()
        except:
            fixed_routes_rows = [] # Table might not exist yet if no upload was made
            
        fixed_routes_map = {}
        for r in fixed_routes_rows:
            fixed_routes_map[r.md_codigo] = {
                "carro_id": r.carro_id,
                "ordem_coleta": r.ordem_coleta
            }
            
        routes = []
        cluster_id_counter = 1
        colors = ["#EF4444", "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#06B6D4", "#EC4899", "#84CC16", "#14B8A6", "#6366F1", "#D946EF"]

        # 5. Group Fixed Routes First
        fixed_clusters = {}
        unassigned = []
        
        for md_nome, md_info in md_data.items():
            if md_nome in fixed_routes_map:
                carro_id = fixed_routes_map[md_nome]["carro_id"]
                ordem = fixed_routes_map[md_nome]["ordem_coleta"]
                md_info["ordem_coleta"] = ordem
                if carro_id not in fixed_clusters:
                    fixed_clusters[carro_id] = []
                fixed_clusters[carro_id].append(md_info)
            else:
                unassigned.append(md_info)
                
        for carro_id, route_mds in fixed_clusters.items():
            route_mds.sort(key=lambda x: x.get("ordem_coleta", 999))
            vol = sum(m["volume_medio"] for m in route_mds)
            routes.append({
                "cluster_id": cluster_id_counter,
                "carro_nome": str(carro_id),
                "is_fixed": True,
                "color": colors[(cluster_id_counter - 1) % len(colors)],
                "total_volume": vol,
                "mds": route_mds,
                "anomalias_total": sum(m["anomalias"] for m in route_mds)
            })
            cluster_id_counter += 1

        # 6. Greedy Clustering for remaining (Sweepers)
        # Sort by anomalies descending (critical first), then by volume descending
        unassigned.sort(key=lambda x: (x["anomalias"], x["volume_medio"]), reverse=True)
        
        while unassigned:
            current_route = []
            current_vol = 0
            
            # Start with the first available (highest volume)
            start_md = unassigned.pop(0)
            current_route.append(start_md)
            current_vol += start_md["volume_medio"]
            
            while True:
                best_md = None
                best_dist = float('inf')
                best_idx = -1
                
                # Find closest MD to the *last* MD added to the route
                last_md = current_route[-1]
                
                for i, md in enumerate(unassigned):
                    # Check if it fits
                    if current_vol + md["volume_medio"] <= capacidade:
                        dist = haversine(last_md["lat"], last_md["lng"], md["lat"], md["lng"])
                        if dist <= 15.0 and dist < best_dist:
                            best_dist = dist
                            best_md = md
                            best_idx = i
                            
                if best_md:
                    current_route.append(best_md)
                    current_vol += best_md["volume_medio"]
                    unassigned.pop(best_idx)
                else:
                    # No more MDs fit in this route
                    break
            
            # Sort the stops by historical collection time chronologically
            current_route.sort(key=lambda x: x["horario_medio"])
            
            routes.append({
                "cluster_id": cluster_id_counter,
                "carro_nome": f"Sweeper {cluster_id_counter}",
                "is_fixed": False,
                "color": colors[(cluster_id_counter - 1) % len(colors)],
                "total_volume": current_vol,
                "mds": current_route,
                "anomalias_total": sum(m["anomalias"] for m in current_route)
            })
            cluster_id_counter += 1

        return routes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao clusterizar rotas: {e}")
