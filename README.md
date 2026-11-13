# ResearchMind · Multi-Agent Research System

An autonomous multi-agent AI research application powered by **LangChain**, **Google Gemini API**, **Tavily Search**, and rewritten with a high-performance **FastAPI** backend and a custom **HTML5 / CSS3 / Vanilla JavaScript** frontend.

---

## 🏗️ Architecture Overview

ResearchMind orchestrates four sequential agents:

```
[ Research Topic ]
        │
        ▼
┌──────────────────────────┐
│  01. Search Agent        │ ── Tavily Search API retrieves high-signal URLs & snippets
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│  02. Reader Agent        │ ── BeautifulSoup extracts deep body content from top source
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│  03. Writer Chain        │ ── LangChain prompt synthesizes comprehensive research report
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│  04. Critic Chain        │ ── Adversarial evaluator audits factual clarity, score & advice
└──────────────────────────┘
        │
        ▼
[ Rendered Report + PDF Export + Critic Score ]
```

### Communication Protocol
- **Server-Sent Events (SSE)** via `/api/research/stream?topic=...`: Streams real-time step notifications, active agent statuses, live stopwatch durations, and intermediate outputs.
- **REST Endpoints**:
  - `GET /` — Serves the frontend single-page application
  - `GET /api/health` — Service health & version status
  - `GET /api/steps` — Dynamic step metadata
  - `POST /api/research` — Synchronous batch research execution
  - `POST /api/export-pdf` — Generates and downloads formatted PDF reports using ReportLab

---

## 🚀 Quick Start

### 1. Configure Environment Variables
Ensure `.env` in the root directory contains your API keys:
```env
TAVILY_API_KEY=your_tavily_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch the FastAPI Application
You can run the server directly with Python:
```bash
python app.py
```
Or via Uvicorn:
```bash
uvicorn app:app --reload --port 8000
```

### 4. Access the Application
Open your browser and navigate to:
```
http://localhost:8000
```

---

## 📂 Project Structure

```
├── .env                  # API keys (Tavily & Google Gemini)
├── app.py                # FastAPI server, endpoints & static routing
├── pipeline.py           # Multi-agent pipeline, synchronous & async SSE streaming
├── agents.py             # Agent definitions & LangChain prompts
├── tools.py              # Search & Scraping tool definitions
├── pdf_export.py         # ReportLab PDF compilation utility
├── requirements.txt      # Project dependencies
└── static/               # Frontend Assets (HTML, CSS, JS)
    ├── index.html        # Main single-page web app
    ├── css/
    │   └── style.css     # Modern dark cyberpunk-amber theme
    └── js/
        └── app.js        # SSE event stream handling & dynamic UI updates
```

---

## 🎨 Features
- **Real-Time Live Agent Stepper**: Live status indicators (`WAITING`, `● RUNNING`, `✓ DONE`, `✕ FAILED`) with animations and execution timers.
- **Inspect Agent Output**: Expandable drawer to inspect search results and scraped webpage text.
- **Markdown Rendering**: Formatted typography with headings, lists, bold text, links, and code blocks.
- **Critic Score Highlight**: Visual score badge (e.g. `8/10`) and peer review breakdown.
- **One-Click Actions**:
  - 📋 Copy markdown report to clipboard
  - 📥 Export and download report as a PDF
  - ↺ Quick retry on failure

