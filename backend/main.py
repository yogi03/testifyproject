import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from api import auth, upload, test_generation, evaluation, analytics, deletion

app = FastAPI(title="TESTIFY Backend API")
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
allowed_origins = [origin.strip() for origin in cors_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(test_generation.router)
app.include_router(evaluation.router)
app.include_router(analytics.router)
app.include_router(deletion.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to TESTIFY API"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port)
