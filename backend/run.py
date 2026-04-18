"""
Entry point for the MyDescript backend server.

Usage:
    python run.py
    python run.py --host 0.0.0.0 --port 8000 --reload
"""
import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="MyDescript backend server")
    parser.add_argument("--host", default=None, help="Host to bind (default from config)")
    parser.add_argument("--port", type=int, default=None, help="Port to listen on (default from config)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (development mode)")
    parser.add_argument("--workers", type=int, default=1, help="Number of worker processes")
    args = parser.parse_args()

    try:
        import uvicorn
    except ImportError:
        print("uvicorn is not installed. Run: pip install uvicorn[standard]", file=sys.stderr)
        sys.exit(1)

    # Import settings after package is on sys.path
    from app.config import settings

    host = args.host or settings.host
    port = args.port or settings.port

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=args.reload or settings.debug,
        workers=1 if (args.reload or settings.debug) else args.workers,
        log_level="debug" if settings.debug else "info",
    )


if __name__ == "__main__":
    main()
