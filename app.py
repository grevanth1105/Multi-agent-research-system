import io
import json
import os
import re
import time
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pipeline import (
    STEPS,
    STEP_META,
    run_research_pipeline,
    stream_research_pipeline,
    markdown_to_pdf_bytes,
)

app = FastAPI(
    title="ResearchMind API",
    description="Multi-Agent AI Research System powered by LangChain and FastAPI",
    version="2.0.0",
)

# Enable CORS for local dev or multi-port setups
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static directory exists
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class ResearchRequest(BaseModel):
    topic: str


class PDFExportRequest(BaseModel):
    topic: str
    markdown: str


@app.get("/")
async def serve_index():
    """Serve the single-page frontend application."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(
        {"message": "ResearchMind API running. Place index.html into static/ folder."},
        status_code=200,
    )


@app.get("/api/health")
async def health_check():
    """Health & status check."""
    return {
        "status": "online",
        "app": "ResearchMind",
        "version": "2.0.0",
        "agents": len(STEPS),
    }


@app.get("/api/steps")
async def get_steps():
    """Return step metadata for pipeline visualization."""
    return [
        {
            "id": s,
            **STEP_META[s],
        }
        for s in STEPS
    ]


@app.post("/api/research")
async def run_research(payload: ResearchRequest):
    """Synchronous pipeline execution endpoint."""
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Research topic cannot be empty.")

    try:
        results = run_research_pipeline(topic)
        return JSONResponse(results)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/research/stream")
async def stream_research(topic: str = Query(..., min_length=1)):
    """Server-Sent Events (SSE) streaming endpoint for live real-time agent updates."""
    clean_topic = topic.strip()
    if not clean_topic:
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")

    async def event_generator():
        try:
            async for event_data in stream_research_pipeline(clean_topic):
                yield f"data: {json.dumps(event_data)}\n\n"
        except Exception as exc:
            err_payload = {
                "event": "error",
                "message": f"Server stream error: {str(exc)}",
            }
            yield f"data: {json.dumps(err_payload)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/export-pdf")
async def export_pdf(payload: PDFExportRequest):
    """Generate and download a formatted PDF from the research markdown."""
    markdown_content = payload.markdown.strip()
    topic = payload.topic.strip() or "Research Report"

    if not markdown_content:
        raise HTTPException(status_code=400, detail="Markdown content is required.")

    try:
        pdf_bytes = markdown_to_pdf_bytes(markdown_content, title=f"Research Report: {topic}")
        safe_name = re.sub(r"[^\w\-_\. ]", "_", topic)[:40].strip() or "report"
        filename = f"{safe_name}_{int(time.time())}.pdf"

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(exc)}")


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print(" 🔬 Starting ResearchMind on http://127.0.0.1:8000")
    print("=" * 60 + "\n")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
