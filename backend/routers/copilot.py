import time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database.connection import SessionLocal

from services.gemini_service import (
    gerar_query_sql_robusto,
    validar_e_executar_sql,
    sintetizar_resposta_com_dados,
    obter_configuracao_ai
)

router = APIRouter(prefix="/api/ia", tags=["Copilot IA"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class ConsultaIAPayload(BaseModel):
    pergunta: str
    api_key: Optional[str] = None

@router.get("/status")
def get_ia_status():
    """Retorna o status de conexão da IA e provedor configurado."""
    cfg = obter_configuracao_ai()
    has_key = bool(cfg.get("gemini_api_key") or cfg.get("openrouter_api_key") or cfg.get("deepseek_api_key"))
    return {
        "status": "online" if has_key else "sem_chave",
        "provider": cfg.get("provider", "gemini"),
        "configurado": has_key,
        "modelo": cfg.get("openrouter_model") if cfg.get("provider") == "openrouter" else "gemini-2.5-flash"
    }

@router.get("/perguntas-sugeridas")
def get_perguntas_sugeridas():
    """Lista de perguntas operacionais de alto valor pré-configuradas."""
    return [
        {
            "id": "top_mds",
            "categoria": "Bipagem & Performance",
            "titulo": "Top 10 MDs com Mais Volume Bipado",
            "pergunta": "Quais são os 10 MDs com maior volume de pacotes bipados e qual a taxa de coleta de cada um?",
            "icone": "📦"
        },
        {
            "id": "saturacao_backlog",
            "categoria": "Gargalos & Saturação",
            "titulo": "MDs Saturados ou com Alto Backlog",
            "pergunta": "Quais MDs estão com maior volume de backlog acumulado ou com taxa de coleta abaixo de 90%?",
            "icone": "⚠️"
        },
        {
            "id": "expansao_polos",
            "categoria": "Expansão da Rede",
            "titulo": "Cidades com Maior Volume de Sellers",
            "pergunta": "Quais são as cidades e bairros com maior concentração de sellers e volume de pedidos criados?",
            "icone": "🚀"
        },
        {
            "id": "sellers_crescimento",
            "categoria": "Sellers em Destaque",
            "titulo": "Sellers com Maior Volume Acumulado",
            "pergunta": "Quais são os 15 sellers com maior volume acumulado de pedidos e em quais municípios operam?",
            "icone": "📈"
        },
        {
            "id": "distribuicao_clientes",
            "categoria": "Embarcadores",
            "titulo": "Volume e Backlog por Cliente / Marketplace",
            "pergunta": "Qual é a distribuição do volume total de pacotes e backlog entre os clientes (Shein, TikTok, etc.)?",
            "icone": "📊"
        },
        {
            "id": "rede_pontos",
            "categoria": "Malha ANJUN",
            "titulo": "Total de HUBs, Galpões e MDs por Estado",
            "pergunta": "Quantos pontos ativos temos cadastrados por tipo de ponto (HUB, MD, Galpão) e por estado na malha?",
            "icone": "📍"
        }
    ]

@router.post("/consultar")
def consultar_copilot_banco(payload: ConsultaIAPayload):
    """
    Recebe pergunta em linguagem natural, gera consulta SQL segura (SELECT),
    executa no banco SQLite e sintetiza resposta com zero alucinação.
    """
    pergunta = payload.pergunta.strip()
    if not pergunta:
        raise HTTPException(status_code=400, detail="A pergunta não pode estar vazia.")

    # 1. Gerar a query SQL a partir da pergunta do usuário
    sql_query, erro_sql = gerar_query_sql_robusto(pergunta, api_key=payload.api_key)
    if erro_sql or not sql_query:
        # Se for dúvida geral ou se não encontrou chave
        return {
            "sucesso": False,
            "pergunta": pergunta,
            "resposta": erro_sql or "Não foi possível traduzir a pergunta para uma consulta SQLite válida.",
            "sql_executada": None,
            "colunas": [],
            "total_registros": 0,
            "tempo_ms": 0,
            "dados_amostra": [],
            "erro": erro_sql
        }

    # 2. Validar segurança e executar a query contra o banco SQLite real
    dados, colunas, tempo_ms, erro_execucao = validar_e_executar_sql(sql_query)
    if erro_execucao:
        return {
            "sucesso": False,
            "pergunta": pergunta,
            "resposta": f"**Falha ao executar a consulta no banco de dados:**\n\n```sql\n{sql_query}\n```\n\n> *Detalhe do erro:* {erro_execucao}",
            "sql_executada": sql_query,
            "colunas": [],
            "total_registros": 0,
            "tempo_ms": tempo_ms,
            "dados_amostra": [],
            "erro": erro_execucao
        }

    # 3. Sintetizar resposta executiva com os dados reais (Zero Alucinação)
    resposta_sintetizada = sintetizar_resposta_com_dados(
        pergunta=pergunta,
        sql_executada=sql_query,
        colunas=colunas,
        dados=dados,
        tempo_ms=tempo_ms,
        api_key=payload.api_key
    )

    return {
        "sucesso": True,
        "pergunta": pergunta,
        "resposta": resposta_sintetizada,
        "sql_executada": sql_query,
        "colunas": colunas,
        "total_registros": len(dados),
        "tempo_ms": tempo_ms,
        "dados_amostra": dados[:10],
        "erro": None
    }
