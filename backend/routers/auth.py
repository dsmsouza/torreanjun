import os
import jwt
import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Auth"])
security = HTTPBearer()

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-1234")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

class LoginRequest(BaseModel):
    password: str

@router.post("/login")
def login(req: LoginRequest):
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Senha incorreta")
    
    # Generate token valid for 24 hours
    payload = {
        "role": "admin",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return {"token": token}

def get_current_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    # Login removido conforme solicitado: acesso sempre liberado como admin
    return {"role": "admin"}

