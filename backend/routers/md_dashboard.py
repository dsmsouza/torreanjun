from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from database.connection import get_db
from models.models import (
    MalhaCoordenadas,
    DetalheMDHistorico,
    PenalidadesMD,
    OcorrenciasMD,
    BacklogAging
)

router = APIRouter(
    prefix="/api/md",
    tags=["MD Dashboard 360"]
)

# Schemas para o Dashboard 360
class HistoricoVolumeMD(BaseModel):
    dia_base: str
    total: int
    backlog: int
    taxa_coleta: float

class PenalidadeMD(BaseModel):
    id: int
    data_penalidade: str
    motivo: str
    pontos: int

class OcorrenciaMD(BaseModel):
    data_registro: str
    motivo: str
    observacao: str

class BacklogItem(BaseModel):
    codigo_barras: str
    status: str
    dias_parado: Optional[int] = 0

class MDDashboardResponse(BaseModel):
    # Perfil
    md_codigo: str
    nome_ponto: str
    endereco: str
    cep: str
    cidade: str
    estado: str
    regional: str
    divisao: Optional[str]
    horario_trabalho: str
    funcionando: str
    latitude: Optional[float]
    longitude: Optional[float]
    
    # Metricas (Agregados ou Último dia)
    taxa_coleta_atual: Optional[float]
    volume_total_atual: Optional[int]
    backlog_atual: Optional[int]
    
    # Históricos
    historico_volume: List[HistoricoVolumeMD]
    penalidades: List[PenalidadeMD]
    ocorrencias: List[OcorrenciaMD]
    
    # Backlog
    backlog_pendente: List[BacklogItem]


@router.get("/{codigo_md}/dashboard", response_model=MDDashboardResponse)
def get_md_dashboard(codigo_md: str, db: Session = Depends(get_db)):
    # Buscar perfil em MalhaCoordenadas
    perfil = db.query(MalhaCoordenadas).filter(MalhaCoordenadas.md_codigo == codigo_md).first()
    if not perfil:
        raise HTTPException(status_code=404, detail="MD não encontrado na malha de coordenadas.")

    # Buscar histórico de volume e performance ordenado por dia_base (até 1 ano para agrupamentos)
    historico_db = db.query(DetalheMDHistorico).filter(DetalheMDHistorico.md == codigo_md).order_by(DetalheMDHistorico.dia_base.desc()).limit(365).all()
    # Reverse to have chronological order
    historico_db = historico_db[::-1]
    
    historico = []
    taxa_atual = 0.0
    vol_atual = 0
    bk_atual = 0
    
    regional_real = perfil.regional
    divisao_real = perfil.divisao

    if historico_db:
        ultimo = historico_db[-1]
        taxa_atual = ultimo.taxa_coleta
        vol_atual = ultimo.total
        bk_atual = ultimo.backlog
        
        # Override regional/divisao with more accurate data from history if available
        if ultimo.regional and ultimo.regional != "OUTRAS":
            regional_real = ultimo.regional
        if hasattr(ultimo, 'divisao') and ultimo.divisao:
            divisao_real = ultimo.divisao
        
        for h in historico_db:
            historico.append(HistoricoVolumeMD(
                dia_base=h.dia_base,
                total=h.total or 0,
                backlog=h.backlog or 0,
                taxa_coleta=h.taxa_coleta or 0.0
            ))

    # Buscar penalidades
    penalidades_db = db.query(PenalidadesMD).filter(PenalidadesMD.md == codigo_md).order_by(PenalidadesMD.data_penalidade.desc()).limit(10).all()
    penalidades = [
        PenalidadeMD(
            id=p.id,
            data_penalidade=p.data_penalidade,
            motivo=p.motivo,
            pontos=p.pontos or 0
        ) for p in penalidades_db
    ]
    
    # Buscar ocorrencias
    ocorrencias_db = db.query(OcorrenciasMD).filter(OcorrenciasMD.md == codigo_md).order_by(OcorrenciasMD.data_registro.desc()).limit(10).all()
    ocorrencias = [
        OcorrenciaMD(
            data_registro=o.data_registro,
            motivo=o.motivo or "",
            observacao=o.observacao or ""
        ) for o in ocorrencias_db
    ]

    # Buscar backlog
    backlog_db = db.query(BacklogAging).filter(BacklogAging.md == codigo_md).all()
    from datetime import datetime
    backlog_pendente = []
    
    for b in backlog_db:
        # Calcular dias parado (simples heuristica caso data_bipagem seja YYYY-MM-DD HH:MM:SS)
        dias = 0
        if b.data_bipagem:
            try:
                # Tenta parsear para pegar a diferença de dias até hoje
                dt_bip = datetime.strptime(b.data_bipagem.split(" ")[0], "%Y-%m-%d")
                dias = (datetime.now() - dt_bip).days
            except:
                pass
        
        backlog_pendente.append(BacklogItem(
            codigo_barras=b.codigo_barras,
            status=b.status or "",
            dias_parado=dias
        ))

    return MDDashboardResponse(
        md_codigo=perfil.md_codigo,
        nome_ponto=perfil.nome_ponto or "",
        endereco=perfil.endereco or "",
        cep=perfil.cep or "",
        cidade=perfil.cidade or "",
        estado=perfil.estado or "",
        regional=regional_real or "",
        divisao=divisao_real,
        horario_trabalho=perfil.horario_trabalho or "",
        funcionando=perfil.funcionando or "",
        latitude=perfil.latitude,
        longitude=perfil.longitude,
        taxa_coleta_atual=taxa_atual,
        volume_total_atual=vol_atual,
        backlog_atual=bk_atual,
        historico_volume=historico,
        penalidades=penalidades,
        ocorrencias=ocorrencias,
        backlog_pendente=backlog_pendente
    )
