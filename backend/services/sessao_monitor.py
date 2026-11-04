# -*- coding: utf-8 -*-
r"""
sessao_monitor.py — Monitor e Notificador de Validade da Sessão Anjun
Lê o JWT da sessão do portal manage.anjunexpress.com, calcula o tempo restante
e dispara alertas automáticos no Telegram e no Dashboard quando expirar ou faltar pouco.
"""

import os
import sys
import json
import base64
import datetime
import requests
from pathlib import Path
from typing import Dict, Any, Optional

BASE_DIR = Path(r"C:\ANJUN")
BACKEND_DIR = BASE_DIR / "backend"
CONFIG_PATH = BACKEND_DIR / "services" / "anjun_api_config.json"
AUTH_FILE = BACKEND_DIR / "telegram_bot" / "authorized_users.json"
BOT_TOKEN = "8750536814:AAGcPi936yeuAzR-UU7JIeu6LJn6eQhwagk"

# Adicionar snapshot online se existir
SNAPSHOT_DIR = BASE_DIR / "frontend" / "public" / "snapshot"


def decodificar_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodifica o payload do JWT sem depender de chave secreta."""
    if not token or "." not in token:
        return None
    try:
        partes = token.split(".")
        if len(partes) < 2:
            return None
        payload = partes[1]
        payload += "=" * (-len(payload) % 4)
        dados = json.loads(base64.b64decode(payload).decode("utf-8"))
        return dados
    except Exception:
        return None


def obter_status_token() -> Dict[str, Any]:
    """Calcula a validade exata da sessão Anjun configurada."""
    cfg = {}
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            pass

    token = cfg.get("token", "")
    payload = decodificar_token(token)

    if not payload:
        return {
            "valido": False,
            "status": "INVALIDO",
            "mensagem": "Nenhum token JWT configurado ou formato incorreto.",
            "usuario": "Desconhecido",
            "horas_restantes": 0,
            "dias_restantes": 0,
            "expirado": True,
            "expira_em_str": "Indefinido"
        }

    exp_timestamp = payload.get("exp")
    usuario = payload.get("username", "mandarino")
    nome_real = payload.get("realName", "Diego de Souza Mandarino")

    if not exp_timestamp:
        return {
            "valido": True,
            "status": "SEM_EXPIRACAO",
            "mensagem": "Token sem data de expiração explícita.",
            "usuario": usuario,
            "nome_real": nome_real,
            "horas_restantes": 9999,
            "dias_restantes": 999,
            "expirado": False,
            "expira_em_str": "Indeterminado"
        }

    dt_exp = datetime.datetime.fromtimestamp(exp_timestamp)
    agora = datetime.datetime.now()
    segundos_restantes = (dt_exp - agora).total_seconds()
    horas_restantes = round(segundos_restantes / 3600, 1)
    dias_restantes = round(horas_restantes / 24, 1)

    expirado = segundos_restantes <= 0
    alerta_urgente = 0 < horas_restantes <= 12
    alerta_moderado = 12 < horas_restantes <= 24

    if expirado:
        status = "EXPIRADO"
        mensagem = f"A sessão Anjun de {usuario} expirou em {dt_exp.strftime('%d/%m/%Y às %H:%M')}."
    elif alerta_urgente:
        status = "EXPIRANDO_URGENTE"
        mensagem = f"Atenção: A sessão Anjun expira em apenas {horas_restantes} horas ({dt_exp.strftime('%d/%m às %H:%M')})."
    elif alerta_moderado:
        status = "EXPIRANDO_HOJE"
        mensagem = f"Aviso: A sessão Anjun expira nas próximas 24h ({dt_exp.strftime('%d/%m às %H:%M')})."
    else:
        status = "ATIVO"
        mensagem = f"Sessão conectada. Válida por mais {dias_restantes} dias (até {dt_exp.strftime('%d/%m/%Y %H:%M')})."

    return {
        "valido": True,
        "status": status,
        "usuario": usuario,
        "nome_real": nome_real,
        "data_expiracao_iso": dt_exp.isoformat(),
        "expira_em_str": dt_exp.strftime("%d/%m/%Y %H:%M"),
        "horas_restantes": horas_restantes,
        "dias_restantes": dias_restantes,
        "expirado": expirado,
        "alerta_expiracao": (alerta_urgente or alerta_moderado or expirado),
        "mensagem": mensagem,
        "atualizado_em": agora.strftime("%d/%m/%Y %H:%M:%S")
    }


def exportar_status_sessao_snapshot():
    """Grava o status da sessão na pasta de snapshot do frontend para ser visível na nuvem."""
    dados = obter_status_token()
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    caminho = SNAPSHOT_DIR / "sessao_status.json"
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    return dados


def enviar_alerta_telegram(mensagem: str) -> bool:
    """Envia mensagem direta pelo bot da Torre Anjun para os administradores cadastrados."""
    if not AUTH_FILE.exists():
        return False
    try:
        with open(AUTH_FILE, "r", encoding="utf-8") as f:
            usuarios = json.load(f)
        if not usuarios:
            return False

        sucesso = False
        for user_id in usuarios:
            url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": user_id,
                "text": mensagem,
                "parse_mode": "Markdown"
            }
            res = requests.post(url, json=payload, timeout=8)
            if res.status_code == 200:
                sucesso = True
        return sucesso
    except Exception as e:
        print(f"Erro ao enviar alerta no Telegram: {e}")
        return False


def checar_e_notificar_se_necessario() -> Dict[str, Any]:
    """Função invocada ciclicamente pelo agendador automático."""
    status = obter_status_token()
    exportar_status_sessao_snapshot()

    # Se estiver expirado ou a menos de 6 horas do fim, dispara aviso
    if status.get("expirado") or (0 < status.get("horas_restantes", 999) <= 6):
        texto = (
            f"🚨 *ALERTA OPERACIONAL — TORRE ANJUN*\n\n"
            f"A sessão de acesso da conta *{status.get('usuario')}* no portal Anjun expirou ou está prestes a expirar!\n\n"
            f"📅 *Expiração:* `{status.get('expira_em_str')}`\n"
            f"⏳ *Tempo restante:* `{status.get('horas_restantes')} horas`\n\n"
            f"⚠️ *Impacto:* O sincronizador automático de hora em hora não conseguirá coletar novos pedidos sem a renovação da sessão.\n\n"
            f"👉 *Como renovar:* Faça login em https://manage.anjunexpress.com, copie o novo token do navegador e atualize no Dashboard da Torre."
        )
        enviar_alerta_telegram(texto)

    return status


if __name__ == "__main__":
    st = obter_status_token()
    print("Status da Sessão Anjun:")
    print(json.dumps(st, indent=2, ensure_ascii=False))
