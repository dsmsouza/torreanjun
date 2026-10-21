import time
import gzip
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from routers.operacional import router as operacional_router
from routers.config import router as config_router
from routers.sla import router as sla_router
from routers.evolucao import router as evolucao_router

app = FastAPI(
    title="Torre de Controle ANJUN API",
    description="Backend API de dados operacionais e históricos da primeira milha ANJUN.",
    version="1.0.0"
)

from database.connection import engine
from models.models import Base
Base.metadata.create_all(bind=engine)


# ─── In-Memory Response Cache (Thread-Safe with Capacity Limit) ───────────────
import threading

_response_cache: dict[str, tuple[bytes, float, str]] = {}  # key → (body, timestamp, content_type)
_cache_lock = threading.Lock()
MAX_CACHE_ITEMS = 500
CACHE_TTL = 300.0  # seconds

CACHE_SKIP_PREFIXES = [
    "/api/config/",   # imports/restore
    "/api/ia/",       # AI calls
    "/api/justificativas",  # mutations
    "/api/penalidades",
    "/api/observacoes-fixas",
    "/api/mds/avaliar",
    "/api/mds/salvar-formulario",
    "/api/implantacao",
    "/api/coletas/",
]

class ResponseCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only cache GET requests
        if request.method != "GET":
            # Invalidate cache on mutations thread-safely
            with _cache_lock:
                _response_cache.clear()
            return await call_next(request)

        path_qs = request.url.path + ("?" + str(request.url.query) if request.url.query else "")

        # Skip caching for specific routes
        skip = any(path_qs.startswith(prefix) for prefix in CACHE_SKIP_PREFIXES)
        if skip:
            return await call_next(request)

        now = time.monotonic()

        # Check cache hit with thread lock
        with _cache_lock:
            cached = _response_cache.get(path_qs)
            if cached:
                body, ts, content_type = cached
                if (now - ts) < CACHE_TTL:
                    return Response(
                        content=body,
                        media_type=content_type,
                        headers={"X-Cache": "HIT", "X-Cache-TTL": str(int(CACHE_TTL - (now - ts)))}
                    )

        # Cache miss — call backend
        response = await call_next(request)

        # Only cache 200 OK JSON responses
        if response.status_code == 200:
            body_bytes = b""
            async for chunk in response.body_iterator:
                body_bytes += chunk
            content_type = response.headers.get("content-type", "application/json")
            
            with _cache_lock:
                # Evict oldest if cache limit reached
                if len(_response_cache) >= MAX_CACHE_ITEMS:
                    oldest_key = min(_response_cache.keys(), key=lambda k: _response_cache[k][1], default=None)
                    if oldest_key:
                        _response_cache.pop(oldest_key, None)
                _response_cache[path_qs] = (body_bytes, now, content_type)
                
            return Response(
                content=body_bytes,
                status_code=200,
                media_type=content_type,
                headers=dict(response.headers) | {"X-Cache": "MISS"}
            )

        return response

app.add_middleware(ResponseCacheMiddleware)
# ──────────────────────────────────────────────────────────────────────────────

# Gzip compression for payloads >= 500 bytes (massively accelerates large JSON data transfers)
app.add_middleware(GZipMiddleware, minimum_size=500)

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
from routers.rangerover import router as rangerover_router
from routers.mapa import router as mapa_router
from routers.planejamento import router as planejamento_router

app.include_router(rangerover_router)
app.include_router(mapa_router)
app.include_router(planejamento_router)
app.include_router(sla_router, prefix="/api/sla", tags=["sla"])
app.include_router(evolucao_router, prefix="/api/evolucao", tags=["evolucao"])

from routers.md_dashboard import router as md_dashboard_router
app.include_router(md_dashboard_router)

from routers.backlog import router as backlog_router
app.include_router(backlog_router)

from routers.pickup_radar import router as pickup_radar_router
app.include_router(pickup_radar_router)

from routers.dropoff_radar import router as dropoff_radar_router
app.include_router(dropoff_radar_router)

from routers.pedidos_criados import router as pedidos_criados_router
app.include_router(pedidos_criados_router)

from routers.rotas import router as rotas_router
app.include_router(rotas_router)

from routers.implantacao import router as implantacao_router
app.include_router(implantacao_router)

from routers.coletas import router as coletas_router
app.include_router(coletas_router)

from routers.copilot import router as copilot_router
app.include_router(copilot_router)



@app.get("/")
async def root():
    return {
        "status": "success", 
        "message": "Torre de Controle ANJUN API is running",
        "docs_url": "/docs"
    }
