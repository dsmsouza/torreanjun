from fastapi import APIRouter, File, UploadFile, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, Optional
from pydantic import BaseModel
import pandas as pd
import io
import re
import math
import google.generativeai as genai

from database.connection import get_db

router = APIRouter(prefix="/api/mapa", tags=["Mapa"])

# ---- SCHEMA ----
class ObservacaoPayload(BaseModel):
    iata: str
    observacao: str = ""
    status_cor: str = "verde" # verde, amarelo, vermelho

class PontoPayload(BaseModel):
    iata: str
    collection_point_name: str
    endere_o: Optional[str] = ""
    cidade: Optional[str] = ""
    estado: Optional[str] = "SP"
    latitude: float
    longitude: float
    shein: Optional[str] = "enable"
    data_credenciamento: Optional[str] = None # YYYY-MM-DD

def garantir_tabelas_mapa(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS pontos_coleta (
            iata TEXT PRIMARY KEY,
            collection_point_name TEXT,
            endere_o TEXT,
            cidade TEXT,
            estado TEXT,
            latitude REAL,
            longitude REAL,
            shein TEXT DEFAULT 'enable',
            data_credenciamento TEXT
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS mapa_observacoes (
            iata TEXT PRIMARY KEY,
            observacao TEXT,
            status_cor TEXT
        )
    """))
    db.commit()

# ---- FUNÇÕES MATEMÁTICAS ----
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Raio da terra em km
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ---- ROTAS ----

@router.post("/importar")
async def importar_mapa(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = await file.read()
        
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler o arquivo Excel: {str(e)}")

        col_map = {}
        for col in df.columns:
            c_low = str(col).lower().strip()
            if 'endere' in c_low: col_map[col] = 'Endereço'
            if 'colection' in c_low or 'collection' in c_low or 'nome' in c_low:
                if 'Collection point name' not in col_map.values():
                    col_map[col] = 'Collection point name'
        df = df.rename(columns=col_map)
        
        if 'Latitude' not in df.columns or 'Longitude' not in df.columns:
            raise HTTPException(status_code=400, detail="Planilha não contém as colunas 'Latitude' e 'Longitude'.")

        def to_float(val):
            if pd.isna(val) or str(val).lower() == 'nan': return None
            try: return float(str(val).strip().replace(',', '.'))
            except: return None

        df['Latitude'] = df['Latitude'].apply(to_float)
        df['Longitude'] = df['Longitude'].apply(to_float)
        df = df.dropna(subset=['Latitude', 'Longitude'], how='any')

        df.columns = [re.sub(r'[^a-zA-Z0-9_]', '_', str(c).strip().lower()) for c in df.columns]
        df = df.where(pd.notnull(df), None)

        engine = db.get_bind()
        df.to_sql('pontos_coleta', con=engine, if_exists='replace', index=False)
        garantir_tabelas_mapa(db)

        return {"status": "success", "message": f"Mapa importado com sucesso! {len(df)} pontos registrados."}

    except HTTPException as he: raise he
    except Exception as e: raise HTTPException(status_code=500, detail=f"Erro: {str(e)}")

@router.get("/resumo-malha")
def get_resumo_malha(
    estado: Optional[str] = Query("TODOS"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        garantir_tabelas_mapa(db)
        
        # Get all points
        query = "SELECT p.*, o.observacao, o.status_cor FROM pontos_coleta p LEFT JOIN mapa_observacoes o ON p.iata = o.iata WHERE 1=1"
        params = {}
        if estado and estado.upper() != "TODOS":
            query += " AND UPPER(COALESCE(p.estado, 'SP')) = :uf"
            params["uf"] = estado.strip().upper()

        rows = db.execute(text(query), params).mappings().all()
        
        from datetime import datetime
        now = datetime.now()
        
        total_mds = len(rows)
        novos_count = 0
        cidades_map = {}
        estados_set = set()
        pontos_formatados = []

        for row in rows:
            p = dict(row)
            iata = p.get("iata") or ""
            cidade = (p.get("cidade") or "NÃO INFORMADA").strip().title()
            uf = (p.get("estado") or "SP").strip().upper()
            estados_set.add(uf)
            
            dt_cred = p.get("data_credenciamento")
            dias = 0
            if dt_cred:
                try:
                    d0 = datetime.strptime(str(dt_cred).split("T")[0], "%Y-%m-%d")
                    dias = (now - d0).days
                except Exception:
                    dias = 0
            
            is_novo = dias <= 60 and dias >= 0 and dt_cred is not None
            if is_novo:
                novos_count += 1
                
            p["dias_operacao"] = max(0, dias)
            p["is_novo_md"] = is_novo
            p["cidade"] = cidade
            p["estado"] = uf
            pontos_formatados.append(p)

            # Filter search term if passed
            if search and search.strip():
                s = search.strip().lower()
                cidade_match = s in cidade.lower()
                iata_match = s in iata.lower()
                nome_match = s in (p.get("collection_point_name") or "").lower()
                if not (cidade_match or iata_match or nome_match):
                    continue

            # Group by City
            key = f"{cidade} - {uf}"
            if key not in cidades_map:
                cidades_map[key] = {
                    "cidade": cidade,
                    "estado": uf,
                    "qtd_mds": 0,
                    "novos_mds": 0,
                    "pontos": []
                }
            cidades_map[key]["qtd_mds"] += 1
            if is_novo:
                cidades_map[key]["novos_mds"] += 1
            cidades_map[key]["pontos"].append({
                "iata": iata,
                "nome": p.get("collection_point_name"),
                "endereco": p.get("endere_o"),
                "shein": p.get("shein"),
                "latitude": p.get("latitude"),
                "longitude": p.get("longitude"),
                "is_novo_md": is_novo,
                "dias_operacao": max(0, dias)
            })

        cidades_list = sorted(list(cidades_map.values()), key=lambda x: x["qtd_mds"], reverse=True)

        return {
            "status": "success",
            "kpis": {
                "total_mds": total_mds,
                "total_cidades": len(cidades_map),
                "total_estados": len(estados_set),
                "novos_mds": novos_count
            },
            "cidades": cidades_list,
            "estados": sorted(list(estados_set)),
            "pontos": pontos_formatados
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar resumo da malha: {str(e)}")

@router.get("/pontos")
def obter_pontos(
    regional: Optional[str] = Query(None),
    status_shein: Optional[str] = Query("todos"),
    db: Session = Depends(get_db)
):
    try:
        garantir_tabelas_mapa(db)
        
        query = "SELECT p.*, o.observacao, o.status_cor FROM pontos_coleta p LEFT JOIN mapa_observacoes o ON p.iata = o.iata WHERE 1=1"
        params = {}
        
        if regional and regional != "TODOS":
            query += " AND (UPPER(p.estado) = :regional OR UPPER(p.estado) LIKE :regional_like)"
            params["regional"] = regional.upper()
            params["regional_like"] = f"%{regional.upper()}%"
            
        if status_shein and status_shein != "todos":
            query += " AND LOWER(p.shein) = :status_shein"
            params["status_shein"] = status_shein.lower()
            
        result = db.execute(text(query), params).mappings().all()
        pontos_formatados = []
        from datetime import datetime
        now = datetime.now()

        for row in result:
            p_dict = dict(row)
            dt_cred = p_dict.get("data_credenciamento")
            dias = 0
            if dt_cred:
                try:
                    d0 = datetime.strptime(str(dt_cred).split("T")[0], "%Y-%m-%d")
                    dias = (now - d0).days
                except Exception:
                    dias = 0
            p_dict["dias_operacao"] = max(0, dias)
            p_dict["is_novo_md"] = dias <= 60 and dias >= 0 and dt_cred is not None
            pontos_formatados.append(p_dict)

        return {"pontos": pontos_formatados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar pontos: {str(e)}")

@router.post("/pontos")
def cadastrar_ponto(payload: PontoPayload, db: Session = Depends(get_db)):
    try:
        garantir_tabelas_mapa(db)
        iata_clean = payload.iata.strip().upper()
        if not iata_clean:
            raise HTTPException(status_code=400, detail="Código IATA é obrigatório.")

        dt_cred = payload.data_credenciamento
        if not dt_cred:
            from datetime import datetime
            dt_cred = datetime.now().strftime("%Y-%m-%d")

        # Check existing
        check = db.execute(text("SELECT iata FROM pontos_coleta WHERE UPPER(iata) = :iata"), {"iata": iata_clean}).fetchone()
        if check:
            db.execute(text("""
                UPDATE pontos_coleta SET
                    collection_point_name = :nome,
                    endere_o = :end,
                    cidade = :cidade,
                    estado = :estado,
                    latitude = :lat,
                    longitude = :lon,
                    shein = :shein,
                    data_credenciamento = :dt_cred
                WHERE UPPER(iata) = :iata
            """), {
                "iata": iata_clean,
                "nome": payload.collection_point_name,
                "end": payload.endere_o or "",
                "cidade": payload.cidade or "",
                "estado": (payload.estado or "SP").upper(),
                "lat": payload.latitude,
                "lon": payload.longitude,
                "shein": payload.shein or "enable",
                "dt_cred": dt_cred
            })
        else:
            db.execute(text("""
                INSERT INTO pontos_coleta (iata, collection_point_name, endere_o, cidade, estado, latitude, longitude, shein, data_credenciamento)
                VALUES (:iata, :nome, :end, :cidade, :estado, :lat, :lon, :shein, :dt_cred)
            """), {
                "iata": iata_clean,
                "nome": payload.collection_point_name,
                "end": payload.endere_o or "",
                "cidade": payload.cidade or "",
                "estado": (payload.estado or "SP").upper(),
                "lat": payload.latitude,
                "lon": payload.longitude,
                "shein": payload.shein or "enable",
                "dt_cred": dt_cred
            })

        db.commit()
        return {"status": "success", "message": f"Ponto {iata_clean} cadastrado com sucesso!"}
    except HTTPException as he: raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao cadastrar ponto: {str(e)}")

@router.put("/pontos/{iata}")
def editar_ponto(iata: str, payload: PontoPayload, db: Session = Depends(get_db)):
    try:
        garantir_tabelas_mapa(db)
        iata_clean = iata.strip().upper()
        check = db.execute(text("SELECT iata FROM pontos_coleta WHERE UPPER(iata) = :iata"), {"iata": iata_clean}).fetchone()
        if not check:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")

        db.execute(text("""
            UPDATE pontos_coleta SET
                collection_point_name = :nome,
                endere_o = :end,
                cidade = :cidade,
                estado = :estado,
                latitude = :lat,
                longitude = :lon,
                shein = :shein,
                data_credenciamento = COALESCE(:dt_cred, data_credenciamento)
            WHERE UPPER(iata) = :iata
        """), {
            "iata": iata_clean,
            "nome": payload.collection_point_name,
            "end": payload.endere_o or "",
            "cidade": payload.cidade or "",
            "estado": (payload.estado or "SP").upper(),
            "lat": payload.latitude,
            "lon": payload.longitude,
            "shein": payload.shein or "enable",
            "dt_cred": payload.data_credenciamento
        })
        db.commit()
        return {"status": "success", "message": f"Ponto {iata_clean} atualizado com sucesso!"}
    except HTTPException as he: raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao editar ponto: {str(e)}")

@router.delete("/pontos/{iata}")
def excluir_ponto(iata: str, db: Session = Depends(get_db)):
    try:
        garantir_tabelas_mapa(db)
        iata_clean = iata.strip().upper()
        db.execute(text("DELETE FROM pontos_coleta WHERE UPPER(iata) = :iata"), {"iata": iata_clean})
        db.execute(text("DELETE FROM mapa_observacoes WHERE UPPER(iata) = :iata"), {"iata": iata_clean})
        db.commit()
        return {"status": "success", "message": f"Ponto {iata_clean} excluído com sucesso!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao excluir ponto: {str(e)}")


@router.post("/observacoes")
def salvar_observacao(payload: ObservacaoPayload, db: Session = Depends(get_db)):
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS mapa_observacoes (
                iata TEXT PRIMARY KEY,
                observacao TEXT,
                status_cor TEXT
            )
        """))
        
        # Upsert
        check = db.execute(text("SELECT iata FROM mapa_observacoes WHERE iata = :iata"), {"iata": payload.iata}).fetchone()
        if check:
            db.execute(text("""
                UPDATE mapa_observacoes SET observacao = :obs, status_cor = :cor WHERE iata = :iata
            """), {"iata": payload.iata, "obs": payload.observacao, "cor": payload.status_cor})
        else:
            db.execute(text("""
                INSERT INTO mapa_observacoes (iata, observacao, status_cor) VALUES (:iata, :obs, :cor)
            """), {"iata": payload.iata, "obs": payload.observacao, "cor": payload.status_cor})
            
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar observação: {str(e)}")

