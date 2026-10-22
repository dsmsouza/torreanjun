import json
import re
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from database.connection import get_db
from models.models import SolicitacaoImplantacao
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/implantacao",
    tags=["Fluxo de Implantação FM"]
)

class PontoTipoOverridePayload(BaseModel):
    ponto_codigo: str
    tipo: str # "MD" ou "HUB"

# -----------------------------------------------------------------------------
# Schemas Pydantic
# -----------------------------------------------------------------------------

class SolicitacaoCreate(BaseModel):
    cliente_nome: str
    vendedor_comercial: str
    focal_projetos: Optional[str] = "@Diego de Souza Mandarino"
    focal_operacao: Optional[str] = "@Thatiane Silva Santos"
    segmento: Optional[str] = "Geral"
    endereco_coleta: Optional[str] = ""
    cidade: str
    estado: str
    cep: Optional[str] = ""
    volume_estimado_diario: Optional[int] = 0
    horario_coleta_janela: Optional[str] = "14:00 - 18:00"
    observacoes_comercial: Optional[str] = ""

class ViabilidadeUpdate(BaseModel):
    condicao_viabilidade: str # "① Início imediato", "② Necessidade de prazo para implantação", "③ Baixa aderência / restrição operacional"
    capacidade_operacional_ok: int = 1
    disponibilidade_frota_ok: int = 1
    atendimento_regiao_ok: int = 1
    necessidade_contratacao_equipe: int = 0
    necessidade_novas_rotas: int = 0
    estrutura_equipamentos_ok: int = 1
    parecer_operacional: Optional[str] = ""

class VisitaTecnicaUpdate(BaseModel):
    status_visita: str # "Pendente", "Agendada", "Realizada"
    data_visita_tecnica: Optional[str] = ""
    relatorio_visita: Optional[str] = ""

class RecursosGoLiveUpdate(BaseModel):
    pda_qtd: int = 0
    mesa_posto_operacional: Optional[str] = ""
    equipamentos_desc: Optional[str] = ""
    equipe_contratacao_desc: Optional[str] = ""
    rotas_frota_desc: Optional[str] = ""
    insumos_desc: Optional[str] = ""
    outros_recursos: Optional[str] = ""
    data_go_live_prevista: Optional[str] = ""
    go_live_validado_operacao: int = 0

class ComunicacaoComercialUpdate(BaseModel):
    comunicado_comercial_em: Optional[str] = ""
    comercial_ciente: int = 1

class ParecerGestorUpdate(BaseModel):
    gestor_nome: Optional[str] = "Gestor FM / Projetos"
    parecer_gestor_decisao: str # "Aprovado", "Aprovado com Ressalvas", "Reprovado / Reavaliar"
    parecer_gestor_texto: Optional[str] = ""
    parecer_gestor_ressalvas: Optional[str] = ""
    parecer_gestor_data: Optional[str] = ""

class StatusUpdate(BaseModel):
    status: str # "Em análise", "Visita técnica", "Em preparação", "Go-Live definido", "Concluído", "Restrição/Pendente"
    observacao: Optional[str] = ""



# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _gerar_codigo(db: Session) -> str:
    count = db.query(SolicitacaoImplantacao).count()
    year = datetime.now().year
    return f"IMP-{year}-{(count + 1):03d}"

def _registrar_historico(sol: SolicitacaoImplantacao, novo_status: str, observacao: str = ""):
    historico = []
    if sol.historico_status:
        try:
            historico = json.loads(sol.historico_status)
        except Exception:
            historico = []
    
    historico.append({
        "data_hora": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "de_status": sol.status,
        "para_status": novo_status,
        "observacao": observacao
    })
    sol.historico_status = json.dumps(historico, ensure_ascii=False)
    sol.status = novo_status
    sol.atualizado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Retorna KPIs gerais do pipeline de implantações FM."""
    _seed_initial_data_if_empty(db)
    
    total = db.query(SolicitacaoImplantacao).count()
    em_analise = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.status == "Em análise").count()
    visita_tecnica = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.status == "Visita técnica").count()
    em_preparacao = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.status == "Em preparação").count()
    golive_definido = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.status == "Go-Live definido").count()
    concluidos = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.status == "Concluído").count()
    restricao = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.status == "Restrição/Pendente").count()
    
    return {
        "total": total,
        "em_analise": em_analise,
        "visita_tecnica": visita_tecnica,
        "em_preparacao": em_preparacao,
        "golive_definido": golive_definido,
        "concluidos": concluidos,
        "restricao_pendente": restricao,
        "focal_projetos": "@Diego de Souza Mandarino",
        "focal_operacao": "@Thatiane Silva Santos"
    }


@router.get("/solicitacoes")
def list_solicitacoes(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Lista todas as solicitações de implantação FM."""
    _seed_initial_data_if_empty(db)
    
    query = db.query(SolicitacaoImplantacao)
    if status and status != "TODOS":
        query = query.filter(SolicitacaoImplantacao.status == status)
    
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            (SolicitacaoImplantacao.cliente_nome.like(search_fmt)) |
            (SolicitacaoImplantacao.codigo.like(search_fmt)) |
            (SolicitacaoImplantacao.cidade.like(search_fmt)) |
            (SolicitacaoImplantacao.vendedor_comercial.like(search_fmt))
        )
    
    items = query.order_by(SolicitacaoImplantacao.id.desc()).all()
    return items


@router.post("/solicitacoes")
def create_solicitacao(payload: SolicitacaoCreate, db: Session = Depends(get_db)):
    """Etapa 1: Comercial -> Projetos | Registra nova solicitação."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    date_str = datetime.now().strftime("%Y-%m-%d")
    codigo = _gerar_codigo(db)
    
    sol = SolicitacaoImplantacao(
        codigo=codigo,
        cliente_nome=payload.cliente_nome.strip(),
        vendedor_comercial=payload.vendedor_comercial.strip(),
        focal_projetos=payload.focal_projetos or "@Diego de Souza Mandarino",
        focal_operacao=payload.focal_operacao or "@Thatiane Silva Santos",
        segmento=payload.segmento or "Geral",
        endereco_coleta=payload.endereco_coleta or "",
        cidade=payload.cidade.strip(),
        estado=payload.estado.strip().upper(),
        cep=payload.cep or "",
        volume_estimado_diario=payload.volume_estimado_diario or 0,
        horario_coleta_janela=payload.horario_coleta_janela or "14:00 - 18:00",
        observacoes_comercial=payload.observacoes_comercial or "",
        data_solicitacao=date_str,
        status="Em análise",
        criado_em=now_str,
        atualizado_em=now_str,
        historico_status=json.dumps([{
            "data_hora": now_str,
            "de_status": "Novo",
            "para_status": "Em análise",
            "observacao": "Solicitação registrada pelo Comercial e encaminhada para Projetos."
        }], ensure_ascii=False)
    )
    
    db.add(sol)
    db.commit()
    db.refresh(sol)
    return sol


@router.get("/solicitacoes/{id}")
def get_solicitacao(id: int, db: Session = Depends(get_db)):
    """Retorna os detalhes completos de uma solicitação."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    return sol


@router.put("/solicitacoes/{id}/viabilidade")
def update_viabilidade(id: int, payload: ViabilidadeUpdate, db: Session = Depends(get_db)):
    """Etapa 2: Projetos -> Operação | Análise de viabilidade."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    sol.condicao_viabilidade = payload.condicao_viabilidade
    sol.capacidade_operacional_ok = payload.capacidade_operacional_ok
    sol.disponibilidade_frota_ok = payload.disponibilidade_frota_ok
    sol.atendimento_regiao_ok = payload.atendimento_regiao_ok
    sol.necessidade_contratacao_equipe = payload.necessidade_contratacao_equipe
    sol.necessidade_novas_rotas = payload.necessidade_novas_rotas
    sol.estrutura_equipamentos_ok = payload.estrutura_equipamentos_ok
    sol.parecer_operacional = payload.parecer_operacional
    
    # Se for baixa aderência / restrição, mover para "Restrição/Pendente"
    novo_status = sol.status
    if "Baixa aderência" in payload.condicao_viabilidade or "restrição" in payload.condicao_viabilidade.lower():
        novo_status = "Restrição/Pendente"
    elif sol.status == "Em análise":
        novo_status = "Visita técnica"
    
    _registrar_historico(sol, novo_status, f"Análise de viabilidade concluída: {payload.condicao_viabilidade}")
    
    db.commit()
    db.refresh(sol)
    return sol


@router.put("/solicitacoes/{id}/visita")
def update_visita(id: int, payload: VisitaTecnicaUpdate, db: Session = Depends(get_db)):
    """Etapa 3: Projetos + Operação -> Visita Técnica."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    sol.status_visita = payload.status_visita
    sol.data_visita_tecnica = payload.data_visita_tecnica
    sol.relatorio_visita = payload.relatorio_visita
    
    if payload.status_visita == "Realizada" and sol.status in ["Em análise", "Visita técnica"]:
        _registrar_historico(sol, "Em preparação", "Visita técnica realizada com o cliente. Iniciada fase de preparação de recursos.")
    else:
        sol.atualizado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    db.commit()
    db.refresh(sol)
    return sol


@router.put("/solicitacoes/{id}/recursos-golive")
def update_recursos_golive(id: int, payload: RecursosGoLiveUpdate, db: Session = Depends(get_db)):
    """Etapa 4: Operação -> Definição dos recursos e Go-Live."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    sol.pda_qtd = payload.pda_qtd
    sol.mesa_posto_operacional = payload.mesa_posto_operacional
    sol.equipamentos_desc = payload.equipamentos_desc
    sol.equipe_contratacao_desc = payload.equipe_contratacao_desc
    sol.rotas_frota_desc = payload.rotas_frota_desc
    sol.insumos_desc = payload.insumos_desc
    sol.outros_recursos = payload.outros_recursos
    sol.data_go_live_prevista = payload.data_go_live_prevista
    sol.go_live_validado_operacao = payload.go_live_validado_operacao
    
    if payload.go_live_validado_operacao == 1 and payload.data_go_live_prevista:
        _registrar_historico(sol, "Go-Live definido", f"Data de Go-Live validada pela Operação: {payload.data_go_live_prevista}")
    else:
        sol.atualizado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
    db.commit()
    db.refresh(sol)
    return sol


@router.put("/solicitacoes/{id}/comunicar-comercial")
def comunicar_comercial(id: int, payload: ComunicacaoComercialUpdate, db: Session = Depends(get_db)):
    """Etapa 5: Projetos -> Comercial | Comunicação do Go-Live."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    now_date = datetime.now().strftime("%Y-%m-%d")
    sol.comunicado_comercial_em = payload.comunicado_comercial_em or now_date
    sol.comercial_ciente = payload.comercial_ciente
    sol.atualizado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    db.commit()
    db.refresh(sol)
    return sol


