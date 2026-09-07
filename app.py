import os
import re
import time

import joblib
import numpy as np
import pandas as pd
import gradio as gr
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from urllib.parse import urlparse, parse_qs
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")

try:
    text_model = joblib.load("bot_text_model_v2.pkl")
    tfidf = joblib.load("tfidf_vectorizer_v2.pkl")
    HAS_MODEL = True
except Exception:
    text_model, tfidf, HAS_MODEL = None, None, False

youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY) if YOUTUBE_API_KEY else None


def extract_video_id(url: str):
    url = (url or "").strip()
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.netloc in ("youtu.be", "www.youtu.be"):
        vid = parsed.path.lstrip("/")
        return vid.split("?")[0] if vid else None
    if "youtube.com" in parsed.netloc:
        q = parse_qs(parsed.query)
        if "v" in q:
            return q["v"][0]
        parts = [p for p in parsed.path.split("/") if p]
        if parts and parts[0] in ("shorts", "embed", "live") and len(parts) > 1:
            return parts[1]
    return None


def hard_scam_flag(text):
    t = str(text).lower()
    if re.search(r"(free recovery|lost crypto|signal group|guaranteed profit)", t):
        return 1
    if re.search(r"(whatsapp|telegram|wa\.me|t\.me|bit\.ly|tinyurl)", t):
        return 1
    if re.search(r"\b(dm me|inbox me)\b", t):
        return 1
    if re.search(r"\bcontact me\b", t) and re.search(r"(whatsapp|telegram|number|phone|profit|signal|recover|thanks|pal)", t):
        return 1
    if re.search(r"(𝟣|𝟤|𝟥|𝟦|𝟧|𝟨|𝟩|𝟪|𝟫|𝟢)", str(text)) and re.search(r"(thanks|contact|chat|whatsapp|telegram|pal|dm|inbox)", t):
        return 1
    return 0


def spam_pattern_score(text):
    t = str(text).lower()
    score = 0.0
    if re.search(r"(http|www\.|t\.me|wa\.me|bit\.ly|tinyurl)", t):
        score += 0.20
    if re.search(r"(whatsapp|telegram|dm me|inbox me|contact me|free recovery|lost crypto|signal group)", t):
        score += 0.30
    if re.search(r"(𝟣|𝟤|𝟥|𝟦|𝟧|𝟨|𝟩|𝟪|𝟫|𝟢)", str(text)) and re.search(r"(thanks|contact|chat|pal|dm|inbox)", t):
        score += 0.30
    return min(score, 0.50)


def fetch_comments(video_id, max_comments=1000):
    rows = []
    token = None
    fetched = 0

    while fetched < max_comments:
        try:
            req = youtube.commentThreads().list(
                part="snippet,replies",
                videoId=video_id,
                maxResults=min(100, max_comments - fetched),
                pageToken=token,
                textFormat="plainText",
            )
            resp = req.execute()
        except HttpError as e:
            msg = str(e)
            if "commentsDisabled" in msg:
                raise ValueError("Comments are disabled on this video.")
            if "videoNotFound" in msg:
                raise ValueError("Video not found / invalid link.")
            if "quota" in msg.lower():
                raise ValueError("YouTube API quota exceeded. Try later.")
            raise ValueError(f"YouTube API error: {e}")

        items = resp.get("items", [])
        if not items:
            break

        for item in items:
            top = item["snippet"]["topLevelComment"]["snippet"]
            rows.append({
                "comment_text": top.get("textDisplay", ""),
                "published_at": top.get("publishedAt", ""),
                "like_count": top.get("likeCount", 0),
                "author_channel_id": top.get("authorChannelId", {}).get("value"),
                "is_reply": False,
            })
            fetched += 1
            if fetched >= max_comments:
                break

            for rep in item.get("replies", {}).get("comments", []):
                if fetched >= max_comments:
                    break
                s = rep["snippet"]
                rows.append({
                    "comment_text": s.get("textDisplay", ""),
                    "published_at": s.get("publishedAt", ""),
                    "like_count": s.get("likeCount", 0),
                    "author_channel_id": s.get("authorChannelId", {}).get("value"),
                    "is_reply": True,
                })
                fetched += 1

        token = resp.get("nextPageToken")
        if not token:
            break
        time.sleep(0.05)

    return pd.DataFrame(rows)


