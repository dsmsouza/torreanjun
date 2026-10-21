from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database.connection import get_db
from models.models import BacklogAging, MalhaCoordenadas
import pandas as pd
from functools import lru_cache

router = APIRouter(
    prefix="/api/backlog",
    tags=["Backlog"]
)

class BacklogGeralItem(BaseModel):
    codigo_barras: str
    status: str
    dias_parado: int
    data_bipagem: Optional[str] = None
    md: str
    regional: str
    cidade: str

@lru_cache(maxsize=1)
def get_regional_map():
    try:
        df = pd.read_excel(r'C:\ANJUN\PONTOS E REGIONAIS.xlsx')
        # Map MD -> REGIONAL
        return dict(zip(df['MD'], df['REGIONAL']))
    except Exception as e:
        print(f"Erro ao ler PONTOS E REGIONAIS.xlsx: {e}")
        return {}

@router.get("/geral", response_model=List[BacklogGeralItem])
def get_backlog_geral(db: Session = Depends(get_db)):
    # Buscar todos os itens de backlog
    backlog_db = db.query(BacklogAging).all()
    
    # Buscar informações de regional e cidade na malha (fallback)
    malha_db = db.query(MalhaCoordenadas).all()
    malha_map = {m.md_codigo: m for m in malha_db}
    
    # Map from excel
    excel_map = get_regional_map()
    
    resultado = []
    
    for b in backlog_db:
        # Calcular dias parado
        dias = 0
        if b.data_bipagem:
            try:
                dt_str = b.data_bipagem.split(" ")[0].strip()
                try:
                    dt_bip = datetime.strptime(dt_str, "%Y-%m-%d")
                except ValueError:
                    dt_bip = datetime.strptime(dt_str, "%d/%m/%Y")
                dias = max(0, (datetime.now() - dt_bip).days)
            except Exception:
                dias = 0
                
        # Obter regional: primeiro da planilha, depois fallback malha
        regional = excel_map.get(b.md)
        malha_info = malha_map.get(b.md)
        
        if pd.isna(regional) or not regional:
            regional = malha_info.regional if malha_info and malha_info.regional else "N/A"
            
        cidade = malha_info.cidade if malha_info and malha_info.cidade else (b.cidade or "N/A")
        
        resultado.append(BacklogGeralItem(
            codigo_barras=b.codigo_barras or "",
            status=b.status or "",
            dias_parado=dias,
            data_bipagem=b.data_bipagem,
            md=b.md or "",
            regional=str(regional),
            cidade=cidade
        ))
        
    return resultado
