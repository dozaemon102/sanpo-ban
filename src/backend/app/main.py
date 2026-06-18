from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import router

APP_VERSION = "3.0.1"

app = FastAPI(title="Kenko-kanri API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


class CacheControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path in ("/", "/manifest.json") or path.endswith(".html"):
            for key, value in NO_STORE_HEADERS.items():
                response.headers[key] = value
        elif path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


app.add_middleware(CacheControlMiddleware)

frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
assets_dir = frontend_dist / "assets"


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "VALIDATION_ERROR", "message": str(exc.errors())}},
    )


def _dist_file(name: str) -> Path:
    path = (frontend_dist / name).resolve()
    path.relative_to(frontend_dist.resolve())
    return path


if assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/")
async def serve_index() -> FileResponse:
    index = frontend_dist / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="Frontend build not found. Run: cd src/frontend && npm run build")
    return FileResponse(index, headers=NO_STORE_HEADERS)


@app.get("/manifest.json")
async def serve_manifest() -> FileResponse:
    manifest = frontend_dist / "manifest.json"
    if not manifest.is_file():
        raise HTTPException(status_code=404, detail="manifest.json not found")
    return FileResponse(manifest, headers=NO_STORE_HEADERS)
