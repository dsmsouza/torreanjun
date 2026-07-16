from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from models.models import MapaPontos
import pandas as pd
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class ObservacaoUpdate(BaseModel):
    observacao: Optional[str] = None

import os
import glob

@router.post("/processar")
async def processar_mapa(db: Session = Depends(get_db)):
    mapa_dir = r"C:\ANJUN\mapa"
    try:
        if not os.path.exists(mapa_dir):
            os.makedirs(mapa_dir)
            
        xlsx_files = glob.glob(os.path.join(mapa_dir, "*.xlsx"))
        if not xlsx_files:
            raise HTTPException(status_code=400, detail="Nenhuma planilha .xlsx encontrada na pasta C:\\ANJUN\\mapa")
            
        file_path = xlsx_files[0]
        df = pd.read_excel(file_path)
        
        # Clear existing points to replace with the new spreadsheet
        db.query(MapaPontos).delete()
        
        points = []
        for index, row in df.iterrows():
            if pd.isna(row.get('Collection point name')): continue
            
            p = MapaPontos(
                id=int(row.get('ID')) if not pd.isna(row.get('ID')) else index,
                iata=str(row.get('IATA')) if not pd.isna(row.get('IATA')) else "",
                nome=str(row.get('Collection point name', '')),
                estado=str(row.get('State/Province', '')),
                cidade=str(row.get('City', '')),
                endereco=str(row.get('Collection point address', '')),
                latitude=float(row.get('Latitude', 0)) if not pd.isna(row.get('Latitude')) else 0.0,
                longitude=float(row.get('Longitude', 0)) if not pd.isna(row.get('Longitude')) else 0.0,
                cep=str(row.get('Postal Code', '')),
                horario=str(row.get('HORARIO', '')),
                provedor=str(row.get('Designated pickup service provider', '')),
                status=str(row.get('Status na sehein', 'Enable')),
                observacao=""
            )
            points.append(p)
            
        db.bulk_save_objects(points)
        db.commit()
        return {"message": "Success", "rows_imported": len(points)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/points")
def get_points(db: Session = Depends(get_db)):
    points = db.query(MapaPontos).all()
    return points

@router.put("/points/{point_id}/observacao")
def update_observacao(point_id: int, payload: ObservacaoUpdate, db: Session = Depends(get_db)):
    point = db.query(MapaPontos).filter(MapaPontos.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point not found")
    
    point.observacao = payload.observacao
    db.commit()
    return {"message": "Observação atualizada com sucesso"}
