import io
import re
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem


def _md_inline_to_reportlab(text: str) -> str:
    """Escape XML entities, then convert **bold** / *italic* to ReportLab tags."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", text)
    return text


def markdown_to_pdf_bytes(markdown_text: str, title: str = "Research Report") -> bytes:
    """Render a markdown-like report string into a clean, readable PDF and return bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        leftMargin=0.8 * inch,
        rightMargin=0.8 * inch,
        title=title,
    )
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        name="RepTitle",
        parent=styles["Title"],
        fontSize=20,
        leading=24,
        textColor="#1a1a24",
        spaceAfter=14,
    )
    h1_style = ParagraphStyle(
        name="RepH1",
        parent=styles["Heading1"],
        fontSize=16,
        leading=20,
        textColor="#222233",
        spaceBefore=14,
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        name="RepH2",
        parent=styles["Heading2"],
        fontSize=13,
        leading=17,
        textColor="#333344",
        spaceBefore=10,
        spaceAfter=6,
    )
    h3_style = ParagraphStyle(
        name="RepH3",
        parent=styles["Heading3"],
        fontSize=11,
        leading=15,
        textColor="#444455",
        spaceBefore=8,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        name="RepBody",
        parent=styles["BodyText"],
        fontSize=10,
        leading=15,
        textColor="#2c2c34",
        spaceAfter=8,
    )

    story = [
        Paragraph(_md_inline_to_reportlab(title), title_style),
        Spacer(1, 10),
    ]

    bullet_buffer = []

    def flush_bullets():
        if bullet_buffer:
            items = [
                ListItem(
                    Paragraph(_md_inline_to_reportlab(b), body_style),
                    leftIndent=15,
                    bulletColor="#ff8c32",
                )
                for b in bullet_buffer
            ]
            story.append(ListFlowable(items, bulletType="bullet", spaceAfter=8))
            bullet_buffer.clear()

    for raw_line in markdown_text.splitlines():
        line = raw_line.strip()

        if not line:
            flush_bullets()
            continue

        if line.startswith("### "):
            flush_bullets()
            story.append(Paragraph(_md_inline_to_reportlab(line[4:]), h3_style))
        elif line.startswith("## "):
            flush_bullets()
            story.append(Paragraph(_md_inline_to_reportlab(line[3:]), h2_style))
        elif line.startswith("# "):
            flush_bullets()
            story.append(Paragraph(_md_inline_to_reportlab(line[2:]), h1_style))
        elif line.startswith(("- ", "* ", "• ")):
            bullet_buffer.append(line[2:])
        elif re.match(r"^\d+\.\s+", line):
            flush_bullets()
            clean_text = re.sub(r"^\d+\.\s+", "", line)
            bullet_buffer.append(clean_text)
        else:
            flush_bullets()
            story.append(Paragraph(_md_inline_to_reportlab(line), body_style))

    flush_bullets()
    doc.build(story)
    return buffer.getvalue()

