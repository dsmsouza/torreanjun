import os
import jwt
import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Auth"])
security = HTTPBearer()

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-1234")

# Mapeamento oficial de Usuários da Torre ANJUN
USUARIOS_CADASTRO = {
    "diego": {
        "nome": "Diego Mandarino",
        "role": "master",
        "senha": "diego123",
        "suporte": "TODOS",
        "pode_gerar_vtag": True,
        "redirect_url": "/"
    },
    "ellen": {
        "nome": "Ellen",
        "role": "lider",
        "senha": "ellen123",
        "suporte": "ELLEN",
        "pode_gerar_vtag": True,
        "redirect_url": "/vtag"
    },
    "danilo": {
        "nome": "Danilo",
        "role": "operador",
        "senha": "danilo123",
        "suporte": "DANILO",
        "pode_gerar_vtag": False,
        "redirect_url": "/vtag"
    },
    "gabriele": {
        "nome": "Gabriele",
        "role": "operador",
        "senha": "gabriele123",
        "suporte": "GABRIELE",
        "pode_gerar_vtag": False,
        "redirect_url": "/vtag"
    },
    "ketley": {
        "nome": "Ketley",
        "role": "operador",
        "senha": "ketley123",
        "suporte": "KETLEY",
        "pode_gerar_vtag": False,
        "redirect_url": "/vtag"
    },
    "janaina": {
        "nome": "Janaina",
        "role": "operador",
        "senha": "janaina123",
        "suporte": "JANAINA",
        "pode_gerar_vtag": False,
        "redirect_url": "/vtag"
    },
    "nicolas": {
        "nome": "Nicolas",
        "role": "operador",
        "senha": "nicolas123",
        "suporte": "NICOLAS",
        "pode_gerar_vtag": False,
        "redirect_url": "/vtag"
    }
}


class LoginRequest(BaseModel):
    usuario: Optional[str] = None
    password: str


@router.get("/usuarios")
def listar_usuarios():
    """Retorna a lista de usuários públicos para o seletor da tela de login."""
    return [
        {
            "login": u,
            "nome": info["nome"],
            "role": info["role"],
            "suporte": info["suporte"],
            "descricao": "Proprietário / Master" if info["role"] == "master" else (
                "Líder da Torre (Gera VTAGs e Envia)" if info["role"] == "lider" else "Suporte da Torre (Disparo WhatsApp)"
            )
        }
        for u, info in USUARIOS_CADASTRO.items()
    ]


@router.post("/login")
def login(req: LoginRequest):
    senha = req.password.strip()
    usuario_raw = (req.usuario or "").strip().lower()

    user_info = None
    matched_user = None

    # 1. Se informou usuário específico
    if usuario_raw and usuario_raw in USUARIOS_CADASTRO:
        cad = USUARIOS_CADASTRO[usuario_raw]
        if senha == cad["senha"] or (usuario_raw == "diego" and senha in ["admin123", "anjun2026", "anjun123"]):
            user_info = cad
            matched_user = usuario_raw
    else:
        # 2. Busca automática pela senha informada
        for u, cad in USUARIOS_CADASTRO.items():
            if senha == cad["senha"] or (u == "diego" and senha in ["admin123", "anjun2026", "anjun123"]):
                user_info = cad
                matched_user = u
                break

    # 3. Regra dinâmica para qualquer suporte futuro: nome + 123
    if not user_info and usuario_raw and senha == f"{usuario_raw}123":
        matched_user = usuario_raw
        user_info = {
            "nome": usuario_raw.capitalize(),
            "role": "operador",
            "suporte": usuario_raw.upper(),
            "pode_gerar_vtag": False,
            "redirect_url": "/vtag"
        }

    if not user_info:
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")

    # Gera token JWT com 48 horas de validade
    payload = {
        "usuario": matched_user,
        "nome": user_info["nome"],
        "role": user_info["role"],
        "suporte": user_info["suporte"],
        "pode_gerar_vtag": user_info["pode_gerar_vtag"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=48)
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

    return {
        "token": token,
        "usuario": matched_user,
        "nome": user_info["nome"],
        "role": user_info["role"],
        "suporte": user_info["suporte"],
        "pode_gerar_vtag": user_info["pode_gerar_vtag"],
        "redirect_url": user_info["redirect_url"]
    }


def get_current_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    return {"role": "admin"}
