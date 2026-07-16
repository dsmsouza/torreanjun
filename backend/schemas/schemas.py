from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Justifications Schema
class JustificativaCreate(BaseModel):
    dia_base: str
    regional: str
    justificativa: str

class JustificativaResponse(BaseModel):
    id: int
    dia_base: str
    regional: str
    justificativa: str
    data_registro: Optional[datetime] = None

    class Config:
        from_attributes = True

# Options Schema (Filters)
class OptionsResponse(BaseModel):
    dias: List[str]
    semanas: List[str]

# Regional Summary Detail
class RegionalResumo(BaseModel):
    regional: str
    total: int
    backlog: int
    taxa_coleta: float
    erros_lacre: int

# General Summary Response
class ResumoGeralResponse(BaseModel):
    volume_total: int
    volume_backlog: int
    taxa_coleta: float
    taxa_backlog: float
    erros_lacre: int
    regionais: List[RegionalResumo]

# Micro-Distributors Performance Ranking
class MDRankingResponse(BaseModel):
    md: str
    regional: str
    cidade: str
    total: int
    backlog: int
    carregamento: int
    descarregamento: int
    erros_md: int
    taxa_coleta: float
    status_saude: Optional[str] = "N/A" # Decisions: Approved, Alert, Suspended
    observacao_fixa: Optional[str] = ""
    divisao: Optional[str] = None

# Clients Performance Ranking
class ClienteRankingResponse(BaseModel):
    nome_cliente: str
    total_pacotes: int
    total_backlog: int
    taxa_coleta: float

# Radar de Malha Active Package Status
class MalhaPacoteResponse(BaseModel):
    barcode: Optional[str] = None
    saca: Optional[str] = None
    md: Optional[str] = None
    regional: Optional[str] = None
    cidade: Optional[str] = None
    status: Optional[str] = None
    tempo_coleta: Optional[str] = None
    dias_parado: int

# Penalties Schema
class PenalidadeCreate(BaseModel):
    data_penalidade: str
    md: str
    motivo: str
    pontos: int

class PenalidadeResponse(BaseModel):
    id: int
    data_penalidade: str
    md: str
    motivo: str
    pontos: int

    class Config:
        from_attributes = True

# Permanent Alerts Schema
class ObservacaoFixaCreate(BaseModel):
    md: str
    observacao: str

class ObservacaoFixaResponse(BaseModel):
    md: str
    observacao: str

    class Config:
        from_attributes = True

# Health Score MD
class MDScoreResponse(BaseModel):
    md: str
    regional: str
    pontos_desconto: int
    score_final: int
    recomendacao: str

# IA Request / Response Schemas
class IACreate(BaseModel):
    tipo_relatorio: str
    filial: str
    contexto: Optional[str] = ""
    api_key: Optional[str] = None

class IAResponse(BaseModel):
    resultado: str

class MDAvaliarCreate(BaseModel):
    md: str
    decisao: str
    motivo: Optional[str] = ""

class IAOtimizarRequest(BaseModel):
    md_origem: str
    periodo_tipo: str
    rotulo: str
    api_key: Optional[str] = None

class MDOperacionalSave(BaseModel):
    md: str
    iata: str
    observacao: str
    status: str