def score_comments(df):
    df = df.copy()
    df["comment_text"] = df["comment_text"].astype(str)
    df["hard_scam"] = df["comment_text"].map(hard_scam_flag)
    df["spam_pattern_score"] = df["comment_text"].map(spam_pattern_score)

    acc = df.groupby("author_channel_id").agg(
        total_comments=("comment_text", "count"),
        unique_text_ratio=("comment_text", lambda s: s.nunique() / max(len(s), 1)),
    ).reset_index()

    def acc_risk(r):
        score = 0.0
        if r["total_comments"] >= 10:
            score += 0.35
        elif r["total_comments"] >= 5:
            score += 0.20
        if r["unique_text_ratio"] <= 0.4:
            score += 0.30
        return min(score, 1.0)

    acc["account_risk_score"] = acc.apply(acc_risk, axis=1)
    df = df.merge(acc[["author_channel_id", "account_risk_score"]], on="author_channel_id", how="left")
    df["account_risk_score"] = df["account_risk_score"].fillna(0.0)

    if HAS_MODEL:
        X = tfidf.transform(df["comment_text"].tolist())
        df["text_bot_prob"] = text_model.predict_proba(X)[:, 1]
    else:
        df["text_bot_prob"] = 0.0

    def text_suspicion(p):
        if p >= 0.85:
            return "strong"
        if p >= 0.60:
            return "moderate"
        if p >= 0.40:
            return "weak"
        return "none"

    df["text_suspicion"] = df["text_bot_prob"].map(text_suspicion)

    def decide(row):
        text = str(row["comment_text"]).strip()
        if row["hard_scam"] == 1:
            return "High", 0.90, "Hard scam/contact pattern"
        if row["account_risk_score"] >= 0.60:
            return "High", 0.85, "Strong account farm risk"
        if len(text) < 20 and row["hard_scam"] == 0:
            return "Low", 0.05, "Short comment with no scam signal"
        if row["text_suspicion"] == "strong" and (row["spam_pattern_score"] >= 0.20 or row["account_risk_score"] >= 0.30):
            return "High", 0.75, "Strong text suspicion + support"
        if row["text_suspicion"] in ["strong", "moderate"]:
            return "Medium", 0.45, "Text suspicion"
        if row["spam_pattern_score"] >= 0.30 or row["account_risk_score"] >= 0.45:
            return "Medium", 0.35, "Structural signals"
        return "Low", 0.05, "No strong bot evidence"

    levels, scores, reasons = [], [], []
    for _, r in df.iterrows():
        level, score, reason = decide(r)
        levels.append(level)
        scores.append(score)
        reasons.append(reason)

    df["final_risk_level"] = levels
    df["final_risk_score"] = scores
    df["final_reasons"] = reasons
    return df


def make_chart(df):
    counts = df["final_risk_level"].value_counts().reindex(["Low", "Medium", "High"]).fillna(0)
    fig, ax = plt.subplots(figsize=(5, 3))
    ax.bar(counts.index, counts.values)
    ax.set_title("Comment Risk Distribution")
    ax.set_ylabel("Count")
    plt.tight_layout()
    return fig


def analyze(url, max_comments):
    try:
        if not youtube:
            return "Set YOUTUBE_API_KEY environment variable first.", None, None, None
        max_comments = int(max_comments)
        if max_comments <= 0:
            return "Max comments must be > 0", None, None, None

        video_id = extract_video_id(url)
        if not video_id:
            return "Invalid YouTube link. Paste a full video URL.", None, None, None

        df = fetch_comments(video_id, max_comments=max_comments)
        if df is None or len(df) == 0:
            return "No comments found (or comments unavailable).", None, None, None

        scored = score_comments(df)

        total = len(scored)
        low = (scored["final_risk_level"] == "Low").sum()
        med = (scored["final_risk_level"] == "Medium").sum()
        high = (scored["final_risk_level"] == "High").sum()
        auth = round((low * 1.0 + med * 0.5 + high * 0.0) / total * 100, 2)
        risk = "Low" if auth >= 85 else ("Medium" if auth >= 60 else "High")

        summary = f"""
### YouTube Comment Integrity Report
- Video ID: `{video_id}`
- Comments analyzed: **{total}** (requested {max_comments})
- Genuine (Low): **{low}** ({round(100 * low / total, 2)}%)
- Suspicious (Medium): **{med}** ({round(100 * med / total, 2)}%)
- Bot/Spam (High): **{high}** ({round(100 * high / total, 2)}%)
- Authenticity Score: **{auth}/100**
- Video Risk: **{risk}**
"""

        top = scored.sort_values("final_risk_score", ascending=False)[
            ["comment_text", "final_risk_level", "final_risk_score", "final_reasons"]
        ].head(15)

        chart = make_chart(scored)
        return summary, chart, top, scored

    except Exception as e:
        return f"Error: {str(e)}", None, None, None


with gr.Blocks(title="YouTube Comment Integrity Analyzer") as demo:
    gr.Markdown("# YouTube Comment Integrity Analyzer")
    gr.Markdown("Paste a YouTube link, set max comments, generate integrity report.")

    with gr.Row():
        url = gr.Textbox(label="YouTube URL", placeholder="https://www.youtube.com/watch?v=...")
        max_c = gr.Number(label="Max comments", value=1000, precision=0)

    btn = gr.Button("Analyze", variant="primary")

    out_md = gr.Markdown()
    out_plot = gr.Plot()
    out_table = gr.Dataframe()
    out_full = gr.Dataframe(visible=False)

    btn.click(analyze, inputs=[url, max_c], outputs=[out_md, out_plot, out_table, out_full])

if __name__ == "__main__":
    demo.launch(share=True)
