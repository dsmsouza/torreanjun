from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import datetime

from database.connection import get_db
from models.models import JustificativasDiarias, PenalidadesMD, MDObservacoesFixas, DetalheMDHistorico
from schemas.schemas import (
    JustificativaCreate, 
    JustificativaResponse, 
    OptionsResponse, 
    ResumoGeralResponse, 
    MDRankingResponse, 
    ClienteRankingResponse,
    MalhaPacoteResponse,
    PenalidadeCreate,
    PenalidadeResponse,
    ObservacaoFixaCreate,
    ObservacaoFixaResponse,
    MDScoreResponse,
    IACreate,
    IAResponse,
    MDAvaliarCreate,
    IAOtimizarRequest,
    MDOperacionalSave
)
from services import operacional as op_service
from services.gemini_service import gerar_conteudo_gemini
from services.operacional import (
    consultar_resumo_criacao,
    consultar_oportunidades_expansao,
    consultar_viabilidade_cidade,
    consultar_crescimento_polo,
    listar_propostas,
    criar_proposta,
    atualizar_proposta,
    deletar_proposta,
    simular_viabilidade_md
)


router = APIRouter(prefix="/api", tags=["Operacional"])

@router.get("/opcoes")
def get_opcoes(db: Session = Depends(get_db)):
    dias, semanas = op_service.buscar_datas_e_semanas(db)
    
    # Busca regionais distintas
    from models.models import DetalheMDHistorico
    from sqlalchemy import text
    rows = db.execute(text("SELECT DISTINCT regional FROM detalhe_md_historico WHERE regional IS NOT NULL AND regional != '' ORDER BY regional")).fetchall()
    regionais = [r[0] for r in rows]
    
    rows_cidades = db.execute(text("""
        SELECT DISTINCT cidade 
        FROM (
            SELECT cidade FROM detalhe_md_historico WHERE cidade IS NOT NULL AND cidade != '' AND cidade != 'NÃO CADASTRADA'
            UNION
            SELECT cidade FROM criacao_pedidos_historico WHERE cidade IS NOT NULL AND cidade != '' AND cidade != 'NÃO CADASTRADA'
            UNION
            SELECT cidade FROM malha_coordenadas WHERE cidade IS NOT NULL AND cidade != ''
        )
        ORDER BY cidade;
    """)).fetchall()
    cidades = [r[0] for r in rows_cidades]
    
    return {"dias": dias, "semanas": semanas, "regionais": regionais, "cidades": cidades}

