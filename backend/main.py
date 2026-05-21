from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import analytics, athletes, auth, groups, markers, metrics, templates, telemetry, users, workouts

app = FastAPI(
    title="СППР — Система поддержки принятия решений",
    description="Планирование подготовки в циклических видах спорта",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(athletes.router, prefix="/api/v1/athletes", tags=["athletes"])
app.include_router(markers.router, prefix="/api/v1/markers", tags=["markers"])
app.include_router(groups.router, prefix="/api/v1/groups", tags=["groups"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"])
app.include_router(workouts.router, prefix="/api/v1/workouts", tags=["workouts"])
app.include_router(telemetry.router, prefix="/api/v1", tags=["telemetry"])
app.include_router(metrics.router, prefix="/api/v1/metrics", tags=["metrics"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])


@app.get("/health")
async def health():
    return {"status": "ok"}
