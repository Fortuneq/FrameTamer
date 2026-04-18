"""
MyDescript Backend – FastAPI application entry point.

Architecture:
    main.py  →  routers/*  →  services/*  →  utils/*
                             models/*

Startup:
    python run.py
    OR
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import ai, editor, export, media, projects, transcription

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.ensure_dirs()
    logger.info("MyDescript backend starting on http://%s:%d", settings.host, settings.port)
    logger.info("Projects directory: %s", settings.projects_dir)
    yield
    # Shutdown
    logger.info("MyDescript backend shutting down")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MyDescript API",
    description="Backend for the MyDescript local video editor",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(projects.router)
app.include_router(transcription.router)
app.include_router(editor.router)
app.include_router(export.router)
app.include_router(media.router)
app.include_router(ai.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
async def health() -> dict:
    return {"status": "ok", "version": app.version}


@app.get("/", tags=["system"])
async def root() -> dict:
    return {
        "name": app.title,
        "version": app.version,
        "docs": "/docs",
    }
