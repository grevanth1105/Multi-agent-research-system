import time
import asyncio
from typing import AsyncGenerator, Dict, Any
from agents import build_reader_agent, build_search_agent, writer_chain, critic_chain
from pdf_export import markdown_to_pdf_bytes

STEPS = ["search", "reader", "writer", "critic"]

STEP_META = {
    "search": {
        "num": "01",
        "title": "Search Agent",
        "desc": "Gathers recent web information",
        "icon": "🔍",
        "spinner": "Search Agent is scanning the web…",
    },
    "reader": {
        "num": "02",
        "title": "Reader Agent",
        "desc": "Scrapes & extracts deep content",
        "icon": "📄",
        "spinner": "Reader Agent is scraping the top source…",
    },
    "writer": {
        "num": "03",
        "title": "Writer Chain",
        "desc": "Drafts the full research report",
        "icon": "✍️",
        "spinner": "Writer Chain is drafting the report…",
    },
    "critic": {
        "num": "04",
        "title": "Critic Chain",
        "desc": "Reviews & scores the report",
        "icon": "🧐",
        "spinner": "Critic Chain is reviewing the report…",
    },
}


def run_research_step(stage: str, topic: str, context: Dict[str, Any]) -> str:
    """Execute a single pipeline step synchronously."""
    if stage == "search":
        search_agent = build_search_agent()
        sr = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information about: {topic}")]
        })
        return sr["messages"][-1].content

    elif stage == "reader":
        reader_agent = build_reader_agent()
        search_snippet = context.get("search", "")[:800]
        rr = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{search_snippet}"
            )]
        })
        return rr["messages"][-1].content

    elif stage == "writer":
        research_combined = (
            f"SEARCH RESULTS:\n{context.get('search', '')}\n\n"
            f"DETAILED SCRAPED CONTENT:\n{context.get('reader', '')}"
        )
        return writer_chain.invoke({
            "topic": topic,
            "research": research_combined,
        })

    elif stage == "critic":
        return critic_chain.invoke({
            "report": context.get("writer", "")
        })

    else:
        raise ValueError(f"Unknown pipeline stage: {stage}")


async def stream_research_pipeline(topic: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Asynchronously stream step-by-step progress events for SSE communication."""
    state: Dict[str, str] = {}
    step_times: Dict[str, float] = {}
    pipeline_start = time.time()

    yield {
        "event": "pipeline_start",
        "topic": topic,
        "steps": [
            {"id": s, **STEP_META[s]} for s in STEPS
        ],
    }

    for step in STEPS:
        meta = STEP_META[step]
        yield {
            "event": "step_start",
            "step": step,
            "step_num": meta["num"],
            "title": meta["title"],
            "icon": meta["icon"],
            "message": meta["spinner"],
        }

        step_start = time.time()
        try:
            output = await asyncio.to_thread(run_research_step, step, topic, state)
            duration = round(time.time() - step_start, 2)
            state[step] = output
            step_times[step] = duration

            payload = {
                "event": "step_complete",
                "step": step,
                "step_num": meta["num"],
                "title": meta["title"],
                "duration": duration,
                "output": output,
            }

            if step == "writer":
                words = len(output.split())
                payload["word_count"] = words
                payload["read_mins"] = max(1, round(words / 200))

            yield payload

        except Exception as exc:
            yield {
                "event": "error",
                "step": step,
                "title": meta["title"],
                "message": str(exc),
            }
            return

    total_time = round(time.time() - pipeline_start, 2)
    report_text = state.get("writer", "")
    word_count = len(report_text.split())
    read_mins = max(1, round(word_count / 200))

    yield {
        "event": "done",
        "topic": topic,
        "total_time": total_time,
        "step_times": step_times,
        "results": state,
        "word_count": word_count,
        "read_mins": read_mins,
    }


def run_research_pipeline(topic: str) -> Dict[str, Any]:
    """Execute all agents synchronously and return complete results dict."""
    state: Dict[str, str] = {}
    step_times: Dict[str, float] = {}
    start_time = time.time()

    for step in STEPS:
        step_start = time.time()
        output = run_research_step(step, topic, state)
        state[step] = output
        step_times[step] = round(time.time() - step_start, 2)

    total_time = round(time.time() - start_time, 2)
    report = state.get("writer", "")
    words = len(report.split())

    return {
        "topic": topic,
        "results": state,
        "step_times": step_times,
        "total_time": total_time,
        "word_count": words,
        "read_mins": max(1, round(words / 200)),
    }


if __name__ == "__main__":
    user_topic = input("\nEnter a research topic: ")
    print(f"\nRunning research on: {user_topic}")
    res = run_research_pipeline(user_topic)
    print("\n[Done] Word count:", res["word_count"])
    print("\n--- Final Report ---\n", res["results"]["writer"])
    print("\n--- Critic Review ---\n", res["results"]["critic"])
