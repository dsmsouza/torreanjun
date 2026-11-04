from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database.connection import get_db
from models.models import PacoteSLA
import pandas as pd
import io
import datetime
from typing import Optional
from services.sla_servico import calcular_painel_sla_completo, sincronizar_sla_macro_api

router = APIRouter()


@router.get("/resumo")
def get_sla_resumo(dia: Optional[str] = Query(None, description="Data base (DD/MM/YYYY) ou None para o dia mais recente")):
    try:
        # Se dia não informado, pega a data de hoje ou mais recente
        if not dia or dia.upper() in ["TODOS", "LATEST", "HOJE", ""]:
            dia_ref = datetime.datetime.now().strftime("%d/%m/%Y")
        else:
            dia_ref = dia

        dados = calcular_painel_sla_completo(dia_ref)
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/abertos")
def get_abertos(
    dia: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    md: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db)
):
    try:
        if not dia or dia.upper() in ["TODOS", "LATEST", "HOJE", ""]:
            dia_ref = datetime.datetime.now().strftime("%d/%m/%Y")
        else:
            dia_ref = dia

        painel = calcular_painel_sla_completo(dia_ref)
        pacotes = painel.get("pacotes_abertos", [])

        # Aplicar filtros
        if regional and regional != "ALL":
            pacotes = [p for p in pacotes if p.get("regional") == regional]
        if status and status != "ALL":
            pacotes = [p for p in pacotes if p.get("status") == status]
        if md and md != "ALL":
            pacotes = [p for p in pacotes if p.get("md") == md]

        return {
            "dia_base": dia_ref,
            "total": len(pacotes),
            "items": pacotes[:limit]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sincronizar")
def post_sincronizar_sla(dia: Optional[str] = Query(None)):
    try:
        dia_ref = dia or datetime.datetime.now().strftime("%d/%m/%Y")
        res = sincronizar_sla_macro_api(dia_ref)
        return {"status": "success", "dia_base": dia_ref, "dados": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/importar_abertos")
async def importar_abertos(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        db.query(PacoteSLA).delete()
        points = []
        for index, row in df.iterrows():
            barcode = str(row.get('Código de Barras', row.get('Tracking', index)))
            if pd.isna(barcode) or barcode == 'nan': continue
            
            status_val = str(row.get('Status', ''))
            md_val = str(row.get('MD', row.get('Ponto', '')))
            regional_val = str(row.get('Regional', ''))
            data_hora_str = str(row.get('Tempo real para coleta', row.get('Data', '')))
            
            p = PacoteSLA(
                barcode=barcode,
                status=status_val,
                ponto_colecao=md_val,
                estado_origem=regional_val,
                tempo_coleta=data_hora_str
            )
            points.append(p)
            
        db.bulk_save_objects(points)
        db.commit()
        return {"message": "Success", "rows_imported": len(points)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

