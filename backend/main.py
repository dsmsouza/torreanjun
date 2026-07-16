from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.operacional import router as operacional_router
from routers.config import router as config_router
from routers.sla import router as sla_router
from routers.map import router as map_router
from routers.misscan import router as misscan_router
from routers.evolucao import router as evolucao_router

app = FastAPI(
    title="Torre de Controle ANJUN API",
    description="Backend API de dados operacionais e históricos da primeira milha ANJUN.",
    version="1.0.0"
)

# Configure CORS to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers.auth import router as auth_router

# Register routers
app.include_router(auth_router)
app.include_router(operacional_router)
app.include_router(config_router)
app.include_router(sla_router, prefix="/api/sla", tags=["sla"])
app.include_router(map_router, prefix="/api/map", tags=["map"])
app.include_router(misscan_router, prefix="/api/misscan", tags=["misscan"])
app.include_router(evolucao_router, prefix="/api/evolucao", tags=["evolucao"])

@app.get("/")
async def root():
    return {
        "status": "success", 
        "message": "Torre de Controle ANJUN API is running",
        "docs_url": "/docs"
    }