@router.get("/resumo", response_model=ResumoGeralResponse)
def get_resumo(
    periodo_tipo: str = Query(..., description="Valores aceitos: Diário, Semanal, Mensal, Período"),
    rotulo: str = Query(..., description="Dia operacional, Semana, ou Mês de referência"),
    dt_inicio: Optional[str] = Query(None, description="Data de início do período (YYYY-MM-DD)"),
    dt_fim: Optional[str] = Query(None, description="Data de término do período (YYYY-MM-DD)"),
    regional: Optional[str] = Query(None, description="Regional para filtragem"),
    regra5k: bool = Query(False, description="Excluir cidades com volume inferior a 5000 pacotes no período"),
    modalidade: str = Query("TODOS", description="TODOS, DROPOFF, PICKUP"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_resumo_geral(db, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, regra5k, modalidade)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar resumo: {e}")

@router.get("/mds", response_model=List[MDRankingResponse])
def get_mds(
    periodo_tipo: str = Query(..., description="Diário, Semanal, Mensal, Período"),
    rotulo: str = Query(...),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    regra5k: bool = Query(False, description="Excluir cidades com volume inferior a 5000 pacotes no período"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_ranking_mds(db, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, regra5k)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar ranking de MDs: {e}")

@router.get("/clientes", response_model=List[ClienteRankingResponse])
def get_clientes(
    periodo_tipo: str = Query(...),
    rotulo: str = Query(...),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    modalidade: str = Query("TODOS", description="TODOS, DROPOFF, PICKUP"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_ranking_clientes(db, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, modalidade)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar ranking de clientes: {e}")

@router.get("/clientes/detalhe")
def get_clientes_detalhe(
    cliente: str = Query(...),
    periodo_tipo: str = Query(...),
    rotulo: str = Query(...),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    modalidade: str = Query("TODOS", description="TODOS, DROPOFF, PICKUP"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_detalhe_cliente_regionais(db, cliente, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, modalidade)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar detalhe regional do cliente: {e}")

@router.get("/clientes/sellers")
def get_clientes_sellers(
    cliente: str = Query(...),
    periodo_tipo: str = Query(...),
    rotulo: str = Query(...),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    modalidade: str = Query("TODOS", description="TODOS, DROPOFF, PICKUP"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_detalhe_cliente_sellers(db, cliente, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, modalidade)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar lista de sellers do cliente: {e}")

@router.get("/clientes/evolucao")
def get_clientes_evolucao(
    cliente: str = Query(...),
    periodo_tipo: str = Query(...),
    rotulo: str = Query(...),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    modalidade: str = Query("TODOS", description="TODOS, DROPOFF, PICKUP"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_evolucao_cliente(db, cliente, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, modalidade)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar evolução do cliente: {e}")

@router.get("/pickup")
def get_pickup(
    periodo_tipo: str = Query(...),
    rotulo: str = Query(...),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    tipo_coleta: Optional[str] = Query(None, description="TODOS, PICKUP_PURO, PICKUP_NO_MD"),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.carregar_detalhes_pickup(db, periodo_tipo, rotulo, dt_inicio, dt_fim, regional, tipo_coleta)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar detalhes de pickup: {e}")

@router.get("/malha", response_model=List[MalhaPacoteResponse])
def get_malha(
    regional: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        res = op_service.ler_radar_malha(db, regional)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler radar de malha: {e}")

@router.post("/justificativas", response_model=JustificativaResponse)
def post_justificativa(payload: JustificativaCreate, db: Session = Depends(get_db)):
    try:
        # Check if already exists for this day and regional
        existing = db.query(JustificativasDiarias).filter(
            JustificativasDiarias.dia_base == payload.dia_base,
            JustificativasDiarias.regional == payload.regional
        ).first()
        
        if existing:
            existing.justificativa = payload.justificativa
            existing.data_registro = datetime.datetime.now()
            db.commit()
            db.refresh(existing)
            return existing
        else:
            new_just = JustificativasDiarias(
                dia_base=payload.dia_base,
                regional=payload.regional,
                justificativa=payload.justificativa,
                data_registro=datetime.datetime.now()
            )
            db.add(new_just)
            db.commit()
            db.refresh(new_just)
            return new_just
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar justificativa: {e}")

@router.get("/justificativas", response_model=List[JustificativaResponse])
def get_justificativas(
    dia_base: Optional[str] = Query(None),
    regional: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(JustificativasDiarias)
        if dia_base:
            query = query.filter(JustificativasDiarias.dia_base == dia_base)
        if regional:
            query = query.filter(JustificativasDiarias.regional == regional)
        return query.order_by(JustificativasDiarias.data_registro.desc()).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar justificativas: {e}")

@router.delete("/justificativas/{id}")
def delete_justificativa(id: int, db: Session = Depends(get_db)):
    try:
        j = db.query(JustificativasDiarias).filter(JustificativasDiarias.id == id).first()
        if not j:
            raise HTTPException(status_code=404, detail="Justificativa não encontrada")
        db.delete(j)
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao deletar justificativa: {e}")


@router.get("/penalidades", response_model=List[PenalidadeResponse])
def get_penalidades(db: Session = Depends(get_db)):
    try:
        return db.query(PenalidadesMD).order_by(PenalidadesMD.data_penalidade.desc()).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar penalidades: {e}")

@router.post("/penalidades", response_model=PenalidadeResponse)
def post_penalidade(payload: PenalidadeCreate, db: Session = Depends(get_db)):
    try:
        new_p = PenalidadesMD(
            data_penalidade=payload.data_penalidade,
            md=payload.md,
            motivo=payload.motivo,
            pontos=payload.pontos
        )
        db.add(new_p)
        db.commit()
        db.refresh(new_p)
        return new_p
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao gravar penalidade: {e}")

@router.delete("/penalidades/{id}")
def delete_penalidade(id: int, db: Session = Depends(get_db)):
    try:
        p = db.query(PenalidadesMD).filter(PenalidadesMD.id == id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Penalidade não encontrada")
        db.delete(p)
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao deletar penalidade: {e}")

@router.get("/observacoes-fixas", response_model=List[ObservacaoFixaResponse])
def get_observacoes_fixas(db: Session = Depends(get_db)):
    try:
        return db.query(MDObservacoesFixas).order_by(MDObservacoesFixas.md.asc()).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar observações fixas: {e}")

@router.post("/observacoes-fixas", response_model=ObservacaoFixaResponse)
def post_observacao_fixa(payload: ObservacaoFixaCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(MDObservacoesFixas).filter(MDObservacoesFixas.md == payload.md).first()
        if existing:
            existing.observacao = payload.observacao
            db.commit()
            db.refresh(existing)
            return existing
        else:
            new_o = MDObservacoesFixas(md=payload.md, observacao=payload.observacao)
            db.add(new_o)
            db.commit()
            db.refresh(new_o)
            return new_o
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar alerta permanente: {e}")

@router.delete("/observacoes-fixas/{md}")
def delete_observacao_fixa(md: str, db: Session = Depends(get_db)):
    try:
        o = db.query(MDObservacoesFixas).filter(MDObservacoesFixas.md == md).first()
        if not o:
            raise HTTPException(status_code=404, detail="Alerta permanente não encontrado")
        db.delete(o)
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao remover alerta permanente: {e}")

@router.post("/mds/avaliar")
def post_mds_avaliar(payload: MDAvaliarCreate, db: Session = Depends(get_db)):
    try:
        from models.models import AvaliacaoMD
        import datetime
        new_eval = AvaliacaoMD(
            md=payload.md,
            decisao=payload.decisao,
            motivo=payload.motivo or "",
            data_avaliacao=datetime.datetime.now().strftime("%d/%m/%Y")
        )
        db.add(new_eval)
        db.commit()
        db.refresh(new_eval)
        return {"status": "success", "md": payload.md, "decisao": payload.decisao}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar avaliação do MD: {e}")

@router.post("/mds/salvar-formulario")
def post_mds_salvar_formulario(payload: MDOperacionalSave, db: Session = Depends(get_db)):
    try:
        from models.models import AvaliacaoMD, MalhaCoordenadas, MDObservacoesFixas
        import datetime
        
        # 1. Update IATA name in MalhaCoordenadas
        coord = db.query(MalhaCoordenadas).filter(MalhaCoordenadas.md_codigo == payload.md).first()
        if coord:
            coord.nome_ponto = payload.iata
            
        # 2. Update/Insert in MDObservacoesFixas (observacao)
        obs = db.query(MDObservacoesFixas).filter(MDObservacoesFixas.md == payload.md).first()
        if obs:
            obs.observacao = payload.observacao
        else:
            new_obs = MDObservacoesFixas(md=payload.md, observacao=payload.observacao)
            db.add(new_obs)
            
        # 3. Update/Insert in AvaliacaoMD (status / decisao)
        new_eval = AvaliacaoMD(
            md=payload.md,
            decisao=payload.status,
            motivo="Salvo via formulário do Inspetor",
            data_avaliacao=datetime.datetime.now().strftime("%d/%m/%Y")
        )
        db.add(new_eval)
        
        db.commit()
        return {"status": "success", "md": payload.md}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar formulário operacional do MD: {e}")

@router.get("/mds/score", response_model=List[MDScoreResponse])
def get_mds_score(db: Session = Depends(get_db)):
    try:
        # Get all distinct MDs in history and their regionals
        mds_list = db.query(DetalheMDHistorico.md, DetalheMDHistorico.regional).distinct().all()
        
        # Unique list of MDs to avoid duplicate mappings
        unique_mds = {}
        for md, regional in mds_list:
            if not md: continue
            # Keep the first regional found or SP if empty
            if md not in unique_mds:
                unique_mds[md] = regional or "N/A"
        
        # Get penalties sum grouped by MD
        penalties = db.query(PenalidadesMD.md, text("sum(pontos) as total_pts")).group_by(PenalidadesMD.md).all()
        penalties_dict = {p[0]: int(p[1]) for p in penalties}
        
        res = []
        for md, regional in unique_mds.items():
            pts_desconto = penalties_dict.get(md, 0)
            score_final = 500 - pts_desconto
            recomendacao = "Estável" if score_final >= 450 else ("Monitorar" if score_final >= 350 else "Trocar")
            res.append({
                "md": md,
                "regional": regional,
                "pontos_desconto": pts_desconto,
                "score_final": score_final,
                "recomendacao": recomendacao
            })
        
        # Sort by score ascending (lowest score first = worst performers)
        return sorted(res, key=lambda x: x["score_final"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao calcular score de MDs: {e}")

@router.post("/ia/gerar", response_model=IAResponse)
def post_ia_gerar(payload: IACreate, db: Session = Depends(get_db)):
    try:
        tipo = payload.tipo_relatorio.lower()
        filial = payload.filial
        contexto_adicional = payload.contexto or ""
        
        # Fetch permanent alerts for MDs of this filial/regional
        alertas_filial = []
        try:
            # Query mapping MDs in this regional that have permanent observations
            query_alerts = """
                SELECT DISTINCT f.md, f.observacao 
                FROM md_observacoes_fixas f
                JOIN detalhe_md_historico h ON h.md = f.md
                WHERE h.regional = :regional;
            """
            rows_alerts = db.execute(text(query_alerts), {"regional": filial}).fetchall()
            
            # Fallback filter if no direct join (e.g. historical details are empty)
            if not rows_alerts:
                all_alerts = db.execute(text("SELECT md, observacao FROM md_observacoes_fixas;")).fetchall()
                filtered = []
                for row in all_alerts:
                    exists = db.execute(
                        text("SELECT 1 FROM detalhe_md_historico WHERE md = :md AND regional = :reg LIMIT 1;"),
                        {"md": row[0], "reg": filial}
                    ).fetchone()
                    if exists:
                        filtered.append(row)
                rows_alerts = filtered
                
            if rows_alerts:
                alertas_filial = [f"- MD {r[0]}: \"{r[1]}\"" for r in rows_alerts]
        except Exception as e:
            print(f"Error fetching filial alerts: {e}")
            
        # Build local structured report to serve as fallback
        local_report = f"### 📊 RELATÓRIO LOCAL CONSOLIDADO - FILIAL {filial}\n"
        if contexto_adicional:
            local_report += f"Métricas operacionais informadas:\n{contexto_adicional}\n"
        else:
            local_report += "Nenhuma métrica operacional informada no contexto.\n"
        if alertas_filial:
            local_report += "\nAlertas Permanentes ativos:\n" + "\n".join(alertas_filial) + "\n"
            
        prompt = ""
        if tipo == "wbr":
            prompt = f"""Aja como um Analista Logístico Sênior da ANJUN Logística.
A diretoria exigiu um Relatório Executivo WBR (Weekly Business Review) focado puramente em NÚMEROS e DADOS (mais tabelas curtas, menos texto) para a filial {filial}.

DADOS CONTEXTUAIS DA OPERAÇÃO:
{contexto_adicional}

Por favor, estruture sua resposta nas seguintes seções:
1. CONSOLIDAÇÃO DA FILIAL: Mostre Volume Total, Backlog Total e Eficiência Geral.
2. TOP OFENSORES DA FILIAL: Apresente os MDs que causaram desvio no SLA de coletas.
3. PLANO DE AÇÃO: Recomende ações com base nas justificativas para mitigar o backlog operacional.
Use tom corporativo direto e formatação Markdown limpa."""

        elif tipo == "wbr_semanal":
            prompt = f"""Atue como um analista logístico redigindo o Relatório de WBR (Weekly Business Review) sobre a filial {filial}.
O texto será revisado por um gestor sênior, então ESCREVA COM UM TOM HUMANO, NATURAL E FLUIDO. Esqueça jargões forçados ou tom excessivamente corporativo/robótico. Aja como uma pessoa real explicando a situação.
Baseado EXCLUSIVAMENTE nos dados no contexto abaixo, crie um relatório completo, mesclando dados quantitativos e uma narrativa cronológica dos desvios (dia a dia).

A estrutura do relatório DEVE seguir rigorosamente estes tópicos:

# Relatório Executivo - WBR | {filial}

## 1. Introdução e Resumo da Semana
(Escreva 1 parágrafo natural informando o volume bipado total, backlog total e eficiência geral do período. Comente se a meta de SLA foi atingida e resuma o desafio da semana de forma direta e humana.)

## 2. Tabela Executiva de Desvios
(Gere uma Tabela Markdown contendo os piores desvios da semana, usando EXATAMENTE estas colunas)
| Data | Regional | Coleta (Vol) | Backlog | SLA (%) | Causa Raiz | Status/Previsão |
*Atenção: As colunas Causa e Status devem ter no máximo 5 a 6 palavras.*

## 3. Análise Diária por Regional (Cronologia)
(Para cada regional com problema, escreva um pequeno parágrafo explicando de forma fluida e humana o que aconteceu dia a dia.
Exemplo de tom: "Em São Paulo, o maior problema foi na segunda (15/06) porque faltaram veículos. Já na quarta (17/06), as cargas ficaram retidas no HUB e o backlog aumentou para N pacotes. Na sexta a situação normalizou.")
*Atenção: Especifique as datas exatas e seja guiado pelos dados, mas escreva de forma natural.*

## 4. Conclusão
(Escreva 1 parágrafo curto e natural concluindo o cenário atual da operação.)

DADOS CONTEXTUAIS DA OPERAÇÃO PARA ESTA ANÁLISE:
{contexto_adicional}
"""

        elif tipo == "qualidade":
            prompt = f"""Atue como um Analista de Qualidade focado em dados operacionais e de SLA para a filial {filial}.
Avalie os números da operação abaixo:
{contexto_adicional}

Forneça um relatório com:
1. Raio-X do Backlog: Análise dos piores ofensores da filial.
2. Avaliação de SLA de Bipagem: Avalie o horário de coletas (janela recomendada 08h-18h).
3. Ações Corretivas: Ações para reestabelecer o OTR da filial acima de 98%."""

        elif tipo == "cobranca":
            prompt = f"""Escreva uma mensagem corporativa e profissional de cobrança para os gestores operacionais do MD / Filial {filial}.
O objetivo é exigir retorno numérico e plano de ação urgente sobre o SLA operacional de coletas.

DADOS DA OPERAÇÃO:
{contexto_adicional}

Diretrizes da mensagem:
1. Tom sério, formal e corporativo.
2. Visão Inicial: Exiba os números absolutos do desvio (Volume processado vs Retido).
3. Prazo e Exigência: Exija resposta em até 24 horas sobre o plano para retornar à meta padrão de 98%."""

        else: # free prompt or ask
            prompt = f"""Aja como um Assistente de Inteligência Artificial para a Torre de Controle ANJUN Logística.
Responda à seguinte pergunta ou comando feito pelo operador sobre a filial {filial}.

CONTEXTO OPERACIONAL ATIVO DA FILIAL:
{contexto_adicional}

PERGUNTA OU COMANDO DO OPERADOR:
{contexto_adicional if tipo == 'free' and not contexto_adicional else 'Responda de forma direta e profissional.'}
"""

        if alertas_filial:
            prompt += "\n\nALERTAS OPERACIONAIS FIXOS (PERMANENTES) ATIVOS PARA ESTA FILIAL:\n"
            prompt += "\n".join(alertas_filial)
            prompt += "\nPor favor, leve em conta e cite estes alertas permanentes se impactarem os resultados ou justificarem a performance operacional."

        # Force strict formatting guidelines to prevent data invention and ensure exact format matches user instructions
        prompt += """\n\nDIRETRIZES OBRIGATÓRIAS E CRUCIAIS DE ESCRITA:
1. NUNCA invente ou alucine dados (volumes, backlogs, percentuais, nomes, ou cidades). Se os dados não estiverem descritos no contexto operacional fornecido, não os mencione ou reporte como indisponíveis. Use APENAS os dados reais fornecidos.
2. A estrutura do seu relatório deve ser exatamente a seguinte (adapte dinamicamente se o contexto for de um MD específico, de uma filial ou de um período diário/semanal/mensal):
   - Inicie exatamente com: "Fechei o relatório de/do/da [Período/Data/MD/Filial] e temos o seguinte resultado. O volume total bipado pelos MDs foi de [volume total] pacotes, com um backlog de [Backlog] pacotes e a eficiência de carregamento fechou em [eficiência]%." (Use o cálculo real: eficiência = ((volume - backlog) / volume * 100) se volume > 0, senão 100.0%).
   - Liste os principais MDs com backlog com o seguinte título: "Passando aqui os principais MDs com backlog: (listar até o top 8 do contexto)"
   - Cada MD na lista deve seguir o formato estrito: "**Nome do MD / Cidade**: [quantidade de backlog] pacotes de backlog" (Se houver alerta permanente ou observação fixa descrita no contexto para este MD, adicione logo em seguida como: " (Alerta: [conteúdo do alerta])").
   - Finalize explicando as justificativas dos motivos de cada MD em backlog ou fornecendo um panorama geral da operação que motiva esse backlog e quais os planos de ação estão sendo tomados.
3. Não use emojis em nenhuma parte do relatório.
4. Mantenha os destaques e números em **negrito**.
5. Escreva com educação, polidez, foco em números e dados reais. Mantenha a variação de escrita natural e com toque humano executivo, mas sempre seguindo esta linha estrutural obrigatória.
6. DIRETRIZES DE TERMINOLOGIA OPERACIONAL ANJUN:
   - "Coleta": refere-se estritamente ao ato do seller depositar o pacote no ponto de coleta (MD) e o MD bipar o pacote.
   - "Carregamento" ou "Carregar": refere-se ao ato do veículo da ANJUN passar no ponto (MD) e recolher os pacotes para transporte.
   - Portanto, refira-se ao backlog de pacotes retidos no MD como "backlog de carregamento" (pacotes pendentes de carregamento pela ANJUN) e ao SLA/meta como "eficiência de carregamento".
"""

        # Call gemini_service
        resultado_texto = gerar_conteudo_gemini(prompt, api_key=payload.api_key, fallback_report=local_report)
        return {"resultado": resultado_texto}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar chamada de IA: {e}")

@router.get("/ia/contexto-semanal")
def get_ia_contexto_semanal(semana_base: str, db: Session = Depends(get_db)):
    try:
        # 1. Fetch days belonging to this week
        rows_dias = db.execute(
            text("SELECT DISTINCT dia_base FROM detalhe_md_historico WHERE semana_base = :semana;"),
            {"semana": semana_base}
        ).fetchall()
        dias = [row[0] for row in rows_dias if row[0]]
        
        if not dias:
            rows_dias = db.execute(
                text("SELECT DISTINCT dia_base FROM historico_torre WHERE semana_base = :semana;"),
                {"semana": semana_base}
            ).fetchall()
            dias = [row[0] for row in rows_dias if row[0]]
            
        if not dias:
            return {"contexto": f"Nenhum dia operacional encontrado para a semana: {semana_base}"}
            
        dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
        params = {f"d{i}": d for i, d in enumerate(dias)}
        
        # 2. Daily summary
        query_resumo = f"""
            SELECT dia_base, volume_total, volume_backlog, taxa_coleta, erros_lacre 
            FROM historico_torre 
            WHERE dia_base IN ({dias_placeholders}) 
            ORDER BY dia_base;
        """
        resumo_rows = db.execute(text(query_resumo), params).fetchall()
        
        # 3. Regional metrics
        query_regionais = f"""
            SELECT regional, SUM(total) as vol_tot, SUM(backlog) as vol_back
            FROM detalhe_md_historico
            WHERE dia_base IN ({dias_placeholders})
            GROUP BY regional;
        """
        reg_rows = db.execute(text(query_regionais), params).fetchall()
        
        # 4. Daily justifications
        query_justificativas = f"""
            SELECT dia_base, regional, justificativa
            FROM justificativas_diarias
            WHERE dia_base IN ({dias_placeholders})
            ORDER BY dia_base;
        """
        just_rows = db.execute(text(query_justificativas), params).fetchall()
        
        # 5. Permanent Alerts / Observações Fixas
        alerts_map = {}
        try:
            alerts_rows = db.execute(text("SELECT md, observacao FROM md_observacoes_fixas;")).fetchall()
            alerts_map = {row[0].strip().upper(): row[1] for row in alerts_rows if row[0]}
        except Exception:
            pass

        # 6. Top offending MDs with City
        query_ofensores = f"""
            SELECT h.md, h.regional, SUM(h.total) as vol_tot, SUM(h.backlog) as vol_back, MAX(c.cidade) as cidade
            FROM detalhe_md_historico h
            LEFT JOIN malha_coordenadas c ON h.md = c.md_codigo
            WHERE h.dia_base IN ({dias_placeholders}) AND h.backlog > 0
            GROUP BY h.md, h.regional
            ORDER BY vol_back DESC
            LIMIT 10;
        """
        ofensor_rows = db.execute(text(query_ofensores), params).fetchall()
        
        # Build context
        contexto = f"CONTEXTO OPERACIONAL COMPILADO PARA A {semana_base.upper()}:\n\n"
        
        contexto += "1. METRICAS DIARIAS DA SEMANA:\n"
        for row in resumo_rows:
            contexto += f"- Dia {row[0]}: Volume Total: {row[1]}, Backlog: {row[2]}, SLA de Coleta: {row[3]:.2f}%, Erros Lacre: {row[4]}\n"
            
        contexto += "\n2. DESEMPENHO POR REGIONAL/FILIAL:\n"
        for row in reg_rows:
            vol_tot = row[1] or 0
            vol_back = row[2] or 0
            sla = ((vol_tot - vol_back) / vol_tot * 100) if vol_tot > 0 else 100.0
            contexto += f"- Regional {row[0]}: Volume Total: {vol_tot}, Backlog: {vol_back}, SLA Medio: {sla:.2f}%\n"
            
        contexto += "\n3. JUSTIFICATIVAS REGISTRADAS NO PERIODO:\n"
        for row in just_rows:
            contexto += f"- Dia {row[0]} - Regional {row[1]}: \"{row[2]}\"\n"
            
        contexto += "\n4. TOP MDs OFENSORES COM MAIOR BACKLOG:\n"
        for row in ofensor_rows:
            md_code = row[0]
            vol_tot = row[2] or 0
            vol_back = row[3] or 0
            cidade = row[4] or "N/A"
            sla = ((vol_tot - vol_back) / vol_tot * 100) if vol_tot > 0 else 100.0
            alert_str = f" (Alerta: {alerts_map[md_code.strip().upper()]})" if md_code.strip().upper() in alerts_map else ""
            contexto += f"- MD {md_code} / {cidade} (Regional {row[1]}): Volume: {vol_tot}, Backlog: {vol_back}, SLA: {sla:.2f}%{alert_str}\n"

        return {"contexto": contexto}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao compilar contexto semanal: {e}")

@router.get("/ia/contexto-periodo")
def get_ia_contexto_periodo(
    periodo_tipo: str,
    rotulo: str,
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        from services.operacional import obter_dias_periodo
        
        # Get list of days matching this period
        dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
        if not dias:
            return {"contexto": f"Nenhum dia operacional encontrado para o filtro: {periodo_tipo} ({rotulo})"}
            
        dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
        params = {f"d{i}": d for i, d in enumerate(dias)}
        
        # 1. Daily summary
        query_resumo = f"""
            SELECT dia_base, volume_total, volume_backlog, taxa_coleta, erros_lacre 
            FROM historico_torre 
            WHERE dia_base IN ({dias_placeholders}) 
            ORDER BY dia_base;
        """
        resumo_rows = db.execute(text(query_resumo), params).fetchall()
        
        # 2. Regional metrics
        query_regionais = f"""
            SELECT regional, SUM(total) as vol_tot, SUM(backlog) as vol_back
            FROM detalhe_md_historico
            WHERE dia_base IN ({dias_placeholders})
            GROUP BY regional;
        """
        reg_rows = db.execute(text(query_regionais), params).fetchall()
        
        # 3. Daily justifications
        query_justificativas = f"""
            SELECT dia_base, regional, justificativa
            FROM justificativas_diarias
            WHERE dia_base IN ({dias_placeholders})
            ORDER BY dia_base;
        """
        just_rows = db.execute(text(query_justificativas), params).fetchall()
        
        # 4. Top offending MDs
        # 5. Permanent Alerts / Observações Fixas
        alerts_map = {}
        try:
            alerts_rows = db.execute(text("SELECT md, observacao FROM md_observacoes_fixas;")).fetchall()
            alerts_map = {row[0].strip().upper(): row[1] for row in alerts_rows if row[0]}
        except Exception:
            pass

        # 6. Top offending MDs with City
        query_ofensores = f"""
            SELECT h.md, h.regional, SUM(h.total) as vol_tot, SUM(h.backlog) as vol_back, MAX(c.cidade) as cidade
            FROM detalhe_md_historico h
            LEFT JOIN malha_coordenadas c ON h.md = c.md_codigo
            WHERE h.dia_base IN ({dias_placeholders}) AND h.backlog > 0
            GROUP BY h.md, h.regional
            ORDER BY vol_back DESC
            LIMIT 10;
        """
        ofensor_rows = db.execute(text(query_ofensores), params).fetchall()
        
        # Build context
        contexto = f"CONTEXTO OPERACIONAL COMPILADO PARA O PERIODO {periodo_tipo.upper()} ({rotulo.upper()}):\n\n"
        
        contexto += "1. METRICAS DIARIAS DO PERIODO:\n"
        for row in resumo_rows:
            contexto += f"- Dia {row[0]}: Volume Total: {row[1]}, Backlog: {row[2]}, SLA de Coleta: {row[3]:.2f}%, Erros Lacre: {row[4]}\n"
            
        contexto += "\n2. DESEMPENHO POR REGIONAL/FILIAL:\n"
        for row in reg_rows:
            vol_tot = row[1] or 0
            vol_back = row[2] or 0
            sla = ((vol_tot - vol_back) / vol_tot * 100) if vol_tot > 0 else 100.0
            contexto += f"- Regional {row[0]}: Volume Total: {vol_tot}, Backlog: {vol_back}, SLA Medio: {sla:.2f}%\n"
            
        contexto += "\n3. JUSTIFICATIVAS REGISTRADAS NO PERIODO:\n"
        for row in just_rows:
            contexto += f"- Dia {row[0]} - Regional {row[1]}: \"{row[2]}\"\n"
            
        contexto += "\n4. TOP MDs OFENSORES COM MAIOR BACKLOG:\n"
        for row in ofensor_rows:
            md_code = row[0]
            vol_tot = row[2] or 0
            vol_back = row[3] or 0
            cidade = row[4] or "N/A"
            sla = ((vol_tot - vol_back) / vol_tot * 100) if vol_tot > 0 else 100.0
            alert_str = f" (Alerta: {alerts_map[md_code.strip().upper()]})" if md_code.strip().upper() in alerts_map else ""
            contexto += f"- MD {md_code} / {cidade} (Regional {row[1]}): Volume: {vol_tot}, Backlog: {vol_back}, SLA: {sla:.2f}%{alert_str}\n"

        return {"contexto": contexto}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao compilar contexto de periodo: {e}")

@router.post("/ia/otimizar")
def post_ia_otimizar(payload: IAOtimizarRequest, db: Session = Depends(get_db)):
    try:
        from services.geolocalizacao import simular_otimizacao_malha
        from services.gemini_service import gerar_conteudo_gemini
        
        sim_res = simular_otimizacao_malha(
            db, 
            payload.md_origem, 
            raio_max_km=10.0,
            periodo_tipo=payload.periodo_tipo,
            rotulo=payload.rotulo
        )
        
        if sim_res.get("status") == "error":
            raise HTTPException(status_code=400, detail=sim_res.get("message"))
            
        origem = sim_res.get("origem")
        alternativas = sim_res.get("alternativas")
        
        candidates_text = ""
        for i, alt in enumerate(alternativas[:5]):
            candidates_text += f"{i+1}. MD {alt['md_codigo']}:\n"
            candidates_text += f"   - Distância: {alt['distancia_km']} km\n"
            candidates_text += f"   - Horário: {alt['horario_trabalho']} (Fecha às {alt['horario_fechamento']})\n"
            candidates_text += f"   - Volume do período: {alt['volume']} pacotes\n"
            candidates_text += f"   - Endereço: {alt['endereco']}\n\n"
            
        prompt = f"""Atue como Diretor de Operações Logísticas da ANJUN Logística.
Faça um cruzamento analítico para verificar se temos algum Ponto de Coleta (MD) viável para absorver a carga do MD {payload.md_origem}, que foi marcado para substituição na malha operacional.

DADOS DO MD ORIGEM (A SER SUBSTITUÍDO):
- Código: {origem['md_codigo']}
- Volume no Período: {origem['volume']} pacotes
- Backlog Pendente: {origem['backlog']} pacotes
- Horário: {origem['horario_trabalho']} (Fecha às {origem['horario_fechamento']})
- Cidade: {origem['cidade']} - {origem['estado']}
- Endereço: {origem['endereco']}
- Alerta Permanente Cadastrado: "{origem['observacao_fixa']}"

PONTOS ALTERNATIVOS PRÓXIMOS (CANDIDATOS A ABSORVER A CARGA):
{candidates_text if candidates_text else "Nenhum ponto regular encontrado num raio de 10km."}

INSTRUÇÕES DO RELATÓRIO:
1. Analise a viabilidade de transferência (proximidade geográfica e horário de funcionamento).
2. Indique qual(is) MD(s) é(são) o(s) melhor(es) candidato(s) para absorver o volume de {origem['volume']} pacotes.
3. Elabore um plano prático de redirecionamento de carga para a equipe de campo.
Use linguagem altamente natural, fluida e com toque humano executivo (indetectável por detectores automáticos de IA)."""

        relatorio = gerar_conteudo_gemini(prompt, api_key=payload.api_key)
        return {"status": "success", "relatorio": relatorio}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar otimização inteligente: {e}")

@router.get("/malha/pontos")
def get_malha_pontos(
    dia_base: Optional[str] = Query(None),
    periodo_tipo: Optional[str] = Query(None),
    rotulo: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        from services.geolocalizacao import obter_pontos_malha
        p_tipo = periodo_tipo or "Diário"
        p_rotulo = rotulo or dia_base
        return obter_pontos_malha(db, p_tipo, p_rotulo)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar pontos geográficos da malha: {e}")

@router.get("/malha/simular")
def get_malha_simular(
    md_origem: str,
    raio_max: Optional[float] = 5.0,
    periodo_tipo: Optional[str] = Query(None),
    rotulo: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        from services.geolocalizacao import simular_otimizacao_malha
        p_tipo = periodo_tipo or "Diário"
        p_rotulo = rotulo or "latest"
        return simular_otimizacao_malha(db, md_origem, raio_max, p_tipo, p_rotulo)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao rodar simulação de malha: {e}")

@router.get("/expansao/oportunidades")
def get_expansao_oportunidades(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    cidade: Optional[str] = Query(None),
    min_pedidos: int = Query(50),
    db: Session = Depends(get_db)
):
    try:
        return op_service.consultar_oportunidades_expansao(
            db=db,
            periodo_tipo=periodo_tipo,
            rotulo=rotulo,
            dt_inicio=dt_inicio,
            dt_fim=dt_fim,
            estado=estado,
            cidade=cidade,
            min_pedidos=min_pedidos
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar oportunidades de expansão: {e}")

@router.get("/expansao/resumo")
def get_expansao_resumo(
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        return op_service.consultar_resumo_criacao(
            db=db,
            periodo_tipo=periodo_tipo,
            rotulo=rotulo,
            dt_inicio=dt_inicio,
            dt_fim=dt_fim,
            cliente=cliente,
            estado=estado
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar resumo de criação/expansão: {e}")


# ─── Viabilidade por Cidade ────────────────────────────────────────────────────
@router.get("/expansao/viabilidade")
def get_expansao_viabilidade(
    cidade: str = Query(...),
    estado: str = Query(...),
    bairro: Optional[str] = Query(None),
    raio_km: float = Query(5.0),
    periodo_tipo: str = Query("Diário"),
    rotulo: str = Query("latest"),
    db: Session = Depends(get_db)
):
    try:
        return op_service.consultar_viabilidade_cidade(
            db=db, cidade=cidade, estado=estado, bairro=bairro,
            raio_km=raio_km, periodo_tipo=periodo_tipo, rotulo=rotulo
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao calcular viabilidade: {e}")


# ─── Crescimento Semana a Semana ──────────────────────────────────────────────
@router.get("/expansao/crescimento")
def get_expansao_crescimento(
    cidade: str = Query(...),
    estado: str = Query(...),
    bairro: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        return op_service.consultar_crescimento_polo(db=db, cidade=cidade, estado=estado, bairro=bairro)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao calcular crescimento: {e}")


# ─── CRUD Propostas de Expansão ───────────────────────────────────────────────
@router.get("/expansao/propostas")
def get_propostas(
    status: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    try:
        return op_service.listar_propostas(db, status=status, estado=estado)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar propostas: {e}")


@router.post("/expansao/propostas")
def post_proposta(payload: dict, db: Session = Depends(get_db)):
    try:
        return op_service.criar_proposta(db, payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar proposta: {e}")


@router.put("/expansao/propostas/{proposta_id}")
def put_proposta(proposta_id: int, payload: dict, db: Session = Depends(get_db)):
    try:
        return op_service.atualizar_proposta(db, proposta_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar proposta: {e}")


@router.delete("/expansao/propostas/{proposta_id}")
def delete_proposta(proposta_id: int, db: Session = Depends(get_db)):
    try:
        deletar_proposta(db, proposta_id)
        return {"message": "Proposta deletada"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/expansao/simulador")
def get_simulador_md(
    cep: str = Query(..., description="CEP do prospect"),
    raio_km: float = Query(5.0, description="Raio em KM para buscar MDs vizinhos e calcular viabilidade"),
    db: Session = Depends(get_db)
):
    try:
        return simular_viabilidade_md(db, cep, raio_km)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno: {e}")
