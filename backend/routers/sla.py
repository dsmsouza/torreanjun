from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database.connection import get_db
from models.models import PacoteSLA
import pandas as pd
import io
from datetime import datetime

router = APIRouter()

def parse_date(date_str):
    if pd.isna(date_str) or not date_str:
        return None
    try:
        # Example: "2026-07-01 14:30:00"
        return pd.to_datetime(date_str)
    except:
        return None

@router.post("/importar_abertos")
async def importar_abertos(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # We will map "saco selado/coletado" and "foi assinado" to PacoteSLA
        # Let's clear the old ones to keep only the open ones
        db.query(PacoteSLA).delete()
        
        now = datetime.now()
        
        points = []
        for index, row in df.iterrows():
            barcode = str(row.get('Código de Barras', row.get('Tracking', index)))
            if pd.isna(barcode) or barcode == 'nan': continue
            
            status = str(row.get('Status', ''))
            md = str(row.get('MD', row.get('Ponto', '')))
            regional = str(row.get('Regional', ''))
            data_hora_str = str(row.get('Tempo real para coleta', row.get('Data', '')))
            
            p = PacoteSLA(
                barcode=barcode,
                status=status,
                ponto_colecao=md,
                estado_origem=regional, # Reusing this column for Regional
                tempo_coleta=data_hora_str
            )
            points.append(p)
            
        db.bulk_save_objects(points)
        db.commit()
        return {"message": "Success", "rows_imported": len(points)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/abertos")
def get_abertos(db: Session = Depends(get_db)):
    try:
        rows = db.query(PacoteSLA).all()
        now = datetime.now()
        
        results = []
        for r in rows:
            # Calculate dias parados
            dias_parados = None
            if r.tempo_coleta and r.tempo_coleta != 'nan':
                try:
                    dt = pd.to_datetime(r.tempo_coleta)
                    delta = now - dt
                    dias_parados = max(0, delta.days)
                except:
                    pass
                    
            results.append({
                "barcode": r.barcode,
                "status": r.status,
                "md": r.ponto_colecao,
                "regional": r.estado_origem,
                "data_hora": r.tempo_coleta,
                "dias_parados": dias_parados
            })
            
        return {"items": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
