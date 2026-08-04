"""WSGI entry point for Azure App Service.
Catches startup errors and returns a diagnostic page instead of crashing."""
import traceback

try:
    from app.main import app
except Exception as e:
    # If the app fails to import, create a minimal diagnostic app
    from fastapi import FastAPI
    from fastapi.responses import PlainTextResponse

    app = FastAPI()
    error_msg = f"APP STARTUP FAILED:\n\n{traceback.format_exc()}"
    print(error_msg)

    @app.get("/{path:path}")
    async def error_handler(path: str):
        return PlainTextResponse(error_msg, status_code=500)
