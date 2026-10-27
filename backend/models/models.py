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
    nome_cliente = Column(String(100), index=True)
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
    tipo_ponto = Column(String(100), default="MD (Ponto de Coleta)") # Tipo: MD, HUB, Galpão, Crossdocking, P.A
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

class MDMapping(Base):
    __tablename__ = "md_mapping"
    id = Column(Integer, primary_key=True, index=True)
    md_codigo = Column(String(100), unique=True, index=True)
    estado = Column(String(50))
    regional = Column(String(100))
    tipo_ponto = Column(String(100), default="MD (Ponto de Coleta)")
    ativo = Column(Integer, default=1)

class RangeroverData(Base):
    __tablename__ = "rangerover_data"
    id = Column(Integer, primary_key=True, index=True)
    data_operacao = Column(String(50), index=True)
    md = Column(String(100), index=True)
    placa = Column(String(50))
    motorista = Column(String(150))
    entrada = Column(String(50))
    saida = Column(String(50))
    confirmador_entrada = Column(String(100))
    confirmador_saida = Column(String(100))
    qtd_sacos = Column(Integer)
    qtd_votos = Column(Integer)
    observacao = Column(Text)

class AuditoriaColeta(Base):
    __tablename__ = "auditoria_coleta"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    md = Column(String(100), index=True)
    regional = Column(String(50))
    status_coleta = Column(String(100))
    placa = Column(String(50))
    motorista = Column(String(150))
    entrada = Column(String(50))
    saida = Column(String(50))
    confirmador_entrada = Column(String(100))
    confirmador_saida = Column(String(100))
    qtd_sacos = Column(Integer)
    qtd_votos = Column(Integer)
    observacao = Column(Text)
    pacotes_atrasados = Column(Integer, default=0)
    ultimo_pacote_hora = Column(String(50))
    ultimo_pacote_barcode = Column(String(100))

class DetalhePickupHistorico(Base):
    __tablename__ = "detalhe_pickup_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    semana_base = Column(String(50), index=True)
    nome_cliente = Column(String(100), index=True)      # Marketplace (SHEIN, KWAI, etc.)
    merchant_id = Column(String(100), index=True)       # Número do Cliente Comerciante
    merchant_nome = Column(String(200), index=True)     # Nome do Cliente Merchant
    cep_remetente = Column(String(20), index=True)
    estado = Column(String(50), index=True)
    cidade = Column(String(100), index=True)
    bairro = Column(String(150))                        # área do envio
    endereco = Column(Text)                             # Endereço do envio
    regional = Column(String(50), index=True)
    tipo_coleta = Column(String(50))                    # 'PICKUP_PURO' ou 'PICKUP_NO_MD'
    md_vinculado = Column(String(100), index=True)      # Se dropou em MD, qual foi a IATA
    tipo_pedido = Column(String(50))                    # Normal, etc.
    total_pacotes = Column(Integer, default=0)
    total_backlog = Column(Integer, default=0)
    taxa_coleta = Column(Float, default=100.0)

class CriacaoPedidosHistorico(Base):
    __tablename__ = "criacao_pedidos_historico"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    semana_base = Column(String(50), index=True)
    nome_cliente = Column(String(100), index=True)        # Shein, temud2d, Kwai, etc.
    merchant_id = Column(String(100), index=True)
    merchant_nome = Column(String(200), index=True)
    cep_remetente = Column(String(20), index=True)
    estado = Column(String(50), index=True)
    cidade = Column(String(100), index=True)
    bairro = Column(String(150), index=True)
    logradouro = Column(String(250))
    numero = Column(String(50))
    endereco_completo = Column(Text)
    maneira_coleta = Column(String(100))
    ponto_colecao = Column(String(100), index=True, nullable=True)
    tipo_pedido = Column(String(100), index=True, nullable=True)
    status_pedido = Column(String(100), index=True, nullable=True)
    total_pedidos = Column(Integer, default=0)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

