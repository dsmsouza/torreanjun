from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, TIMESTAMP
from database.connection import Base

class HistoricoTorre(Base):
    __tablename__ = "historico_torre"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    volume_total = Column(Integer)
    volume_backlog = Column(Integer)
    taxa_coleta = Column(Float)
    taxa_backlog = Column(Float)
    erros_lacre = Column(Integer)
    semana_base = Column(String(50), index=True)

class DetalheMDHistorico(Base):
    __tablename__ = "detalhe_md_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    semana_base = Column(String(50), index=True)
    md = Column(String(100), index=True)
    regional = Column(String(50), index=True)
    estado = Column(String(50))
    total = Column(Integer)
    backlog = Column(Integer)
    carregamento = Column(Integer)
    descarregamento = Column(Integer)
    erros_md = Column(Integer)
    taxa_coleta = Column(Float)
    cidade = Column(String(100))
    divisao = Column(String(100), index=True)

class DetalheClienteHistorico(Base):
    __tablename__ = "detalhe_cliente_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    semana_base = Column(String(50), index=True)
    nome_cliente = Column(String(100), index=True)
    total_pacotes = Column(Integer)
    total_backlog = Column(Integer)
    taxa_coleta = Column(Float)

class DetalheClienteMDHistorico(Base):
    __tablename__ = "detalhe_cliente_md_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    semana_base = Column(String(50), index=True)
    nome_cliente = Column(String(100), index=True)
    md = Column(String(100), index=True)
    regional = Column(String(50), index=True)
    total_pacotes = Column(Integer)

class DetalhePicoHistorico(Base):
    __tablename__ = "detalhe_pico_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    md = Column(String(100), index=True)
    regional = Column(String(50), index=True)
    hora_bipagem = Column(String(50))
    volume = Column(Integer)

class DetalheLacresHistorico(Base):
    __tablename__ = "detalhe_lacres_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    md = Column(String(100), index=True)
    regional = Column(String(50), index=True)
    saca = Column(String(100))
    barcode = Column(String(100))

class PenalidadesMD(Base):
    __tablename__ = "penalidades_md"
    id = Column(Integer, primary_key=True, index=True)
    data_penalidade = Column(String(50))
    md = Column(String(100), index=True)
    motivo = Column(Text)
    pontos = Column(Integer)

class BacklogAging(Base):
    __tablename__ = "backlog_aging"
    # Treat barcode (codigo_barras) as PK for SQLAlchemy mappings
    codigo_barras = Column(String(100), primary_key=True)
    cliente = Column(String(100))
    saca = Column(String(100))
    data_bipagem = Column(String(50))
    status = Column(String(100))
    md = Column(String(100), index=True)
    estado = Column(String(50))
    cidade = Column(String(100))
    tipo_pedido = Column(String(100))

class AvaliacaoMD(Base):
    __tablename__ = "avaliacao_md"
    id = Column(Integer, primary_key=True, index=True)
    md = Column(String(100), index=True)
    decisao = Column(String(50))
    motivo = Column(Text)
    data_avaliacao = Column(String(50))

class OcorrenciasMD(Base):
    __tablename__ = "ocorrencias_md"
    id = Column(Integer, primary_key=True, index=True)
    data_registro = Column(String(50))
    md = Column(String(100), index=True)
    motivo = Column(String(200))
    observacao = Column(Text)

class JustificativasDiarias(Base):
    __tablename__ = "justificativas_diarias"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    regional = Column(String(50), index=True)
    justificativa = Column(Text)
    data_registro = Column(TIMESTAMP)

class MDObservacoesFixas(Base):
    __tablename__ = "md_observacoes_fixas"
    md = Column(String(100), primary_key=True)
    observacao = Column(Text)

class MalhaCoordenadas(Base):
    __tablename__ = "malha_coordenadas"
    id = Column(Integer, primary_key=True, index=True)
    md_codigo = Column(String(100), unique=True, index=True)
    nome_ponto = Column(String(200))
    latitude = Column(Float)
    longitude = Column(Float)
    cep = Column(String(20))
    endereco = Column(Text)
    horario_trabalho = Column(String(100))
    cidade = Column(String(100))
    estado = Column(String(50))
    regional = Column(String(100)) # Nova coluna adicionada na planilha
    divisao = Column(String(100), index=True)
    funcionando = Column(String(50), default="ATIVADO") # Novo status de ativação do ponto
    histograma = Column(Text) # Histograma de bipagem

class MDSLA(Base):
    __tablename__ = "md_sla"
    md = Column(String(100), primary_key=True, index=True)
    sla_horas = Column(Integer)
    regiao = Column(String(50))

class PacoteSLA(Base):
    __tablename__ = "pacotes_sla"
    id = Column(Integer, primary_key=True, index=True)
    pedido_coleta = Column(String(100), index=True)
    barcode = Column(String(100), index=True)
    status = Column(String(50))
    cliente_merchant = Column(String(200))
    estado_origem = Column(String(50))
    cidade_origem = Column(String(100))
    cep_remetente = Column(String(20))
    plataforma = Column(String(50))
    ponto_colecao = Column(String(100), index=True)
    tempo_coleta = Column(String(50))
    tempo_carregamento_1 = Column(String(50))
    tempo_descarga_1 = Column(String(50))
    tempo_carregamento_2 = Column(String(50))
    tempo_descarga_2 = Column(String(50))
    tempo_assinatura = Column(String(50))
    data_conclusao = Column(String(50))
    placa_carga_1 = Column(String(50))
    placa_carga_2 = Column(String(50))
    duracao_transfer = Column(Float)
    duracao_transporte = Column(Float)
    duracao_arrival = Column(Float)

class MapaPontos(Base):
    __tablename__ = "mapa_pontos"
    id = Column(Integer, primary_key=True, index=True)
    iata = Column(String(50))
    nome = Column(String(200))
    estado = Column(String(50), index=True)
    cidade = Column(String(100), index=True)
    endereco = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    cep = Column(String(20), index=True)
    horario = Column(String(100))
    provedor = Column(String(100))
    status = Column(String(50), index=True)
    observacao = Column(Text)
