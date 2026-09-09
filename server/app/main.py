from fastapi import FastAPI

from app.routers import auth, sessions

app = FastAPI(title="StudyLog")
app.include_router(auth.router)
app.include_router(sessions.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
