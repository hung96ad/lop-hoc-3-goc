from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.db.session import engine
from app.db.base_class import Base
import app.tasks.ai_tasks  # Register background AI tasks
from app.api.v1.auth import router as auth_router
from app.api.v1.classes import router as classes_router
from app.api.v1.subjects import router as subjects_router
from app.api.v1.questions import router as questions_router
from app.api.v1.exams import router as exams_router
from app.api.v1.taking import router as taking_router
from app.api.v1.review import router as review_router


async def _run_schema_migrations(conn):
    """Apply create_all then patch any missing columns on existing tables."""
    await conn.run_sync(Base.metadata.create_all)

    # Patch: add guest learner phone field to existing user tables.
    dialect = conn.dialect.name
    if dialect == "postgresql":
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NOT NULL DEFAULT ''"
            )
        )
    elif dialect == "sqlite":
        result = await conn.execute(__import__("sqlalchemy").text("PRAGMA table_info(users)"))
        if "phone" not in {row[1] for row in result.fetchall()}:
            await conn.execute(
                __import__("sqlalchemy").text("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT ''")
            )

    # Patch: add subject_id / class_id to questions if they were created before
    # these columns existed in the model (create_all does not ALTER existing tables).
    dialect = conn.dialect.name
    if dialect == "postgresql":
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE questions "
                "ADD COLUMN IF NOT EXISTS subject_id VARCHAR(36) "
                "  REFERENCES subjects(id) ON DELETE SET NULL, "
                "ADD COLUMN IF NOT EXISTS class_id VARCHAR(36) "
                "  REFERENCES classes(id) ON DELETE SET NULL"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS ix_questions_subject_id ON questions(subject_id)"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "CREATE INDEX IF NOT EXISTS ix_questions_class_id ON questions(class_id)"
            )
        )
    elif dialect == "sqlite":
        # SQLite does not support ADD COLUMN IF NOT EXISTS; check first
        result = await conn.execute(
            __import__("sqlalchemy").text("PRAGMA table_info(questions)")
        )
        existing = {row[1] for row in result.fetchall()}
        if "subject_id" not in existing:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN subject_id VARCHAR(36) "
                    "REFERENCES subjects(id) ON DELETE SET NULL"
                )
            )
        if "class_id" not in existing:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN class_id VARCHAR(36) "
                    "REFERENCES classes(id) ON DELETE SET NULL"
                )
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await _run_schema_migrations(conn)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

# CORS Middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Ensure unhandled 500 errors still carry CORS headers so the browser
    reports the real error instead of a misleading CORS failure."""
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in settings.BACKEND_CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )

# Include Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(classes_router, prefix=settings.API_V1_STR)
app.include_router(subjects_router, prefix=settings.API_V1_STR)
app.include_router(questions_router, prefix=settings.API_V1_STR)
app.include_router(exams_router, prefix=settings.API_V1_STR)
app.include_router(taking_router, prefix=settings.API_V1_STR)
app.include_router(review_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "project": settings.PROJECT_NAME,
        "database": "connected"
    }


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "docs": f"{settings.API_V1_STR}/docs"
    }
