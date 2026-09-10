from fastapi import FastAPI

from app.routers import auth, challenges, feed, groups, photos, sessions, users, webhooks

app = FastAPI(title="StudyLog")
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(photos.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(feed.router)
app.include_router(challenges.router)
app.include_router(webhooks.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