@router.get("/sugestoes-troca/{iata}")
def sugerir_troca_ia(iata: str, db: Session = Depends(get_db)):
    try:
        # Pega a chave da Gemini
        row = db.execute(text("SELECT valor FROM app_config WHERE chave = 'gemini_api_key'")).fetchone()
        if not row or not row[0]:
            raise HTTPException(status_code=400, detail="Chave do Gemini não configurada.")
        api_key = row[0]

        # Pega coord do alvo
        alvo = db.execute(text("SELECT iata, latitude, longitude, collection_point_name FROM pontos_coleta WHERE iata = :iata"), {"iata": iata}).fetchone()
        if not alvo:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")
            
        alvo_lat, alvo_lon = alvo[1], alvo[2]
        
        # Pega todos os outros pontos
        todos = db.execute(text("SELECT iata, latitude, longitude, collection_point_name, cidade, estado FROM pontos_coleta WHERE iata != :iata"), {"iata": iata}).fetchall()
        
        vizinhos = []
        for p in todos:
            if not p[1] or not p[2]: continue
            dist = haversine(alvo_lat, alvo_lon, p[1], p[2])
            if dist <= 5.0:
                vizinhos.append({"iata": p[0], "nome": p[3], "cidade": p[4], "distancia_km": round(dist, 2)})
                
        if not vizinhos:
            return {"sugestao_ia": "Nenhum ponto MD ativo encontrado num raio de 5km para substituir este."}
            
        # Pega volume total de cada vizinho (historico)
        # Fix possible trailing spaces in IATA
        iatas_vizinhos = [v["iata"].strip() if v["iata"] else "" for v in vizinhos]
        
        # Faz uma query in list
        placeholders = ','.join([':p' + str(i) for i in range(len(iatas_vizinhos))])
        params = {f'p{i}': iata for i, iata in enumerate(iatas_vizinhos)}
        
        # Na tabela detalhe_md_historico o IATA fica na coluna 'md'
        volumes = db.execute(text(f"SELECT TRIM(md), SUM(total) as vol_total FROM detalhe_md_historico WHERE TRIM(md) IN ({placeholders}) GROUP BY TRIM(md)"), params).fetchall()
        
        vol_map = {row[0]: row[1] or 0 for row in volumes}
        
        for v in vizinhos:
            clean_iata = v["iata"].strip() if v["iata"] else ""
            v["volume_historico"] = vol_map.get(clean_iata, 0)
            
        # Ordena ordem crescente de volume (vazios primeiro)
        vizinhos = sorted(vizinhos, key=lambda x: (x["volume_historico"], x["distancia_km"]))
        
        # Limita a top 5 sugestoes para a IA nao alucinar com lista enorme
        top_vizinhos = vizinhos[:5]
        
        # Prepara string pra IA (focando no IATA)
        texto_vizinhos = "\n".join([f"- IATA: {v['iata']} (Nome: {v['nome']}, Distância: {v['distancia_km']}km, Volume: {v['volume_historico']})" for v in top_vizinhos])
        
        prompt = f"""Estrategista logístico. O MD {alvo[0]} foi marcado para DESATIVAÇÃO.
Vizinhos próximos (<5km), do MENOS para o MAIS volumoso:
{texto_vizinhos}

Escreva uma recomendação ultra curta (2 parágrafos no máximo), indicando qual IATA deve herdar a carga, priorizando os mais ociosos (menor volume) e mais próximos."""

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name='gemini-2.5-flash')
        response = model.generate_content(prompt)
        
        return {"sugestao_ia": response.text.strip(), "vizinhos_brutos": top_vizinhos}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na IA/Matemática: {str(e)}")
