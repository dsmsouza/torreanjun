# -*- coding: utf-8 -*-
r"""
routers/sincronizacao.py — Router da API FastAPI para Controle e Disparo dos Motores de Sincronização Anjun
Alimenta os botões do Dashboard e fornece o status das últimas execuções e os totais oficiais diários.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from typing import Dict, Any, Optional, List
import sqlite3
import datetime
from pathlib import Path

from services.sincronizador_servico import (
    motor_tempo_real_hoje,
    motor_criacao_hoje,
    motor_fechamento_d1,
    motor_reconciliacao_semanal,
    carregar_config,
    salvar_config,
    sincronizar_backlog_snapshot,
    DB_PATH
)

router = APIRouter(
    prefix="/api/sincronizacao",
    tags=["Sincronização Anjun Express"]
)


@router.get("/status")
def get_status_sincronizacao():
    """Retorna os horários e totais da última execução de cada um dos 4 motores."""
    cfg = carregar_config()
    
    backlog_recente = None
    fechamentos_oficiais = []
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        cursor = conn.cursor()
        
        # Último snapshot de backlog
        cursor.execute("""
            SELECT horario_captura, dia_base, total_coletas, total_carregado, taxa_carregamento, total_pendente, taxa_pendente
            FROM snapshot_backlog_md
            ORDER BY id DESC LIMIT 1;
        """)
        row = cursor.fetchone()
        if row:
            backlog_recente = {
                "horario": row[0],
                "dia_base": row[1],
                "total_coletas": row[2],
                "total_carregado": row[3],
                "taxa_carregamento": row[4],
                "total_pendente": row[5],
                "taxa_pendente": row[6]
            }

        # Últimos fechamentos oficiais
        cursor.execute("""
            SELECT data_operacao, total_coletas_scan, total_criacao, total_carregado, total_pendente, taxa_carregamento, taxa_pendente, horario_fechamento
            FROM fechamento_diario_oficial
            ORDER BY data_operacao DESC LIMIT 15;
        """)
        for r in cursor.fetchall():
            fechamentos_oficiais.append({
                "data": r[0],
                "total_scan": r[1],
                "total_criacao": r[2],
                "carregado": r[3],
                "pendente": r[4],
                "taxa_carregamento": r[5],
                "taxa_pendente": r[6],
                "horario_fechamento": r[7]
            })

        conn.close()
    except Exception:
        pass

    return {
        "motores": cfg.get("status_sync", {}),
        "backlog_recente": backlog_recente,
        "fechamentos_oficiais": fechamentos_oficiais,
        "horario_consulta": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


@router.get("/historico-oficial")
def get_historico_oficial(dias: int = Query(30)):
    """Retorna a série histórica de fechamentos oficiais com números reais da Anjun."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT data_operacao, total_coletas_scan, total_criacao, total_carregado, total_pendente, taxa_carregamento, taxa_pendente, horario_fechamento
        FROM fechamento_diario_oficial
        ORDER BY data_operacao DESC LIMIT ?;
    """, (dias,))
    itens = []
    for r in cursor.fetchall():
        itens.append({
            "data": r[0],
            "total_coletas_real": r[1],
            "total_pedidos_criados": r[2],
            "total_carregado": r[3],
            "total_pendente": r[4],
            "taxa_carregamento_pct": r[5],
            "taxa_pendente_pct": r[6],
            "fechado_em": r[7]
        })
    conn.close()
    return {"total": len(itens), "historico": itens}


@router.post("/tempo-real")
def disparar_tempo_real(max_paginas: int = 50):
    """
    Dispara a sincronização de HOJE no modo TEMPO REAL PARA COLETA.
    Atualiza o total oficial exato e a amostra de pacotes.
    """
    try:
        resultado = motor_tempo_real_hoje(max_paginas=max_paginas)
        return {"sucesso": True, "mensagem": "Sincronização em tempo real concluída!", "detalhes": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar tempo real: {e}")


@router.post("/criacao")
def disparar_criacao(max_paginas: int = 50):
    """
    Dispara a sincronização de HOJE no modo TEMPO DE CRIAÇÃO.
    """
    try:
        resultado = motor_criacao_hoje(max_paginas=max_paginas)
        return {"sucesso": True, "mensagem": "Sincronização de pedidos criados concluída!", "detalhes": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar criação: {e}")


@router.post("/dia-anterior")
def disparar_dia_anterior(max_paginas: int = 50):
    """
    Dispara o fechamento oficial do DIA ANTERIOR (D-1).
    Grava o número oficial de 100% dos pedidos da Anjun e a amostra detalhada.
    """
    try:
        resultado = motor_fechamento_d1(max_paginas=max_paginas)
        return {"sucesso": True, "mensagem": "Fechamento D-1 oficial concluído!", "detalhes": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar dia anterior: {e}")


@router.post("/reconciliacao-semanal")
def disparar_reconciliacao_semanal(dias_atras: int = 14):
    """
    Dispara a varredura em blocos de 7 dias para atualizar status que evoluíram para Circuito Fechado.
    """
    try:
        resultado = motor_reconciliacao_semanal(dias_atras=dias_atras)
        return {"sucesso": True, "mensagem": "Reconciliação histórica concluída!", "detalhes": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na reconciliação semanal: {e}")


@router.post("/publicar-online")
def disparar_publicacao_online(background_tasks: BackgroundTasks):
    """
    Exporta os snapshots estáticos e envia ao GitHub / Vercel para atualizar o Dashboard Online.
    """
    from scripts.exportar_snapshot_online import gerar_snapshots, publicar_github
    
    def tarefa_publicar():
        try:
            gerar_snapshots(max_dias=30)
            publicar_github()
        except Exception as e:
            print(f"[ERRO PUBLICAR ONLINE] {e}")

    background_tasks.add_task(tarefa_publicar)
    return {"sucesso": True, "mensagem": "Publicação online (Vercel) iniciada em segundo plano!"}

