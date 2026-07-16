from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database.connection import get_db
from models.models import DetalheMDHistorico

router = APIRouter()

@router.get("/dados")
def get_evolucao_dados(db: Session = Depends(get_db)):
    try:
        # Group by semana_base and regional
        rows = db.query(
            DetalheMDHistorico.dia_base,
            DetalheMDHistorico.semana_base,
            DetalheMDHistorico.regional,
            func.sum(DetalheMDHistorico.total).label("total_pacotes"),
            func.sum(DetalheMDHistorico.backlog).label("total_backlog")
        ).group_by(
            DetalheMDHistorico.dia_base,
            DetalheMDHistorico.semana_base,
            DetalheMDHistorico.regional
        ).all()
        
        results = []
        for r in rows:
            # Avoid division by zero for SLA
            if r.total_pacotes and r.total_pacotes > 0:
                sla = ((r.total_pacotes - r.total_backlog) / r.total_pacotes) * 100
            else:
                sla = 0
                
            results.append({
                "dia_base": r.dia_base,
                "semana_base": r.semana_base,
                "regional": r.regional,
                "total_pacotes": r.total_pacotes or 0,
                "total_backlog": r.total_backlog or 0,
                "sla_coleta": round(sla, 2)
            })
            
        return {"data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
