# -*- coding: utf-8 -*-
r"""
agendador_automatico.py — Agendador Autônomo 24/7 de Sincronizações Anjun
Fica rodando silenciosamente no computador:
  • De hora em hora (07h às 23h): Bipagens em Tempo Real + Criação de Novos Pedidos
  • Na madrugada (00h05): Fechamento Consolidado do Dia Anterior (D-1)
  • Toda Segunda-feira (02h00): Reconciliação dos últimos 14 dias (Circuito Fechado)
"""

import sys
import os
import time
import datetime
from pathlib import Path

# Ajustar PYTHONPATH
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.sincronizador_servico import (
    motor_tempo_real_hoje,
    motor_criacao_hoje,
    motor_fechamento_d1,
    motor_reconciliacao_semanal,
    carregar_config
)
from scripts.exportar_snapshot_online import gerar_snapshots, publicar_github

LOG_FILE = SCRIPT_DIR / "agendador.log"

def log(msg: str):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linha = f"[{timestamp}] {msg}"
    print(linha, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass


def executar_agendador():
    log("=========================================================================")
    log("       TORRE DE CONTROLE ANJUN — AGENDADOR AUTOMÁTICO 24/7 INICIADO      ")
    log("=========================================================================")
    
    ultimo_d1_executado = None
    ultimo_semanal_executado = None
    ultimo_horario_hora = -1
    ultimo_deploy_dia = None

    # Executar imediatamente uma rodada inicial de sincronização
    try:
        log("Disparando sincronização inicial de Tempo Real...")
        res_tr = motor_tempo_real_hoje(max_paginas=20)
        log(f"Tempo Real Inicial: {res_tr.get('total_processado', 0)} registros salvos.")
    except Exception as e:
        log(f"Aviso no Tempo Real Inicial: {e}")

    try:
        log("Disparando sincronização inicial de Criação...")
        res_cr = motor_criacao_hoje(max_paginas=20)
        log(f"Criação Inicial: {res_cr.get('total_processado', 0)} registros salvos.")
    except Exception as e:
        log(f"Aviso na Criação Inicial: {e}")

    log("Aguardando próximos ciclos automáticos...")

    while True:
        try:
            agora = datetime.datetime.now()
            hoje_str = agora.strftime("%Y-%m-%d")
            hora_atual = agora.hour
            minuto_atual = agora.minute
            dia_da_semana = agora.weekday() # 0 = Segunda-feira

            # -------------------------------------------------------------
            # 1. FECHAMENTO DO DIA ANTERIOR (D-1) — Roda entre 00:05 e 01:00
            # -------------------------------------------------------------
            if hora_atual == 0 and minuto_atual >= 5 and ultimo_d1_executado != hoje_str:
                log(">>> INICIANDO FECHAMENTO AUTOMÁTICO DO DIA ANTERIOR (D-1) <<<")
                try:
                    res = motor_fechamento_d1(max_paginas=500)
                    log(f"Fechamento D-1 Concluído! {res.get('total_processado', 0)} registros salvos.")
                    ultimo_d1_executado = hoje_str

                    # Publicação automática na Nuvem (Vercel) com os dados consolidados do D-1
                    log(">>> EXPORTANDO E PUBLICANDO SNAPSHOT OFICIAL NA NUVEM (VERCEL)... <<<")
                    gerar_snapshots(max_dias=30)
                    publicar_github()
                    log("Deploy Online Noturno Concluído com Sucesso!")
                except Exception as e:
                    log(f"[ERRO D-1 ou Deploy Online] {e}")

            # -------------------------------------------------------------
            # 1.1 DEPLOY DO FIM DO DIA (22h30) — Envia a posição noturna para a nuvem
            # -------------------------------------------------------------
            if hora_atual == 22 and minuto_atual >= 30 and ultimo_deploy_dia != hoje_str:
                log(">>> DEPLOY DO FIM DO DIA (22:30) — PUBLICANDO NA NUVEM (VERCEL)... <<<")
                try:
                    gerar_snapshots(max_dias=30)
                    publicar_github()
                    ultimo_deploy_dia = hoje_str
                    log("Deploy do Fim do Dia Concluído com Sucesso!")
                except Exception as ep:
                    log(f"[ERRO Deploy Fim do Dia] {ep}")

            # -------------------------------------------------------------
            # 2. RECONCILIAÇÃO SEMANAL — Toda Segunda-feira entre 02:00 e 03:00
            # -------------------------------------------------------------
            if dia_da_semana == 0 and hora_atual == 2 and ultimo_semanal_executado != hoje_str:
                log(">>> INICIANDO RECONCILIAÇÃO SEMANAL (CIRCUITO FECHADO) <<<")
                try:
                    res = motor_reconciliacao_semanal(dias_atras=14)
                    log(f"Reconciliação Semanal Concluída! {res.get('total_processado', 0)} registros atualizados.")
                    ultimo_semanal_executado = hoje_str
                except Exception as e:
                    log(f"[ERRO Reconciliação Semanal] {e}")

            # -------------------------------------------------------------
            # 3. HORÁRIO DIURNO / OPERACIONAL (07h às 23h) — De hora em hora
            # -------------------------------------------------------------
            if 7 <= hora_atual <= 23:
                if hora_atual != ultimo_horario_hora and minuto_atual >= 1:
                    log(f">>> CICLO HORÁRIO DAS {hora_atual:02d}:00 <<<")
                    
                    # Sincroniza Tempo Real (Bipagens físicas)
                    try:
                        res_tr = motor_tempo_real_hoje(max_paginas=150)
                        log(f"Tempo Real: {res_tr.get('total_processado', 0)}/{res_tr.get('total_disponivel', 0)} registros.")
                    except Exception as e:
                        log(f"[ERRO Hora a Hora - Tempo Real] {e}")

                    # Sincroniza Criação (Novos pedidos)
                    try:
                        res_cr = motor_criacao_hoje(max_paginas=150)
                        log(f"Criação: {res_cr.get('total_processado', 0)}/{res_cr.get('total_disponivel', 0)} registros.")
                    except Exception as e:
                        log(f"[ERRO Hora a Hora - Criação] {e}")

                    ultimo_horario_hora = hora_atual

            # Dormir 30 segundos antes de verificar novamente o relógio
            time.sleep(30)

        except KeyboardInterrupt:
            log("Agendador encerrado pelo usuário.")
            break
        except Exception as e:
            log(f"Exceção no loop do agendador: {e}")
            time.sleep(60)

if __name__ == "__main__":
    executar_agendador()