class CriacaoResumoCep(Base):
    __tablename__ = "criacao_resumo_cep"
    id = Column(Integer, primary_key=True, index=True)
    dia_base = Column(String(50), index=True)
    semana_base = Column(String(50), index=True)
    nome_cliente = Column(String(100), index=True)
    cep = Column(String(20), index=True)
    estado = Column(String(50), index=True)
    cidade = Column(String(100), index=True)
    bairro = Column(String(150), index=True)
    total_pedidos = Column(Integer, default=0)
    qtd_sellers = Column(Integer, default=0)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)


class PropostaExpansao(Base):
    """Propostas de abertura de novos MDs registradas pelo analista de expansão."""
    __tablename__ = "proposta_expansao"
    id = Column(Integer, primary_key=True, index=True)
    # Localização alvo
    cidade = Column(String(100), index=True)
    estado = Column(String(50), index=True)
    bairro = Column(String(150))
    cep_alvo = Column(String(20))
    # Dados de demanda
    volume_estimado = Column(Integer, default=0)       # pedidos/dia estimados
    qtd_sellers_estimada = Column(Integer, default=0)  # sellers potenciais
    distancia_md_mais_proximo = Column(Float, nullable=True)  # km
    md_mais_proximo = Column(String(100), nullable=True)
    # Clientes principais
    clientes_principais = Column(Text, nullable=True)  # JSON string
    # Proposta
    justificativa = Column(Text)
    status = Column(String(50), default="Em Análise", index=True)  # Em Análise | Aprovada | Recusada | Em Implantação
    prioridade = Column(String(20), default="MEDIA")   # ALTA | MEDIA | BAIXA
    # Auditoria
    criado_em = Column(String(50))
    atualizado_em = Column(String(50))
    criado_por = Column(String(100), default="Analista")
    observacoes = Column(Text, nullable=True)          # notas internas


class ClienteMapping(Base):
    __tablename__ = "cliente_mapping"
    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(String(50), unique=True, index=True, nullable=False)   # ex: "24005"
    nome_exibicao = Column(String(100), nullable=False)                         # ex: "Shein"
    ativo = Column(Integer, default=1)                                          # 1=ativo, 0=ignorar
    criado_em = Column(String(50))
    atualizado_em = Column(String(50))


class SellerPickupRegistry(Base):
    """Registro e histórico de ciclo de vida de sellers de Coleta Porta-a-Porta (Pickup)."""
    __tablename__ = "sellers_pickup_registry"
    merchant_id = Column(String(100), primary_key=True, index=True)
    merchant_nome = Column(String(200), index=True)
    primeiro_cliente = Column(String(100), index=True)      # TikTok, Shein, TemuD2D, CeA, etc.
    primeira_data = Column(String(50), index=True)          # DD/MM/YYYY
    primeira_data_iso = Column(String(20), index=True)      # YYYY-MM-DD
    primeira_semana = Column(String(50), index=True)
    estado_origem = Column(String(50), index=True)
    cidade_origem = Column(String(100), index=True)
    bairro_origem = Column(String(150), index=True)
    cep_origem = Column(String(20), index=True)
    endereco_origem = Column(Text, nullable=True)
    volume_primeiro_dia = Column(Integer, default=0)
    volume_acumulado_total = Column(Integer, default=0)
    total_dias_ativos = Column(Integer, default=1)
    ultima_data = Column(String(50), index=True)
    ultima_data_iso = Column(String(20), index=True)
    status_seller = Column(String(50), default="Novo", index=True) # Novo | Recorrente | Inativo


class RotasMotoristasHistorico(Base):
    """Histórico diário de atribuição de rotas de motoristas e MDs em SP."""
    __tablename__ = "rotas_motoristas_historico"
    id = Column(Integer, primary_key=True, autoincrement=True)
    dia_base = Column(String(50), index=True)              # DD/MM/YYYY
    semana_base = Column(String(50), index=True)
    motorista_nome = Column(String(200), index=True)
    motorista_id = Column(String(100), index=True, nullable=True)
    placa = Column(String(50), nullable=True)
    veiculo_tipo = Column(String(100), default="Van")      # Van, VUC, Carro, Caminhão
    horario_previsto = Column(String(100), nullable=True)   # Ex: '08:00 - 12:00'
    md_codigo = Column(String(100), index=True)            # Código do MD (ex: 'MD-ETT-01')
    nome_ponto = Column(String(200), nullable=True)
    cidade = Column(String(100), default="São Paulo")
    estado = Column(String(50), default="SP")
    bairro = Column(String(150), nullable=True)
    sequencia_parada = Column(Integer, default=1)
    status_coleta = Column(String(50), default="Agendada") # Agendada | Em Coleta | Concluída