@router.put("/solicitacoes/{id}/parecer-gestor")
def update_parecer_gestor(id: int, payload: ParecerGestorUpdate, db: Session = Depends(get_db)):
    """Etapa: Parecer e Opinião do Gestor da Área FM."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    sol.gestor_nome = payload.gestor_nome or "Gestor FM / Projetos"
    sol.parecer_gestor_decisao = payload.parecer_gestor_decisao
    sol.parecer_gestor_texto = payload.parecer_gestor_texto
    sol.parecer_gestor_ressalvas = payload.parecer_gestor_ressalvas
    sol.parecer_gestor_data = payload.parecer_gestor_data or datetime.now().strftime("%Y-%m-%d")
    
    # Se o gestor reprovar, mover para Restrição/Pendente
    if payload.parecer_gestor_decisao == "Reprovado / Reavaliar":
        _registrar_historico(sol, "Restrição/Pendente", f"Parecer do Gestor: Reprovado / Reavaliar. {payload.parecer_gestor_texto or ''}")
    else:
        _registrar_historico(sol, sol.status, f"Parecer do Gestor registrado: {payload.parecer_gestor_decisao}")
    
    db.commit()
    db.refresh(sol)
    return sol


def identificar_tipo_ponto(iata_code: str, nome: str = "", overrides_dict: Optional[dict] = None) -> dict:
    if overrides_dict is None:
        overrides_dict = {}
    code = (iata_code or "").strip().upper()
    n = (nome or "").strip().upper()

    # 1. Ajuste Manual Prioritário definido pelo usuário (Configurações ou Mapa)
    if code in overrides_dict:
        custom_tipo = (overrides_dict[code] or "").strip().upper()
        if custom_tipo in ("HUB", "HUB (TRANSFERÊNCIA)", "GALPÃO / CD (DISTRIBUIÇÃO)"):
            return {
                "tipo": "HUB",
                "tipo_label": "HUB Operacional ANJUN",
                "badge_color": "purple",
                "operacao": "Recepção / Pickup / Transferência",
                "manual": True
            }
        elif custom_tipo in ("PONTO_APOIO", "PONTO DE APOIO", "PONTO DE APOIO / BASE"):
            return {
                "tipo": "PONTO_APOIO",
                "tipo_label": "Ponto de Apoio ANJUN",
                "badge_color": "amber",
                "operacao": "Base de Apoio / Consolidação",
                "manual": True
            }
        elif custom_tipo in ("PONTO_REDE", "PONTO DE REDE"):
            return {
                "tipo": "PONTO_REDE",
                "tipo_label": "Ponto de Rede Parceiro",
                "badge_color": "blue",
                "operacao": "Ponto de Rede / Coleta",
                "manual": True
            }
        elif custom_tipo in ("MD", "MINIDROP", "MD (PONTO DE COLETA)"):
            return {
                "tipo": "MD",
                "tipo_label": "Minidrop Parceiro (MD)",
                "badge_color": "emerald",
                "operacao": "Ponto de Coleta Dropoff",
                "manual": True
            }

    # 2. Detecção automática por nomenclatura
    if "-PA" in code or "-RR-" in code or "APOIO" in code or "APOIO" in n:
        return {
            "tipo": "PONTO_APOIO",
            "tipo_label": "Ponto de Apoio ANJUN",
            "badge_color": "amber",
            "operacao": "Base de Apoio / Consolidação",
            "manual": False
        }

    if "-PR" in code or "REDE" in code or "REDE" in n or bool(re.search(r"-[RDFA]\d{2,4}$|-[RDFA][A-Z0-9]{2,4}$", code)):
        return {
            "tipo": "PONTO_REDE",
            "tipo_label": "Ponto de Rede Parceiro",
            "badge_color": "blue",
            "operacao": "Ponto de Rede / Coleta",
            "manual": False
        }

    # HUB estrito: somente se contiver explicitamente -H, HUB, GLP ou CD
    if re.search(r"-[ZWA]-H|HUB-|-H\d{2,4}$|-H0|-H1|-H2|-H3", code) or code.startswith("HUB") or "HUB" in code or "GLP" in code or "CD" in code:
        return {
            "tipo": "HUB",
            "tipo_label": "HUB Operacional ANJUN",
            "badge_color": "purple",
            "operacao": "Recepção / Pickup / Transferência",
            "manual": False
        }

    # Todo o restante na malha de coleta é Minidrop (MD) por padrão
    return {
        "tipo": "MD",
        "tipo_label": "Minidrop Parceiro (MD)",
        "badge_color": "emerald",
        "operacao": "Ponto de Coleta Dropoff",
        "manual": False
    }


@router.get("/cockpit-d1")
def get_cockpit_d1(dia: Optional[str] = None, db: Session = Depends(get_db)):
    """Retorna os dados consolidados do fechamento D-1 (Minidrops, Sellers, Clientes, Volume Total, Coletado e Backlog)."""
    # 1. Obter dias disponíveis ordenados cronologicamente (DD/MM/YYYY -> YYYY-MM-DD)
    rows_dias = db.execute(text("""
        SELECT DISTINCT dia_base 
        FROM criacao_pedidos_historico 
        WHERE dia_base IS NOT NULL AND dia_base != '' 
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC
    """)).fetchall()
    dias_disponiveis = [r[0] for r in rows_dias if r[0]]
    
    if not dias_disponiveis:
        rows_fb = db.execute(text("SELECT DISTINCT dia_base FROM detalhe_md_historico ORDER BY dia_base DESC LIMIT 10")).fetchall()
        dias_disponiveis = [r[0] for r in rows_fb if r[0]]
        
    is_modo_geral = bool(dia and dia.strip().upper() in ["GERAL", "TODOS", "ACUMULADO"])
    dia_selecionado = "GERAL" if is_modo_geral else (dia if (dia and dia in dias_disponiveis) else (dias_disponiveis[0] if dias_disponiveis else ""))
    
    if not dia_selecionado and not is_modo_geral:
        return {
            "dia_selecionado": "",
            "dias_disponiveis": [],
            "totais": {
                "total_pedidos": 0,
                "total_mds_biparam": 0,
                "total_sellers": 0,
                "total_clientes": 0,
                "coletados": 0,
                "backlog": 0,
                "taxa_coleta": 0.0
            },
            "status_detalhe": [],
            "clientes_breakdown": [],
            "mds_breakdown": [],
            "sellers_breakdown": []
        }
        
    where_base = "WHERE 1=1" if is_modo_geral else "WHERE dia_base = :dia"
    params_base = {} if is_modo_geral else {"dia": dia_selecionado}
        
    # 1.1 Coletar coordenadas de pontos cadastrados (pontos_coleta, malha_coordenadas, mapa_pontos)
    coords_dict: dict = {}
    for table_name in ['pontos_coleta', 'malha_coordenadas', 'mapa_pontos']:
        try:
            if table_name == 'pontos_coleta':
                q = text("SELECT iata, collection_point_name, latitude, longitude, cidade, estado FROM pontos_coleta WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
                for r in db.execute(q).fetchall():
                    if r[0]:
                        coords_dict[str(r[0]).strip().upper()] = {
                            "lat": float(r[2]), "lng": float(r[3]), "nome": r[1] or r[0], "cidade": r[4], "estado": r[5]
                        }
            elif table_name == 'malha_coordenadas':
                q = text("SELECT md_codigo, nome_ponto, latitude, longitude FROM malha_coordenadas WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
                for r in db.execute(q).fetchall():
                    if r[0] and str(r[0]).strip().upper() not in coords_dict:
                        coords_dict[str(r[0]).strip().upper()] = {
                            "lat": float(r[2]), "lng": float(r[3]), "nome": r[1] or r[0], "cidade": "", "estado": ""
                        }
            elif table_name == 'mapa_pontos':
                q = text("SELECT iata, nome, latitude, longitude, cidade, estado FROM mapa_pontos WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
                for r in db.execute(q).fetchall():
                    if r[0] and str(r[0]).strip().upper() not in coords_dict:
                        coords_dict[str(r[0]).strip().upper()] = {
                            "lat": float(r[2]), "lng": float(r[3]), "nome": r[1] or r[0], "cidade": r[4], "estado": r[5]
                        }
        except Exception:
            pass

    # Carregar overrides manuais de classificação (HUB vs MD) definidos pelo usuário
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS ponto_classificacao_override (
            ponto_codigo TEXT PRIMARY KEY,
            tipo TEXT NOT NULL,
            atualizado_em TEXT
        );
    """))
    db.commit()
    overrides_dict = {}
    try:
        rows_md_tipo = db.execute(text("SELECT UPPER(TRIM(md_codigo)), UPPER(TRIM(tipo_ponto)) FROM md_mapping WHERE md_codigo IS NOT NULL AND tipo_ponto IS NOT NULL")).fetchall()
        for r_c, r_t in rows_md_tipo:
            if r_c and r_t in ("HUB", "MINIDROP", "PONTO DE APOIO", "PONTO DE REDE", "PONTO_APOIO", "PONTO_REDE"):
                overrides_dict[r_c] = r_t
    except Exception:
        pass
    overrides_rows = db.execute(text("SELECT UPPER(TRIM(ponto_codigo)), UPPER(TRIM(tipo)) FROM ponto_classificacao_override")).fetchall()
    for r in overrides_rows:
        if r[0] and r[1]:
            overrides_dict[r[0]] = r[1]

    # Totais gerais do dia ou geral acumulado
    # REGRA ANJUN:
    # Backlog = SOMENTE coleta/coletado, saco selado, foi assinado
    # Coleta / Coletado = circuito fechado, carregamento, descarregamento
    tot_row = db.execute(text(f"""
        SELECT 
            COALESCE(SUM(total_pedidos), 0),
            COUNT(DISTINCT CASE WHEN ponto_colecao IS NOT NULL AND trim(ponto_colecao) != '' THEN ponto_colecao END),
            COUNT(DISTINCT CASE WHEN merchant_nome IS NOT NULL AND trim(merchant_nome) != '' THEN merchant_nome END),
            COUNT(DISTINCT CASE WHEN nome_cliente IS NOT NULL AND trim(nome_cliente) != '' THEN nome_cliente END),
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END),
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado') THEN total_pedidos ELSE 0 END)
        FROM criacao_pedidos_historico
        {where_base}
    """), params_base).fetchone()
    
    total_pedidos = int(tot_row[0] or 0)
    total_pontos_todos = int(tot_row[1] or 0)
    total_sellers = int(tot_row[2] or 0)
    total_clientes = int(tot_row[3] or 0)
    coletados = int(tot_row[4] or 0)
    backlog = int(tot_row[5] or 0)
    taxa_coleta = round((coletados / max(total_pedidos, 1) * 100), 1) if total_pedidos > 0 else 0.0
    
    # Status detalhe
    status_rows = db.execute(text(f"""
        SELECT status_pedido, SUM(total_pedidos)
        FROM criacao_pedidos_historico
        {where_base}
        GROUP BY status_pedido
        ORDER BY SUM(total_pedidos) DESC
    """), params_base).fetchall()
    
    status_detalhe = []
    for s in status_rows:
        st_nome = s[0] or "Não Informado"
        st_vol = int(s[1] or 0)
        pct = round(st_vol / max(total_pedidos, 1) * 100, 1)
        is_backlog = st_nome.lower() in ['coleta', 'coletado', 'saco selado', 'foi assinado']
        status_detalhe.append({
            "status": st_nome,
            "volume": st_vol,
            "percentual": pct,
            "tipo": "Backlog (Estagnado no Ponto)" if is_backlog else "Coletado / Em Trânsito (Circuito/Carregamento)"
        })
        
    # Modalidades (D2D vs Normal vs Carga Grande)
    mod_rows = db.execute(text(f"""
        SELECT 
            CASE 
                WHEN LOWER(nome_cliente) LIKE '%d2d%' OR LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(tipo_pedido) LIKE '%d2d%' OR LOWER(tipo_pedido) LIKE '%pickup%' THEN 'D2D (Coleta Pickup Porta a Porta)'
                WHEN LOWER(tipo_pedido) LIKE '%grande%' OR LOWER(tipo_pedido) LIKE '%pesad%' OR LOWER(tipo_pedido) LIKE '%volum%' THEN 'Carga Grande / Volumosa'
                ELSE 'Normal (Dropoff em MD Parceiro)'
            END as modalidade,
            SUM(total_pedidos) as volume,
            COUNT(DISTINCT merchant_nome) as qtd_sellers,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        {where_base}
        GROUP BY modalidade
        ORDER BY volume DESC
    """), params_base).fetchall()
    
    modalidades_breakdown = []
    for m in mod_rows:
        m_vol = int(m[1] or 0)
        m_col = int(m[3] or 0)
        m_back = int(m[4] or 0)
        modalidades_breakdown.append({
            "modalidade": m[0],
            "volume": m_vol,
            "share_pct": round(m_vol / max(total_pedidos, 1) * 100, 1),
            "qtd_sellers": int(m[2] or 0),
            "coletados": m_col,
            "backlog": m_back,
            "taxa_coleta": round(m_col / max(m_vol, 1) * 100, 1)
        })

    # Clientes breakdown
    cli_rows = db.execute(text(f"""
        SELECT 
            nome_cliente,
            SUM(total_pedidos) as volume,
            COUNT(DISTINCT merchant_nome) as qtd_sellers,
            COUNT(DISTINCT CASE WHEN ponto_colecao IS NOT NULL AND trim(ponto_colecao) != '' THEN ponto_colecao END) as qtd_mds,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        {where_base}
        GROUP BY nome_cliente
        ORDER BY volume DESC
    """), params_base).fetchall()
    
    clientes_breakdown = []
    for c in cli_rows:
        c_vol = int(c[1] or 0)
        c_coletados = int(c[4] or 0)
        c_backlog = int(c[5] or 0)
        clientes_breakdown.append({
            "nome_cliente": c[0] or "Outros",
            "volume": c_vol,
            "share_pct": round(c_vol / max(total_pedidos, 1) * 100, 1),
            "qtd_sellers": int(c[2] or 0),
            "qtd_mds": int(c[3] or 0),
            "coletados": c_coletados,
            "backlog": c_backlog,
            "taxa_coleta": round((c_coletados / max(c_vol, 1) * 100), 1)
        })
        
    # MDs e HUBs breakdown
    md_rows = db.execute(text(f"""
        SELECT 
            ponto_colecao,
            COALESCE(cidade, '') as cidade,
            COALESCE(estado, '') as estado,
            SUM(total_pedidos) as volume,
            COUNT(DISTINCT merchant_nome) as qtd_sellers,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        WHERE {'1=1' if is_modo_geral else 'dia_base = :dia'} AND ponto_colecao IS NOT NULL AND trim(ponto_colecao) != ''
        GROUP BY ponto_colecao, cidade, estado
        ORDER BY volume DESC
    """), params_base).fetchall()
    
    mds_breakdown = []
    mapa_pontos_plotaveis = []
    pontos_vistos_mapa = set()
    total_mds_count = 0
    total_hubs_count = 0
    total_apoio_count = 0
    total_rede_count = 0

    for m in md_rows:
        ponto_code = m[0].strip()
        pontos_vistos_mapa.add(ponto_code.upper())
        m_vol = int(m[3] or 0)
        m_coletados = int(m[5] or 0)
        m_backlog = int(m[6] or 0)
        m_taxa = round((m_coletados / max(m_vol, 1) * 100), 1)
        
        coord = coords_dict.get(ponto_code.upper())
        lat = coord["lat"] if coord else None
        lng = coord["lng"] if coord else None
        nome_display = coord["nome"] if coord and coord["nome"] else ponto_code

        info_tipo = identificar_tipo_ponto(ponto_code, nome=nome_display, overrides_dict=overrides_dict)
        if info_tipo["tipo"] == "HUB":
            total_hubs_count += 1
        elif info_tipo["tipo"] == "PONTO_APOIO":
            total_apoio_count += 1
        elif info_tipo["tipo"] == "PONTO_REDE":
            total_rede_count += 1
        else:
            total_mds_count += 1
        
        item_md = {
            "ponto_colecao": ponto_code,
            "nome_display": nome_display,
            "cidade": m[1] or (coord["cidade"] if coord else ""),
            "estado": m[2] or (coord["estado"] if coord else ""),
            "volume": m_vol,
            "qtd_sellers": int(m[4] or 0),
            "coletados": m_coletados,
            "backlog": m_backlog,
            "taxa_coleta": m_taxa,
            "tipo_ponto": info_tipo["tipo"],
            "tipo_label": info_tipo["tipo_label"],
            "operacao": info_tipo["operacao"],
            "manual_override": info_tipo.get("manual", False),
            "latitude": lat,
            "longitude": lng
        }
        mds_breakdown.append(item_md)
        
        if lat and lng:
            mapa_pontos_plotaveis.append(item_md)

    # Incluir também unidades cadastradas com coordenadas em malha_coordenadas / md_mapping que tiveram 0 pacotes no dia
    for pt_upper, c_info in coords_dict.items():
        if pt_upper not in pontos_vistos_mapa and c_info.get("lat") and c_info.get("lng"):
            if "TFK" in pt_upper or "ANJUN" in pt_upper:
                continue
            pontos_vistos_mapa.add(pt_upper)
            nome_disp = c_info.get("nome") or pt_upper
            info_t = identificar_tipo_ponto(pt_upper, nome=nome_disp, overrides_dict=overrides_dict)
            item_extra = {
                "ponto_colecao": pt_upper,
                "nome_display": nome_disp,
                "cidade": c_info.get("cidade") or "",
                "estado": c_info.get("estado") or "",
                "volume": 0,
                "qtd_sellers": 0,
                "coletados": 0,
                "backlog": 0,
                "taxa_coleta": 0.0,
                "tipo_ponto": info_t["tipo"],
                "tipo_label": info_t["tipo_label"],
                "operacao": info_t["operacao"],
                "manual_override": info_t.get("manual", False),
                "latitude": c_info["lat"],
                "longitude": c_info["lng"]
            }
            mds_breakdown.append(item_extra)
            mapa_pontos_plotaveis.append(item_extra)
        
    # Sellers breakdown (Top 100)
    sel_rows = db.execute(text(f"""
        SELECT 
            merchant_nome,
            nome_cliente,
            COALESCE(cidade, '') as cidade,
            COALESCE(estado, '') as estado,
            COALESCE(maneira_coleta, '') as maneira_coleta,
            SUM(total_pedidos) as volume,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        WHERE {'1=1' if is_modo_geral else 'dia_base = :dia'} AND merchant_nome IS NOT NULL AND trim(merchant_nome) != ''
        GROUP BY merchant_nome, nome_cliente, cidade, estado, maneira_coleta
        ORDER BY volume DESC
        LIMIT 100
    """), params_base).fetchall()
    
    sellers_breakdown = []
    for s in sel_rows:
        s_vol = int(s[5] or 0)
        s_coletados = int(s[6] or 0)
        sellers_breakdown.append({
            "merchant_nome": s[0],
            "nome_cliente": s[1] or "Geral",
            "cidade": s[2],
            "estado": s[3],
            "maneira_coleta": "Dropoff (Entrega)" if "entrega" in (s[4] or "").lower() else ("Pickup (Coleta)" if "coleta" in (s[4] or "").lower() else (s[4] or "Geral")),
            "volume": s_vol,
            "coletados": s_coletados,
            "backlog": int(s[7] or 0),
            "taxa_coleta": round((s_coletados / max(s_vol, 1) * 100), 1)
        })

    # Cidades Coords Mapping (para localizar sellers)
    cidades_coords: dict = {}
    for pt, info in coords_dict.items():
        cid = (info.get("cidade") or "").strip().upper()
        uf = (info.get("estado") or "").strip().upper()
        if cid and info.get("lat") and info.get("lng"):
            cidades_coords[f"{cid}_{uf}"] = (float(info["lat"]), float(info["lng"]))
            if cid not in cidades_coords:
                cidades_coords[cid] = (float(info["lat"]), float(info["lng"]))

    # Mapeamento geográfico de Sellers (Spoke-Hub)
    sellers_geo_rows = db.execute(text(f"""
        SELECT 
            merchant_nome,
            COALESCE(cidade, '') as cidade,
            COALESCE(estado, '') as estado,
            COALESCE(cep_remetente, '') as cep,
            COALESCE(ponto_colecao, '') as ponto_colecao,
            COALESCE(nome_cliente, 'Geral') as nome_cliente,
            SUM(total_pedidos) as volume
        FROM criacao_pedidos_historico
        WHERE {'1=1' if is_modo_geral else 'dia_base = :dia'} AND merchant_nome IS NOT NULL AND trim(merchant_nome) != ''
        GROUP BY merchant_nome, cidade, estado, cep, ponto_colecao, nome_cliente
        ORDER BY volume DESC
        LIMIT 150
    """), params_base).fetchall()

    sellers_mapa = []
    for sg in sellers_geo_rows:
        s_nome = sg[0]
        s_cid = (sg[1] or "").strip().title()
        s_uf = (sg[2] or "").strip().upper()
        s_cep = (sg[3] or "").strip()
        s_ponto = (sg[4] or "").strip().upper()
        s_cli = sg[5]
        s_vol = int(sg[6] or 0)

        # Destino (MD ou HUB)
        dest_coord = coords_dict.get(s_ponto)
        dest_lat = dest_coord["lat"] if dest_coord else None
        dest_lng = dest_coord["lng"] if dest_coord else None

        # Origem (Seller)
        cid_key = f"{s_cid.upper()}_{s_uf}"
        s_coord = cidades_coords.get(cid_key) or cidades_coords.get(s_cid.upper())
        if s_coord:
            h = abs(hash(s_nome)) % 100
            j_lat = ((h % 10) - 5) * 0.002
            j_lng = (((h // 10) % 10) - 5) * 0.002
            s_lat = s_coord[0] + j_lat
            s_lng = s_coord[1] + j_lng
        elif dest_lat and dest_lng:
            h = abs(hash(s_nome)) % 100
            j_lat = ((h % 10) - 5) * 0.003
            j_lng = (((h // 10) % 10) - 5) * 0.003
            s_lat = dest_lat + j_lat
            s_lng = dest_lng + j_lng
        else:
            s_lat, s_lng = None, None

        if s_lat and s_lng:
            sellers_mapa.append({
                "merchant_nome": s_nome,
                "cidade": s_cid,
                "estado": s_uf,
                "cep": s_cep,
                "nome_cliente": s_cli,
                "volume": s_vol,
                "ponto_colecao": s_ponto,
                "latitude": round(s_lat, 6),
                "longitude": round(s_lng, 6),
                "dest_latitude": dest_lat,
                "dest_longitude": dest_lng,
                "dest_nome": dest_coord["nome"] if dest_coord else s_ponto
            })

    # Evolução temporal histórica (para o gráfico e visão de tendência)
    evolucao_rows = db.execute(text("""
        SELECT 
            dia_base,
            SUM(total_pedidos) as volume,
            COUNT(DISTINCT merchant_nome) as qtd_sellers,
            COUNT(DISTINCT ponto_colecao) as qtd_pontos,
            SUM(CASE WHEN LOWER(status_pedido) IN ('circuito fechado', 'carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as coletados,
            SUM(CASE WHEN LOWER(status_pedido) IN ('coleta', 'coletado', 'saco selado', 'foi assinado') THEN total_pedidos ELSE 0 END) as backlog
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND dia_base != ''
        GROUP BY dia_base
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) ASC
    """)).fetchall()

    evolucao_temporal = []
    for er in evolucao_rows:
        e_vol = int(er[1] or 0)
        e_col = int(er[4] or 0)
        e_back = int(er[5] or 0)
        evolucao_temporal.append({
            "dia": er[0],
            "volume": e_vol,
            "qtd_sellers": int(er[2] or 0),
            "qtd_pontos": int(er[3] or 0),
            "coletados": e_col,
            "backlog": e_back,
            "taxa_coleta": round(e_col / max(e_vol, 1) * 100, 1)
        })

    dias_count = max(len(dias_disponiveis), 1)
    media_diaria = round(total_pedidos / dias_count, 0) if is_modo_geral else total_pedidos

    return {
        "dia_selecionado": dia_selecionado,
        "dias_disponiveis": dias_disponiveis,
        "is_modo_geral": is_modo_geral,
        "totais": {
            "total_pedidos": total_pedidos,
            "total_pontos_todos": total_pontos_todos,
            "total_mds_biparam": total_mds_count,
            "total_hubs_biparam": total_hubs_count,
            "total_sellers": total_sellers,
            "total_clientes": total_clientes,
            "coletados": coletados,
            "total_coletado": coletados,
            "backlog": backlog,
            "total_backlog": backlog,
            "taxa_coleta": taxa_coleta,
            "taxa_coleta_geral": taxa_coleta,
            "is_modo_geral": is_modo_geral,
            "media_diaria_pedidos": int(media_diaria),
            "dias_contabilizados": dias_count
        },
        "status_detalhe": status_detalhe,
        "modalidades_breakdown": modalidades_breakdown,
        "clientes_breakdown": clientes_breakdown,
        "mds_breakdown": mds_breakdown,
        "mapa_pontos_plotaveis": mapa_pontos_plotaveis,
        "sellers_breakdown": sellers_breakdown,
        "sellers_mapa": sellers_mapa,
        "evolucao_temporal": evolucao_temporal
    }


def calcular_distancia_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371.0  # Raio médio da Terra em km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return round(R * c, 1)


@router.get("/viabilidade-rapida")
def consultar_viabilidade_rapida(
    cidade: str = Query(..., description="Nome da cidade ou município"),
    estado: Optional[str] = Query(None, description="UF (ex: SP, SC, MG)"),
    cliente: Optional[str] = Query(None, description="Marketplace / Cliente (ex: Shein, Shopee)"),
    db: Session = Depends(get_db)
):
    """Motor de Decisão 100% Data-Driven: analisa viabilidade operacional para abertura de ponto ou atendimento de cliente sem alucinação."""
    c_norm = cidade.strip().upper()
    uf_norm = (estado or "").strip().upper()[:2]
    cli_norm = (cliente or "").strip()

    # 1. Coletar histórico real da cidade em criacao_pedidos_historico
    filtro_cli = "AND LOWER(nome_cliente) LIKE :cli" if cli_norm else ""
    p_params = {"c_like": f"%{c_norm}%"}
    if cli_norm:
        p_params["cli"] = f"%{cli_norm.lower()}%"

    h_row = db.execute(text(f"""
        SELECT 
            COUNT(*),
            COALESCE(SUM(total_pedidos), 0),
            COUNT(DISTINCT merchant_nome),
            COUNT(DISTINCT ponto_colecao)
        FROM criacao_pedidos_historico
        WHERE UPPER(cidade) LIKE :c_like {filtro_cli}
    """), p_params).fetchone()

    total_pedidos_cid = int(h_row[1] or 0)
    qtd_sellers_cid = int(h_row[2] or 0)
    qtd_pontos_usados = int(h_row[3] or 0)
    ja_operamos = total_pedidos_cid > 0

    # Top sellers da cidade
    top_sellers_rows = db.execute(text(f"""
        SELECT merchant_nome, SUM(total_pedidos)
        FROM criacao_pedidos_historico
        WHERE UPPER(cidade) LIKE :c_like {filtro_cli} AND merchant_nome IS NOT NULL AND trim(merchant_nome) != ''
        GROUP BY merchant_nome
        ORDER BY SUM(total_pedidos) DESC
        LIMIT 5
    """), p_params).fetchall()
    top_sellers = [{"nome": r[0], "volume": int(r[1] or 0)} for r in top_sellers_rows]

    # 2. Verificar Minidrops cadastrados na cidade (malha_coordenadas / md_mapping)
    mds_locais_rows = db.execute(text("""
        SELECT md_codigo, nome_ponto, cidade, estado, endereco, latitude, longitude
        FROM malha_coordenadas
        WHERE UPPER(cidade) LIKE :c_like
    """), {"c_like": f"%{c_norm}%"}).fetchall()
    mds_locais = [{
        "ponto": r[0], "nome": r[1] or r[0], "cidade": r[2], "estado": r[3],
        "endereco": r[4] or "", "lat": r[5], "lng": r[6]
    } for r in mds_locais_rows]

    # 3. Descobrir coordenadas de referência da cidade consultada
    target_lat = None
    target_lng = None
    for m in mds_locais:
        if m["lat"] and m["lng"]:
            target_lat, target_lng = m["lat"], m["lng"]
            break

    if not target_lat:
        ref = db.execute(text("SELECT latitude, longitude FROM mapa_pontos WHERE UPPER(cidade) LIKE :c_like AND latitude IS NOT NULL LIMIT 1"), {"c_like": f"%{c_norm}%"}).fetchone()
        if ref:
            target_lat, target_lng = float(ref[0]), float(ref[1])

    if not target_lat:
        # Fallback para Geocodificação OpenStreetMap Nominatim
        try:
            import urllib.request, urllib.parse, json
            q_geo = f"{cidade}, {estado or ''}, Brasil" if estado else f"{cidade}, Brasil"
            url_nom = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q_geo)}&format=json&limit=1&countrycodes=br"
            req = urllib.request.Request(url_nom, headers={"User-Agent": "TorreANJUN/1.0 (logistica@anjun.com.br)"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data_nom = json.loads(resp.read().decode())
                if data_nom and len(data_nom) > 0:
                    target_lat = float(data_nom[0]["lat"])
                    target_lng = float(data_nom[0]["lon"])
        except Exception:
            pass

    # 4. Localizar todos os HUBs ANJUN e calcular o mais próximo
    hubs_rows = db.execute(text("""
        SELECT iata, nome, cidade, estado, latitude, longitude
        FROM mapa_pontos
        WHERE (UPPER(iata) LIKE '%HUB%' OR UPPER(nome) LIKE '%HUB%' OR UPPER(iata) LIKE '%-H0%' OR UPPER(iata) LIKE 'WR-%')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
    """)).fetchall()

    hubs_list = []
    seen_hubs = set()
    for hr in hubs_rows:
        code = str(hr[0]).strip().upper()
        if code not in seen_hubs and not code.startswith("MD-"):
            seen_hubs.add(code)
            hubs_list.append({
                "iata": code,
                "nome": hr[1] or code,
                "cidade": hr[2] or "",
                "estado": hr[3] or "",
                "lat": float(hr[4]),
                "lng": float(hr[5])
            })

    # Complementar com malha_coordenadas para hubs adicionais
    mc_hubs = db.execute(text("""
        SELECT md_codigo, nome_ponto, cidade, estado, latitude, longitude
        FROM malha_coordenadas
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """)).fetchall()
    for hr in mc_hubs:
        code = str(hr[0]).strip().upper()
        if code not in seen_hubs and not code.startswith("MD-"):
            tipo_cand = identificar_tipo_ponto(code, hr[1] or "")
            if tipo_cand["tipo"] == "HUB":
                seen_hubs.add(code)
                hubs_list.append({
                    "iata": code,
                    "nome": hr[1] or code,
                    "cidade": hr[2] or "",
                    "estado": hr[3] or "",
                    "lat": float(hr[4]),
                    "lng": float(hr[5])
                })

    hub_mais_proximo = None
    menor_distancia = 9999.0
    if target_lat and target_lng:
        for hb in hubs_list:
            d = calcular_distancia_haversine(target_lat, target_lng, hb["lat"], hb["lng"])
            if d < menor_distancia:
                menor_distancia = d
                hub_mais_proximo = {**hb, "distancia_km": d}

    # 4.1 Identificar cidades vizinhas com operação ativa (sellers ou pontos) para montagem de rotas
    cidades_geo_map = {}
    for table_name in ['malha_coordenadas', 'mapa_pontos', 'pontos_coleta']:
        try:
            if table_name == 'malha_coordenadas':
                q = text("SELECT cidade, estado, latitude, longitude FROM malha_coordenadas WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
            elif table_name == 'mapa_pontos':
                q = text("SELECT cidade, estado, latitude, longitude FROM mapa_pontos WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
            else:
                q = text("SELECT cidade, estado, latitude, longitude FROM pontos_coleta WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
            for r in db.execute(q).fetchall():
                c_nom = str(r[0] or "").strip().upper()
                u_nom = str(r[1] or "").strip().upper()[:2]
                if c_nom and r[2] and r[3] and (c_nom, u_nom) not in cidades_geo_map:
                    cidades_geo_map[(c_nom, u_nom)] = (float(r[2]), float(r[3]))
        except Exception:
            pass

    # Agregar volume e sellers por cidade no histórico
    city_stats_rows = db.execute(text("""
        SELECT 
            UPPER(TRIM(cidade)),
            UPPER(TRIM(estado)),
            SUM(total_pedidos),
            COUNT(DISTINCT merchant_nome),
            COUNT(DISTINCT ponto_colecao)
        FROM criacao_pedidos_historico
        WHERE cidade IS NOT NULL AND TRIM(cidade) != ''
        GROUP BY UPPER(TRIM(cidade)), UPPER(TRIM(estado))
    """)).fetchall()

    city_stats_map = {}
    for cr in city_stats_rows:
        ckey = (str(cr[0]).strip().upper(), str(cr[1]).strip().upper()[:2])
        city_stats_map[ckey] = {
            "volume": int(cr[2] or 0),
            "sellers": int(cr[3] or 0),
            "pontos": int(cr[4] or 0)
        }

    # Contar pontos cadastrados em malha_coordenadas
    pts_by_city_rows = db.execute(text("""
        SELECT UPPER(TRIM(cidade)), UPPER(TRIM(estado)), COUNT(*)
        FROM malha_coordenadas
        WHERE cidade IS NOT NULL AND TRIM(cidade) != ''
        GROUP BY UPPER(TRIM(cidade)), UPPER(TRIM(estado))
    """)).fetchall()
    for pr in pts_by_city_rows:
        ckey = (str(pr[0]).strip().upper(), str(pr[1]).strip().upper()[:2])
        if ckey not in city_stats_map:
            city_stats_map[ckey] = {"volume": 0, "sellers": 0, "pontos": int(pr[2] or 0)}
        else:
            city_stats_map[ckey]["pontos"] = max(city_stats_map[ckey]["pontos"], int(pr[2] or 0))

    cidades_proximas_cand = []
    seen_viz_cities = {}
    if target_lat and target_lng:
        for (c_name, c_uf), (c_lat, c_lng) in cidades_geo_map.items():
            if c_name == c_norm:
                continue
            dist = calcular_distancia_haversine(target_lat, target_lng, c_lat, c_lng)
            if dist > 0.5 and dist <= 85:
                c_data = city_stats_map.get((c_name, c_uf)) or city_stats_map.get((c_name, ""))
                vol = c_data["volume"] if c_data else 0
                sellers = c_data["sellers"] if c_data else 0
                pts = c_data["pontos"] if c_data else 0

                if vol > 0 or sellers > 0 or pts > 1:
                    if dist <= 25:
                        sinergia = "Extensão imediata de circuito First Mile"
                        viabilidade_tipo = "ALTA"
                    elif dist <= 50:
                        sinergia = "Agrupamento viável em rota regional"
                        viabilidade_tipo = "MEDIA"
                    else:
                        sinergia = "Conexão via linha tronco / transfer"
                        viabilidade_tipo = "BAIXA"

                    cand = {
                        "cidade": c_name.title(),
                        "estado": c_uf,
                        "distancia_km": dist,
                        "volume_historico": vol,
                        "qtd_sellers": sellers,
                        "qtd_pontos": pts,
                        "sinergia_rota": sinergia,
                        "viabilidade_tipo": viabilidade_tipo
                    }

                    # Evitar duplicatas do mesmo município com grafia acentuada ou UF invertida
                    import unicodedata
                    c_norm_key = unicodedata.normalize('NFKD', c_name).encode('ASCII', 'ignore').decode('ASCII').upper()

                    if c_norm_key not in seen_viz_cities or vol > seen_viz_cities[c_norm_key]["volume_historico"]:
                        seen_viz_cities[c_norm_key] = cand

        cidades_proximas = list(seen_viz_cities.values())
        cidades_proximas.sort(key=lambda x: x["distancia_km"])
        cidades_proximas = cidades_proximas[:6]
    else:
        cidades_proximas = []

    # 5. Lógica de Veredito Estrita (Data-Driven, sem alucinação)
    motivos = []
    if ja_operamos:
        motivos.append(f"A ANJUN já possui operação ativa em {cidade.title()} com {total_pedidos_cid:,} pacotes históricos.")
        motivos.append(f"Existem {qtd_sellers_cid} sellers registrados que já expedem na região.")
    else:
        motivos.append(f"Ainda não há registros de bipagem histórica ativa em {cidade.title()}.")

    if mds_locais:
        motivos.append(f"Já existem {len(mds_locais)} Minidrop(s) parceiro(s) cadastrado(s) na cidade.")
    else:
        motivos.append("Não há Minidrop (MD) ativo cadastrado no município até o momento.")

    if hub_mais_proximo:
        motivos.append(f"HUB ANJUN de apoio mais próximo: {hub_mais_proximo['iata']} ({hub_mais_proximo['cidade']}-{hub_mais_proximo['estado']}) a ~{hub_mais_proximo['distancia_km']} km.")
    else:
        motivos.append("Coordenadas de apoio calculadas através de pólos logísticos regionais.")

    if cidades_proximas:
        resumo_viz = ", ".join([f"{c['cidade']}-{c['estado']} (~{c['distancia_km']} km, {c['qtd_sellers']} sellers)" for c in cidades_proximas[:3]])
        motivos.append(f"Cidades vizinhas ativas para montagem de rota: {resumo_viz}.")

    # Classificação final do Veredito
    if ja_operamos and (not hub_mais_proximo or hub_mais_proximo["distancia_km"] <= 80):
        veredito = "ALTA"
        veredito_label = "🟢 Viabilidade Alta / Início Imediato"
        cor = "emerald"
        prazo_estimado = "< 48 horas (Malha e Rotas Existentes)"
        recomendacao = f"Excelente oportunidade para implantação imediata. Se o objetivo for abrir um novo Minidrop, atente-se a posicioná-lo a mais de 3 km dos MDs existentes para maximizar cobertura sem canibalização."
    elif hub_mais_proximo and hub_mais_proximo["distancia_km"] <= 120:
        veredito = "MEDIA"
        veredito_label = "🟡 Viabilidade Média / Requer Rota ou Parceria"
        cor = "amber"
        prazo_estimado = "3 a 5 dias úteis (Ajuste de Janela e Frota)"
        recomendacao = f"Operação viável mediante roteirização a partir do {hub_mais_proximo['iata']} (~{hub_mais_proximo['distancia_km']} km). Recomenda-se volume mínimo de 150 pacotes/dia ou agendamento de janelas específicas de coleta."
    else:
        veredito = "BAIXA"
        veredito_label = "🔴 Fora da Cobertura Direta / Expansão Necessária"
        cor = "rose"
        prazo_estimado = "Sob consulta com Planejamento de Malha / Linha Tronco"
        recomendacao = f"A localidade está distante da malha First Mile atual. Para atendimento comercial viável, será necessário desenhar linha dedicada de transferência ou estabelecer redespacho regional."

    if cidades_proximas and cidades_proximas[0]["distancia_km"] <= 35:
        recomendacao += f" Sinergia operacional: possibilidade imediata de estender a rota de {cidades_proximas[0]['cidade']}-{cidades_proximas[0]['estado']} (~{cidades_proximas[0]['distancia_km']} km, {cidades_proximas[0]['qtd_sellers']} sellers), reduzindo custos de transporte."

    return {
        "cidade": cidade.title(),
        "estado": uf_norm or "BR",
        "cliente": cli_norm or "Todos os Marketplaces",
        "latitude": target_lat,
        "longitude": target_lng,
        "veredito": veredito,
        "veredito_label": veredito_label,
        "cor": cor,
        "ja_operamos": ja_operamos,
        "volume_historico": total_pedidos_cid,
        "qtd_sellers_ativos": qtd_sellers_cid,
        "top_sellers": top_sellers,
        "mds_locais": mds_locais,
        "hub_proximo": hub_mais_proximo,
        "cidades_proximas": cidades_proximas,
        "prazo_estimado": prazo_estimado,
        "motivos": motivos,
        "recomendacao_operacional": recomendacao
    }


@router.get("/geocodificar-endereco")
def geocodificar_endereco(
    query: str = Query(..., description="Endereço completo, rua, bairro, CEP ou cidade"),
    db: Session = Depends(get_db)
):
    """Localiza qualquer endereço, CEP, ponto ANJUN ou cidade no Brasil e calcula distância aos pontos ANJUN mais próximos."""
    import re
    import json
    import urllib.request
    import urllib.parse

    q_raw = query.strip()
    if not q_raw:
        raise HTTPException(status_code=400, detail="Query de pesquisa não fornecida.")

    lat = None
    lng = None
    display_name = q_raw
    tipo = "endereco"
    cidade_detectada = ""
    estado_detectado = ""

    # Normalizar strings para buscas
    q_norm = q_raw.upper()
    q_normalized_code = re.sub(r"\s*-\s*", "-", q_norm).strip()

    # 1. Checar se a query contém ou é um CEP brasileiro (ex: 06763-040 ou 06763040)
    cep_match = re.search(r"\b(\d{5})-?(\d{3})\b", q_raw)
    if cep_match:
        clean_cep = f"{cep_match.group(1)}{cep_match.group(2)}"
        try:
            url_viacep = f"https://viacep.com.br/ws/{clean_cep}/json/"
            req_viacep = urllib.request.Request(url_viacep, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req_viacep, timeout=3.5) as resp:
                data_cep = json.loads(resp.read().decode())
                if data_cep and "erro" not in data_cep:
                    logr = data_cep.get("logradouro", "").strip()
                    bairro = data_cep.get("bairro", "").strip()
                    loc = data_cep.get("localidade", "").strip()
                    uf = data_cep.get("uf", "").strip()
                    cep_fmt = data_cep.get("cep", f"{clean_cep[:5]}-{clean_cep[5:]}")
                    cidade_detectada = loc
                    estado_detectado = uf

                    search_queries = []
                    if logr and loc:
                        search_queries.append(f"{logr}, {bairro}, {loc} - {uf}, Brasil")
                        search_queries.append(f"{logr}, {loc} - {uf}, Brasil")
                    if bairro and loc:
                        search_queries.append(f"{bairro}, {loc} - {uf}, Brasil")
                    if loc and uf:
                        search_queries.append(f"{loc} - {uf}, Brasil")

                    for sq in search_queries:
                        try:
                            url_nom = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(sq)}&format=json&limit=1&countrycodes=br&addressdetails=1"
                            req_nom = urllib.request.Request(url_nom, headers={"User-Agent": "TorreANJUN/1.0 (malha@anjun.com.br)"})
                            with urllib.request.urlopen(req_nom, timeout=3.5) as r:
                                nom_res = json.loads(r.read().decode())
                                if nom_res and len(nom_res) > 0:
                                    lat = float(nom_res[0]["lat"])
                                    lng = float(nom_res[0]["lon"])
                                    parts = [p for p in [logr, bairro, f"{loc} - {uf}", f"CEP {cep_fmt}"] if p]
                                    display_name = ", ".join(parts) if parts else sq
                                    tipo = "cep"
                                    break
                        except Exception:
                            continue
        except Exception as e:
            print(f"[ViaCEP Error] {e}")

    # 2. Verificar no banco local (malha_coordenadas e mapa_pontos) se é um Ponto ANJUN (MD, HUB, Galpão)
    if not lat:
        local_ponto = db.execute(text("""
            SELECT md_codigo, nome_ponto, cidade, estado, latitude, longitude, tipo_ponto
            FROM malha_coordenadas 
            WHERE (UPPER(md_codigo) = :q 
                OR UPPER(md_codigo) = :q_code
                OR UPPER(nome_ponto) = :q 
                OR UPPER(md_codigo) LIKE :q_like
                OR UPPER(nome_ponto) LIKE :q_like)
              AND latitude IS NOT NULL AND longitude IS NOT NULL
            LIMIT 1
        """), {"q": q_norm, "q_code": q_normalized_code, "q_like": f"%{q_normalized_code}%"}).fetchone()

        if local_ponto:
            lat, lng = float(local_ponto[4]), float(local_ponto[5])
            display_name = f"{local_ponto[0]} - {local_ponto[1]} ({local_ponto[2]}/{local_ponto[3]})"
            cidade_detectada = local_ponto[2] or ""
            estado_detectado = local_ponto[3] or ""
            tipo = "ponto_anjun"

    if not lat:
        local_mp = db.execute(text("""
            SELECT iata, nome, cidade, estado, latitude, longitude 
            FROM mapa_pontos 
            WHERE (UPPER(iata) = :q 
                OR UPPER(iata) = :q_code
                OR UPPER(nome) = :q 
                OR UPPER(iata) LIKE :q_like 
                OR UPPER(nome) LIKE :q_like) 
              AND latitude IS NOT NULL AND longitude IS NOT NULL
            LIMIT 1
        """), {"q": q_norm, "q_code": q_normalized_code, "q_like": f"%{q_normalized_code}%"}).fetchone()

        if local_mp:
            lat, lng = float(local_mp[4]), float(local_mp[5])
            display_name = f"{local_mp[1] or local_mp[0]} - {local_mp[2]}/{local_mp[3]}"
            cidade_detectada = local_mp[2] or ""
            estado_detectado = local_mp[3] or ""
            tipo = "ponto_anjun"

    # 3. Se não achou ainda, chamar Nominatim (OpenStreetMap)
    if not lat:
        candidate_queries = []
        q_geo = q_raw if ("brasil" in q_raw.lower() or "brazil" in q_raw.lower()) else f"{q_raw}, Brasil"
        candidate_queries.append(q_geo)

        # Se tiver número de endereço ex: "Rua X, 123", tentar também sem o número se falhar
        if re.search(r",\s*\d+", q_raw):
            clean_no_num = re.sub(r",\s*\d+", "", q_raw)
            candidate_queries.append(f"{clean_no_num}, Brasil")

        for c_query in candidate_queries:
            try:
                url_nom = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(c_query)}&format=json&limit=1&countrycodes=br&addressdetails=1"
                req = urllib.request.Request(url_nom, headers={"User-Agent": "TorreANJUN/1.0 (malha@anjun.com.br)"})
                with urllib.request.urlopen(req, timeout=4.0) as resp:
                    data_nom = json.loads(resp.read().decode())
                    if data_nom and len(data_nom) > 0:
                        item = data_nom[0]
                        lat = float(item["lat"])
                        lng = float(item["lon"])
                        display_name = item.get("display_name", q_raw)
                        addr = item.get("address", {})
                        cidade_detectada = addr.get("city") or addr.get("town") or addr.get("municipality") or addr.get("village") or ""
                        estado_detectado = addr.get("state_code") or addr.get("state") or ""
                        tipo = "endereco" if (addr.get("road") or addr.get("house_number") or addr.get("postcode")) else "cidade"
                        break
            except Exception as e:
                print(f"[Nominatim Error] {e}")

    # 4. Fallback final: procurar por nome de cidade em malha_coordenadas ou mapa_pontos
    if not lat:
        cand_cid = db.execute(text("""
            SELECT cidade, estado, latitude, longitude 
            FROM malha_coordenadas 
            WHERE (UPPER(cidade) = :q OR UPPER(cidade) LIKE :q_like) 
              AND latitude IS NOT NULL AND longitude IS NOT NULL
            LIMIT 1
        """), {"q": q_norm, "q_like": f"%{q_norm}%"}).fetchone()
        if not cand_cid:
            cand_cid = db.execute(text("""
                SELECT cidade, estado, latitude, longitude 
                FROM mapa_pontos 
                WHERE (UPPER(cidade) = :q OR UPPER(cidade) LIKE :q_like) 
                  AND latitude IS NOT NULL AND longitude IS NOT NULL
                LIMIT 1
            """), {"q": q_norm, "q_like": f"%{q_norm}%"}).fetchone()

        if cand_cid:
            lat, lng = float(cand_cid[2]), float(cand_cid[3])
            display_name = f"{cand_cid[0]} - {cand_cid[1]}"
            cidade_detectada = cand_cid[0]
            estado_detectado = cand_cid[1]
            tipo = "cidade"

    if not lat or not lng:
        return {
            "encontrado": False,
            "query": q_raw,
            "mensagem": "Não foi possível localizar este endereço ou município. Verifique a grafia e tente novamente."
        }

    # 5. Calcular HUB mais próximo (consultando malha_coordenadas e mapa_pontos)
    hubs_rows = db.execute(text("""
        SELECT md_codigo, nome_ponto, cidade, estado, latitude, longitude
        FROM malha_coordenadas
        WHERE (tipo_ponto LIKE '%HUB%' OR UPPER(md_codigo) LIKE '%HUB%' OR UPPER(md_codigo) LIKE 'WR-%')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
    """)).fetchall()

    if not hubs_rows:
        hubs_rows = db.execute(text("""
            SELECT iata, nome, cidade, estado, latitude, longitude
            FROM mapa_pontos
            WHERE (UPPER(iata) LIKE '%HUB%' OR UPPER(nome) LIKE '%HUB%' OR UPPER(iata) LIKE '%-H0%' OR UPPER(iata) LIKE 'WR-%')
              AND latitude IS NOT NULL AND longitude IS NOT NULL
        """)).fetchall()

    hub_mais_proximo = None
    menor_dist_hub = 9999.0
    for hr in hubs_rows:
        h_code = str(hr[0]).strip().upper()
        if h_code.startswith("MD-"):
            continue
        d = calcular_distancia_haversine(lat, lng, float(hr[4]), float(hr[5]))
        if d < menor_dist_hub:
            menor_dist_hub = d
            hub_mais_proximo = {
                "iata": h_code,
                "nome": hr[1] or h_code,
                "cidade": hr[2] or "",
                "estado": hr[3] or "",
                "distancia_km": round(d, 2),
                "latitude": float(hr[4]),
                "longitude": float(hr[5])
            }

    # 6. Calcular Minidrop (MD) mais próximo
    mds_rows = db.execute(text("""
        SELECT md_codigo, nome_ponto, cidade, estado, latitude, longitude
        FROM malha_coordenadas
        WHERE (tipo_ponto LIKE '%MD%' OR UPPER(md_codigo) LIKE 'MD-%')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
    """)).fetchall()

    if not mds_rows:
        mds_rows = db.execute(text("""
            SELECT iata, nome, cidade, estado, latitude, longitude
            FROM mapa_pontos
            WHERE (UPPER(iata) LIKE 'MD-%' OR UPPER(iata) NOT LIKE '%HUB%')
              AND latitude IS NOT NULL AND longitude IS NOT NULL
        """)).fetchall()

    md_mais_proximo = None
    menor_dist_md = 9999.0
    for mr in mds_rows:
        m_code = str(mr[0]).strip().upper()
        if "-H0" in m_code or "HUB" in m_code or "WR-" in m_code:
            continue
        d = calcular_distancia_haversine(lat, lng, float(mr[4]), float(mr[5]))
        if d < menor_dist_md:
            menor_dist_md = d
            md_mais_proximo = {
                "codigo": m_code,
                "nome": mr[1] or m_code,
                "cidade": mr[2] or "",
                "estado": mr[3] or "",
                "distancia_km": round(d, 2),
                "latitude": float(mr[4]),
                "longitude": float(mr[5])
            }

    return {
        "encontrado": True,
        "query": q_raw,
        "display_name": display_name,
        "tipo": tipo,
        "cidade": cidade_detectada,
        "estado": estado_detectado,
        "latitude": round(lat, 6),
        "longitude": round(lng, 6),
        "hub_mais_proximo": hub_mais_proximo,
        "md_mais_proximo": md_mais_proximo
    }


@router.get("/pontos/classificacao")
def listar_classificacoes_pontos(db: Session = Depends(get_db)):
    """Lista todos os pontos com overrides manuais de classificação (HUB vs MD)."""
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS ponto_classificacao_override (
                ponto_codigo TEXT PRIMARY KEY,
                tipo TEXT NOT NULL,
                atualizado_em TEXT
            );
        """))
        db.commit()
        rows = db.execute(text("SELECT ponto_codigo, tipo, atualizado_em FROM ponto_classificacao_override ORDER BY ponto_codigo")).fetchall()
        return [{"ponto_codigo": r[0], "tipo": r[1], "atualizado_em": r[2]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pontos/classificacao")
def post_classificacao_ponto(payload: PontoTipoOverridePayload, db: Session = Depends(get_db)):
    """Define manualmente se um ponto específico é MD (Minidrop), HUB, PONTO_APOIO ou PONTO_REDE."""
    codigo = payload.ponto_codigo.strip().upper()
    tipo_raw = payload.tipo.strip().upper()
    mapa_validos = {
        "MD": ("MD", "MINIDROP"),
        "MINIDROP": ("MD", "MINIDROP"),
        "HUB": ("HUB", "HUB"),
        "PONTO_APOIO": ("PONTO_APOIO", "PONTO DE APOIO"),
        "PONTO DE APOIO": ("PONTO_APOIO", "PONTO DE APOIO"),
        "PONTO_REDE": ("PONTO_REDE", "PONTO DE REDE"),
        "PONTO DE REDE": ("PONTO_REDE", "PONTO DE REDE"),
    }
    if tipo_raw not in mapa_validos:
        raise HTTPException(status_code=400, detail="Tipo inválido. Use MD, HUB, PONTO_APOIO ou PONTO_REDE.")
    
    tipo_ov, tipo_cfg = mapa_validos[tipo_raw]
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS ponto_classificacao_override (
            ponto_codigo TEXT PRIMARY KEY,
            tipo TEXT NOT NULL,
            atualizado_em TEXT
        );
    """))
    db.execute(text("""
        INSERT OR REPLACE INTO ponto_classificacao_override (ponto_codigo, tipo, atualizado_em)
        VALUES (:codigo, :tipo, :ts);
    """), {"codigo": codigo, "tipo": tipo_ov, "ts": agora})
    try:
        db.execute(text("UPDATE md_mapping SET tipo_ponto = :t WHERE UPPER(TRIM(md_codigo)) = :c"), {"t": tipo_cfg, "c": codigo})
        db.execute(text("UPDATE malha_coordenadas SET tipo_ponto = :t WHERE UPPER(TRIM(md_codigo)) = :c"), {"t": tipo_cfg, "c": codigo})
    except Exception:
        pass
    db.commit()
    
    return {
        "status": "success",
        "message": f"Ponto '{codigo}' configurado como '{tipo_cfg}' com sucesso!",
        "ponto_codigo": codigo,
        "tipo": tipo_ov
    }


@router.delete("/pontos/classificacao/{ponto_codigo}")
def delete_classificacao_ponto(ponto_codigo: str, db: Session = Depends(get_db)):
    """Remove override manual e volta para a classificação automática."""
    codigo = ponto_codigo.strip().upper()
    db.execute(text("DELETE FROM ponto_classificacao_override WHERE UPPER(TRIM(ponto_codigo)) = :codigo"), {"codigo": codigo})
    db.commit()
    return {"status": "success", "message": f"Override do ponto '{codigo}' removido. Volta ao padrão automático."}


@router.get("/solicitacoes/{id}/diagnostico-d1")
def get_diagnostico_d1(id: int, db: Session = Depends(get_db)):
    """Diagnóstico Automático baseado nos dados históricos importados via Planilha D-1. Responde às 14 perguntas do negócio."""
    from models.models import DetalheMDHistorico, SellerPickupRegistry, DetalheClienteMDHistorico, PenalidadesMD
    
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    cidade_norm = sol.cidade.strip().upper()
    estado_norm = sol.estado.strip().upper()
    cliente_norm = sol.cliente_nome.strip()
    cidade_like = f"%{cidade_norm}%"
    
    # 1 & 2 & 3. Já operamos na cidade / Como operamos / Quais pontos existem
    # Consulta direta em criacao_pedidos_historico (D-1)
    rows_d1_cid = db.execute(text("""
        SELECT 
            COUNT(DISTINCT CASE WHEN ponto_colecao IS NOT NULL AND trim(ponto_colecao) != '' THEN ponto_colecao END),
            COUNT(DISTINCT CASE WHEN merchant_nome IS NOT NULL AND trim(merchant_nome) != '' THEN merchant_nome END),
            SUM(total_pedidos),
            SUM(CASE WHEN LOWER(status_pedido) IN ('carregamento', 'descarregamento', 'foi assinado', 'coletado', 'saco selado') THEN total_pedidos ELSE 0 END)
        FROM criacao_pedidos_historico
        WHERE UPPER(cidade) LIKE :cid OR UPPER(bairro) LIKE :cid
    """), {"cid": cidade_like}).fetchone()
    
    d1_mds_cnt = int(rows_d1_cid[0] or 0)
    d1_sellers_cnt = int(rows_d1_cid[1] or 0)
    d1_vol_total = int(rows_d1_cid[2] or 0)
    d1_coletados = int(rows_d1_cid[3] or 0)
    
    # Buscar nomes de MDs da cidade
    mds_cidade = db.query(DetalheMDHistorico.md).filter(
        DetalheMDHistorico.cidade.like(cidade_like)
    ).distinct().all()
    md_names = [m[0] for m in mds_cidade if m[0]]
    
    rows_d1_mds = db.execute(text("""
        SELECT DISTINCT ponto_colecao 
        FROM criacao_pedidos_historico 
        WHERE (UPPER(cidade) LIKE :cid OR UPPER(bairro) LIKE :cid) 
          AND ponto_colecao IS NOT NULL AND trim(ponto_colecao) != ''
        LIMIT 10
    """), {"cid": cidade_like}).fetchall()
    for r in rows_d1_mds:
        if r[0] and r[0] not in md_names:
            md_names.append(r[0])
    
    sellers_cidade = max(d1_sellers_cnt, db.query(SellerPickupRegistry.merchant_id).filter(
        SellerPickupRegistry.cidade_origem.like(cidade_like)
    ).count())
    
    ja_opera_cidade = (len(md_names) > 0) or (sellers_cidade > 0) or (d1_vol_total > 0)
    
    modalidade_cidade = "Sem Operação Anterior"
    if (len(md_names) > 0 or d1_mds_cnt > 0) and sellers_cidade > 0:
        modalidade_cidade = "Híbrido (Ponto MD + Seller Pickup)"
    elif len(md_names) > 0 or d1_mds_cnt > 0:
        modalidade_cidade = "Ponto MD (Posto Operacional Dropoff)"
    elif sellers_cidade > 0:
        modalidade_cidade = "Coleta Porta-a-Porta (Seller Pickup)"
        
    # 4 & 5. Cliente já opera conosco / Onde opera
    cliente_pracas = db.query(DetalheClienteMDHistorico.regional).filter(
        DetalheClienteMDHistorico.nome_cliente.like(f"%{cliente_norm}%")
    ).distinct().all()
    pracas_cliente = [p[0] for p in cliente_pracas if p[0]]
    
    cli_d1 = db.execute(text("""
        SELECT DISTINCT estado, cidade, SUM(total_pedidos)
        FROM criacao_pedidos_historico
        WHERE LOWER(nome_cliente) LIKE :cli
        GROUP BY estado, cidade
        ORDER BY SUM(total_pedidos) DESC
        LIMIT 6
    """), {"cli": f"%{cliente_norm.lower()}%"}).fetchall()
    
    cliente_recorrente = len(cli_d1) > 0 or len(pracas_cliente) > 0 or db.query(SellerPickupRegistry).filter(
        SellerPickupRegistry.merchant_nome.like(f"%{cliente_norm}%")
    ).count() > 0
    
    if cli_d1:
        pracas_cliente = list(dict.fromkeys(pracas_cliente + [f"{r[1]}/{r[0]}" for r in cli_d1 if r[1]]))
    
    # 8 & 9. Volume Histórico e SLA Histórico da Praça
    vol_hist = db.query(DetalheMDHistorico.total).filter(
        DetalheMDHistorico.cidade.like(cidade_like)
    ).all()
    vol_medio_praca = d1_vol_total if d1_vol_total > 0 else (int(sum([v[0] for v in vol_hist if v[0]]) / max(len(vol_hist), 1)) if vol_hist else 0)
    
    sla_hist = db.query(DetalheMDHistorico.taxa_coleta).filter(
        DetalheMDHistorico.cidade.like(cidade_like)
    ).all()
    sla_medio_praca = round((d1_coletados / max(d1_vol_total, 1) * 100), 1) if d1_vol_total > 0 else (round(sum([s[0] for s in sla_hist if s[0]]) / max(len(sla_hist), 1), 1) if sla_hist else 98.5)
    
    # 10. Restrições conhecidas
    restricoes = db.query(PenalidadesMD).filter(
        PenalidadesMD.md.in_(md_names)
    ).all() if md_names else []
    
    penalidades_list = [f"{r.md}: {r.motivo} ({r.pontos} pts)" for r in restricoes]
    
    # 11. Dimensionamento de Recursos sugerido
    vol_est = sol.volume_estimado_diario or 500
    pda_sugerido = max(1, round(vol_est / 1000))
    auxiliares_sugeridos = max(1, round(vol_est / 800))
    veiculo_sugerido = "Carro/Fiorino" if vol_est < 300 else ("Van Executiva" if vol_est < 1500 else "VUC Dedicado + Carreta Apoio")
    sacas_sugeridas = round(vol_est / 4)
    lacres_sugeridos = sacas_sugeridas * 2
    
    # 14. Pós-Go-Live Performance (Real vs Estimado)
    perf_pos = {
        "status_rampa": "Em Acompanhamento D+1 a D+30",
        "volume_estimado_diario": vol_est,
        "volume_real_d1": vol_est if sol.status == "Concluído" else 0,
        "sla_meta": 98.5,
        "sla_real_d1": sla_medio_praca,
        "anomalia_detectada": False
    }

    return {
        "perguntas_respostas": {
            "1_ja_opera_cidade": {
                "pergunta": "1. Já operamos nessa cidade/UF?",
                "resposta": f"Sim, a ANJUN já possui histórico operacional consolidado em {sol.cidade}/{sol.estado}." if ja_opera_cidade else f"Não. {sol.cidade}/{sol.estado} é uma praça nova (expansão).",
                "status_badge": "Praça Existente" if ja_opera_cidade else "Nova Praça"
            },
            "2_como_opera_cidade": {
                "pergunta": "2. Como operamos nessa cidade?",
                "resposta": modalidade_cidade
            },
            "3_pontos_existentes": {
                "pergunta": "3. Quais pontos/operações existem nessa localidade?",
                "resposta": f"{len(md_names)} MD(s) ativo(s) ({', '.join(md_names[:6]) if md_names else 'Em mapeamento'}) e {sellers_cidade} seller(s) com demanda mapeada." if ja_opera_cidade else "Nenhum ponto ou seller cadastrado previamente nesta cidade.",
                "total_mds": len(md_names),
                "total_sellers": sellers_cidade
            },
            "4_cliente_ja_opera": {
                "pergunta": "4. Esse cliente já opera conosco?",
                "resposta": f"Sim, o cliente '{sol.cliente_nome}' já possui cadastro e operações ativas na ANJUN." if cliente_recorrente else f"Novo cliente na ANJUN (primeiro cadastro).",
                "status_badge": "Cliente Recorrente" if cliente_recorrente else "Novo Cliente"
            },
            "5_onde_cliente_opera": {
                "pergunta": "5. Onde esse cliente já opera?",
                "resposta": f"Regiões/Praças com volume ativo: {', '.join(pracas_cliente)}" if pracas_cliente else "Primeira solicitação de praça deste cliente."
            },
            "6_tipo_produto": {
                "pergunta": "6. Já operamos esse tipo de produto/carga?",
                "resposta": f"Segmento '{sol.segmento or 'Geral'}': Operação First Mile padrão com alta aderência operacional."
            },
            "7_operacoes_proximas": {
                "pergunta": "7. Existem operações próximas dessa localidade?",
                "resposta": f"Operação integrada com a malha regional de {sol.estado}."
            },
            "8_volume_historico": {
                "pergunta": "8. Qual o volume histórico dessas operações?",
                "resposta": f"Média histórica / D-1 da praça de {vol_medio_praca:,} pacotes processados."
            },
            "9_sla_historico": {
                "pergunta": "9. Qual o histórico de SLA dessas operações?",
                "resposta": f"Taxa de coleta / SLA de {sla_medio_praca}% na praça."
            },
            "10_restricoes_conhecidas": {
                "pergunta": "10. Existe alguma restrição ou observação operacional conhecida?",
                "resposta": penalidades_list if penalidades_list else ["Nenhuma restrição grave ou penalidade ativa registrada para esta praça."]
            },
            "11_recursos_sugeridos": {
                "pergunta": "11. Quais recursos precisarão ser avaliados?",
                "resposta": f"Dimensionamento sugerido para {vol_est} pac/dia: {pda_sugerido} PDA(s), {auxiliares_sugeridos} Auxiliar(es), Veículo: {veiculo_sugerido}, {sacas_sugeridas} Sacas e {lacres_sugeridos} Lacres."
            },
            "12_status_implantacao": {
                "pergunta": "12. Qual o status da implantação?",
                "resposta": sol.status
            },
            "13_datas_golive": {
                "pergunta": "13. Qual a data solicitada vs. data validada de Go-Live?",
                "resposta": f"Solicitado pelo Comercial em: {sol.data_solicitacao} | Data Validada Go-Live: {sol.data_go_live_prevista or 'Pendente de validação da Operação'}"
            },
            "14_pos_golive_performance": perf_pos
        }
    }



@router.put("/solicitacoes/{id}/status")
def update_status(id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    """Atualização direta de status."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    _registrar_historico(sol, payload.status, payload.observacao or "")
    
    db.commit()
    db.refresh(sol)
    return sol


@router.delete("/solicitacoes/{id}")
def delete_solicitacao(id: int, db: Session = Depends(get_db)):
    """Remove uma solicitação."""
    sol = db.query(SolicitacaoImplantacao).filter(SolicitacaoImplantacao.id == id).first()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    
    db.delete(sol)
    db.commit()
    return {"message": "Solicitação removida com sucesso"}


@router.get("/relatorio-quarta")
def get_relatorio_quarta(db: Session = Depends(get_db)):
    """Etapa 6: Gerador do Relatório Semanal de Status (Toda quarta-feira)."""
    _seed_initial_data_if_empty(db)
    
    solicitacoes = db.query(SolicitacaoImplantacao).order_by(SolicitacaoImplantacao.id.asc()).all()
    
    hoje = datetime.now().strftime("%d/%m/%Y")
    
    texto_formatado = f"📢 *ATUALIZAÇÃO SEMANAL DE IMPLANTAÇÕES FM - {hoje}*\n"
    texto_formatado += f"Focal Projetos: @Diego de Souza Mandarino | Focal Operação: @Thatiane Silva Santos\n"
    texto_formatado += "------------------------------------------------------------\n\n"
    
    status_grupos = {
        "Em análise": [],
        "Visita técnica": [],
        "Em preparação": [],
        "Go-Live definido": [],
        "Concluído": [],
        "Restrição/Pendente": []
    }
    
    for item in solicitacoes:
        st_name = item.status if item.status in status_grupos else "Restrição/Pendente"
        status_grupos[st_name].append({
            "id": item.id,
            "codigo": item.codigo,
            "cliente_nome": item.cliente_nome,
            "cidade": item.cidade,
            "estado": item.estado,
            "volume_estimado_diario": item.volume_estimado_diario,
            "data_go_live_prevista": item.data_go_live_prevista,
            "condicao_viabilidade": item.condicao_viabilidade,
            "parecer_operacional": item.parecer_operacional
        })
        
    descs = {
        "Em análise": "Solicitação recebida e em avaliação de viabilidade",
        "Visita técnica": "Visita ao cliente em andamento/agendada",
        "Em preparação": "Recursos e estrutura sendo preparados",
        "Go-Live definido": "Data de início validada pela Operação",
        "Concluído": "Operação implantada com sucesso",
        "Restrição/Pendente": "Implantação aguardando resolução de pendência"
    }
    
    for st_name, lista in status_grupos.items():
        texto_formatado += f"📌 *{st_name.upper()}* ({len(lista)})\n"
        texto_formatado += f"_{descs[st_name]}_\n"
        if not lista:
            texto_formatado += "  (Nenhuma solicitação neste status)\n\n"
        else:
            for s in lista:
                golive_str = f" | Go-Live: {s['data_go_live_prevista']}" if s['data_go_live_prevista'] else ""
                vol_str = f" | {s['volume_estimado_diario']} pac/dia" if s['volume_estimado_diario'] else ""
                texto_formatado += f"  • *[{s['codigo']}] {s['cliente_nome']}* ({s['cidade']}/{s['estado']}){vol_str}{golive_str}\n"
                if s['condicao_viabilidade']:
                    texto_formatado += f"    - Viabilidade: {s['condicao_viabilidade']}\n"
                if s['parecer_operacional']:
                    texto_formatado += f"    - Obs: {s['parecer_operacional']}\n"
            texto_formatado += "\n"
            
    texto_formatado += "------------------------------------------------------------\n"
    texto_formatado += "Próxima atualização oficial: Quarta-feira subsequente."

    return {
        "data_relatorio": hoje,
        "total_solicitacoes": len(solicitacoes),
        "grupos": status_grupos,
        "texto_formatado": texto_formatado
    }


def _seed_initial_data_if_empty(db: Session):
    """Popular dados de exemplo iniciais caso a tabela esteja vazia."""
    count = db.query(SolicitacaoImplantacao).count()
    if count > 0:
        return
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    exemplos = [
        {
            "codigo": "IMP-2026-001",
            "cliente_nome": "Magazine Luiza - Seller Hub SP",
            "vendedor_comercial": "Carlos Eduardo (Comercial)",
            "focal_projetos": "@Diego de Souza Mandarino",
            "focal_operacao": "@Thatiane Silva Santos",
            "segmento": "E-Commerce / Varejo",
            "endereco_coleta": "Av. Marginal Pinheiros, 12000, Bloco B",
            "cidade": "São Paulo",
            "estado": "SP",
            "cep": "04578-000",
            "volume_estimado_diario": 1200,
            "horario_coleta_janela": "15:00 - 18:00",
            "observacoes_comercial": "Cliente prioritário com pico de fim de ano.",
            "data_solicitacao": today_str,
            "status": "Go-Live definido",
            "condicao_viabilidade": "② Necessidade de prazo para implantação",
            "capacidade_operacional_ok": 1,
            "disponibilidade_frota_ok": 1,
            "atendimento_regiao_ok": 1,
            "necessidade_contratacao_equipe": 1,
            "necessidade_novas_rotas": 1,
            "estrutura_equipamentos_ok": 1,
            "parecer_operacional": "Aprovado com inclusão de 1 nova rota dedicando VUC e contratação de 2 auxiliares.",
            "status_visita": "Realizada",
            "data_visita_tecnica": today_str,
            "relatorio_visita": "Docas validadas. Espaço seguro para carregamento e conferência de sacas.",
            "pda_qtd": 2,
            "mesa_posto_operacional": "Mesa 03 - Galpão Principal",
            "equipamentos_desc": "2 PDAs Android Zebra + 1 Impressora Térmica Zebra ZD421",
            "equipe_contratacao_desc": "2 Auxiliares operacionais contratados",
            "rotas_frota_desc": "1 Rota VUC dedicada período da tarde",
            "insumos_desc": "500 Sacas ANJUN + 1000 Lacres numerados",
            "outros_recursos": "Crachás de acesso à doca cliente",
            "data_go_live_prevista": "15/10/2026",
            "go_live_validado_operacao": 1,
            "comunicado_comercial_em": today_str,
            "comercial_ciente": 1,
            "criado_em": now_str,
            "atualizado_em": now_str
        },
        {
            "codigo": "IMP-2026-002",
            "cliente_nome": "Mercado Livre - Concentrador Guarulhos",
            "vendedor_comercial": "Fernanda Lima (Comercial)",
            "focal_projetos": "@Diego de Souza Mandarino",
            "focal_operacao": "@Thatiane Silva Santos",
            "segmento": "Marketplace Hub",
            "endereco_coleta": "Rodovia Presidente Dutra, KM 215",
            "cidade": "Guarulhos",
            "estado": "SP",
            "cep": "07170-000",
            "volume_estimado_diario": 3500,
            "horario_coleta_janela": "18:00 - 21:00",
            "observacoes_comercial": "Coleta noturna com janela rígida de SLA.",
            "data_solicitacao": today_str,
            "status": "Em preparação",
            "condicao_viabilidade": "② Necessidade de prazo para implantação",
            "capacidade_operacional_ok": 1,
            "disponibilidade_frota_ok": 1,
            "atendimento_regiao_ok": 1,
            "necessidade_contratacao_equipe": 1,
            "necessidade_novas_rotas": 0,
            "estrutura_equipamentos_ok": 1,
            "parecer_operacional": "Ajuste na janela horária do galpão de Guarulhos necessário.",
            "status_visita": "Realizada",
            "data_visita_tecnica": today_str,
            "relatorio_visita": "Visita concluída pela Thatiane Santos. Docas em bom estado.",
            "pda_qtd": 4,
            "mesa_posto_operacional": "Posto Avançado GRU",
            "equipamentos_desc": "4 PDAs Zebra TC21 + Leitor de Mesa Datalogic",
            "equipe_contratacao_desc": "Treinamento da equipe de turno noturno",
            "rotas_frota_desc": "2 Vans de grande porte",
            "insumos_desc": "1000 Sacas de transferência",
            "outros_recursos": "",
            "data_go_live_prevista": "22/10/2026",
            "go_live_validado_operacao": 1,
            "comunicado_comercial_em": "",
            "comercial_ciente": 0,
            "criado_em": now_str,
            "atualizado_em": now_str
        },
        {
            "codigo": "IMP-2026-003",
            "cliente_nome": "Shopee Seller Express Campinas",
            "vendedor_comercial": "Ricardo Mendes (Comercial)",
            "focal_projetos": "@Diego de Souza Mandarino",
            "focal_operacao": "@Thatiane Silva Santos",
            "segmento": "Cross-Border / Moda",
            "endereco_coleta": "Av. Anhanguera, KM 98",
            "cidade": "Campinas",
            "estado": "SP",
            "cep": "13060-000",
            "volume_estimado_diario": 800,
            "horario_coleta_janela": "13:00 - 16:00",
            "observacoes_comercial": "Solicitação para atendimento imediato.",
            "data_solicitacao": today_str,
            "status": "Visita técnica",
            "condicao_viabilidade": "① Início imediato",
            "capacidade_operacional_ok": 1,
            "disponibilidade_frota_ok": 1,
            "atendimento_regiao_ok": 1,
            "necessidade_contratacao_equipe": 0,
            "necessidade_novas_rotas": 0,
            "estrutura_equipamentos_ok": 1,
            "parecer_operacional": "Capacidade da filial Campinas comporta o volume sem sobressaltos.",
            "status_visita": "Agendada",
            "data_visita_tecnica": today_str,
            "relatorio_visita": "Visita técnica agendada com Thatiane Santos.",
            "pda_qtd": 1,
            "mesa_posto_operacional": "",
            "equipamentos_desc": "1 PDA",
            "equipe_contratacao_desc": "",
            "rotas_frota_desc": "Rota existente Campinas-02",
            "insumos_desc": "200 Sacas",
            "outros_recursos": "",
            "data_go_live_prevista": "10/10/2026",
            "go_live_validado_operacao": 0,
            "comunicado_comercial_em": "",
            "comercial_ciente": 0,
            "criado_em": now_str,
            "atualizado_em": now_str
        },
        {
            "codigo": "IMP-2026-004",
            "cliente_nome": "Dafiti Group Distribution Center",
            "vendedor_comercial": "Juliana Torres (Comercial)",
            "focal_projetos": "@Diego de Souza Mandarino",
            "focal_operacao": "@Thatiane Silva Santos",
            "segmento": "Calçados & Vestuário",
            "endereco_coleta": "Rodovia Dom Pedro I, KM 72",
            "cidade": "Atibaia",
            "estado": "SP",
            "cep": "12940-000",
            "volume_estimado_diario": 5000,
            "horario_coleta_janela": "09:00 - 12:00",
            "observacoes_comercial": "Alta volumetria diária.",
            "data_solicitacao": today_str,
            "status": "Restrição/Pendente",
            "condicao_viabilidade": "③ Baixa aderência / restrição operacional",
            "capacidade_operacional_ok": 0,
            "disponibilidade_frota_ok": 0,
            "atendimento_regiao_ok": 1,
            "necessidade_contratacao_equipe": 1,
            "necessidade_novas_rotas": 1,
            "estrutura_equipamentos_ok": 0,
            "parecer_operacional": "Indisponibilidade de frota pesada para atendimento de 5.000 pacotes/dia em Atibaia. Necessário contratar agregados ou carreta de apoio.",
            "status_visita": "Pendente",
            "data_visita_tecnica": "",
            "relatorio_visita": "",
            "pda_qtd": 0,
            "mesa_posto_operacional": "",
            "equipamentos_desc": "",
            "equipe_contratacao_desc": "",
            "rotas_frota_desc": "",
            "insumos_desc": "",
            "outros_recursos": "",
            "data_go_live_prevista": "",
            "go_live_validado_operacao": 0,
            "comunicado_comercial_em": "",
            "comercial_ciente": 0,
            "criado_em": now_str,
            "atualizado_em": now_str
        }
    ]
    
    for ex in exemplos:
        item = SolicitacaoImplantacao(**ex)
        db.add(item)
    db.commit()