class SolicitacaoImplantacao(Base):
    """Fluxo de Implantação de Novas Solicitações - FM"""
    __tablename__ = "solicitacoes_implantacao"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    codigo = Column(String(50), unique=True, index=True)
    cliente_id = Column(String(50), nullable=True, index=True) # Codigo TMS / Cliente Anjun (ex: 24355, 24596)
    
    # 1. Comercial -> Projetos
    cliente_nome = Column(String(200), index=True, nullable=False)
    vendedor_comercial = Column(String(150), nullable=False)
    focal_projetos = Column(String(150), default="@Diego de Souza Mandarino")
    focal_operacao = Column(String(150), default="@Thatiane Silva Santos")
    segmento = Column(String(100), nullable=True)
    endereco_coleta = Column(Text, nullable=True)
    cidade = Column(String(100), index=True)
    estado = Column(String(50), index=True)
    cep = Column(String(20), nullable=True)
    volume_estimado_diario = Column(Integer, default=0)
    horario_coleta_janela = Column(String(100), nullable=True)
    observacoes_comercial = Column(Text, nullable=True)
    data_solicitacao = Column(String(50), index=True)
    
    # Status principal (Pipeline)
    # Valores: "Em análise" | "Visita técnica" | "Em preparação" | "Go-Live definido" | "Concluído" | "Restrição/Pendente"
    status = Column(String(50), default="Em análise", index=True)
    
    # 2. Projetos -> Operação (Análise de Viabilidade)
    # Condição: "① Início imediato" | "② Necessidade de prazo para implantação" | "③ Baixa aderência / restrição operacional"
    condicao_viabilidade = Column(String(100), nullable=True)
    capacidade_operacional_ok = Column(Integer, default=1)
    disponibilidade_frota_ok = Column(Integer, default=1)
    atendimento_regiao_ok = Column(Integer, default=1)
    necessidade_contratacao_equipe = Column(Integer, default=0)
    necessidade_novas_rotas = Column(Integer, default=0)
    estrutura_equipamentos_ok = Column(Integer, default=1)
    parecer_operacional = Column(Text, nullable=True)
    
    # 3. Projetos + Operação -> Visita Técnica
    status_visita = Column(String(50), default="Pendente") # Pendente | Agendada | Realizada
    data_visita_tecnica = Column(String(50), nullable=True)
    relatorio_visita = Column(Text, nullable=True)
    
    # 4. Operação -> Definição de Recursos e Go-Live
    pda_qtd = Column(Integer, default=0)
    mesa_posto_operacional = Column(String(200), nullable=True)
    equipamentos_desc = Column(Text, nullable=True)
    equipe_contratacao_desc = Column(Text, nullable=True)
    rotas_frota_desc = Column(Text, nullable=True)
    insumos_desc = Column(Text, nullable=True)
    outros_recursos = Column(Text, nullable=True)
    data_go_live_prevista = Column(String(50), nullable=True)
    go_live_validado_operacao = Column(Integer, default=0) # 1 = validado
    
    # 5. Projetos -> Comercial (Comunicação do Go-Live)
    comunicado_comercial_em = Column(String(50), nullable=True)
    comercial_ciente = Column(Integer, default=0)

    # 6. Parecer e Opinião do Gestor da Área FM (Qualitativo & Decisão Estratégica)
    gestor_nome = Column(String(150), default="Gestor FM / Projetos")
    parecer_gestor_decisao = Column(String(50), default="Pendente") # Pendente | Aprovado | Aprovado com Ressalvas | Reprovado / Reavaliar
    parecer_gestor_texto = Column(Text, nullable=True)
    parecer_gestor_ressalvas = Column(Text, nullable=True)
    parecer_gestor_data = Column(String(50), nullable=True)
    
    # Datas de Auditoria
    criado_em = Column(String(50))
    atualizado_em = Column(String(50))
    historico_status = Column(Text, nullable=True) # JSON list of status changes



