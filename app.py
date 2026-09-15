import re
import time

import joblib
import pandas as pd
import streamlit as st
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from urllib.parse import urlparse, parse_qs
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


@st.cache_resource(show_spinner=False)
def load_model():
    try:
        return joblib.load("bot_text_model_v2.pkl"), joblib.load("tfidf_vectorizer_v2.pkl"), True
    except Exception:
        return None, None, False


text_model, tfidf, HAS_MODEL = load_model()


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


def normalize_text(text):
    text = str(text).lower().strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\w\s]", "", text)
    return text


def fetch_comments(youtube_client, video_id, max_comments=1000):
    rows = []
    token = None
    fetched = 0

    while fetched < max_comments:
        try:
            req = youtube_client.commentThreads().list(
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
            if "API key not valid" in msg or "keyInvalid" in msg or e.resp.status in (400, 403):
                raise ValueError("That API key was rejected by YouTube. Double-check it's a YouTube Data API v3 key with no restrictions blocking this app.")
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

    df["norm_text"] = df["comment_text"].map(normalize_text)
    df["text_len"] = df["comment_text"].str.len()
    work = df[df["text_len"] >= 30].copy()
    if len(work):
        grouped = work.groupby("norm_text").agg(
            unique_accounts=("author_channel_id", "nunique"),
            comment_count=("comment_text", "count"),
        ).reset_index()
        dup_set = set(
            grouped.loc[
                (grouped["unique_accounts"] >= 2) & (grouped["comment_count"] >= 2),
                "norm_text",
            ].astype(str)
        )
    else:
        dup_set = set()
    df["coordination_score"] = df["norm_text"].isin(dup_set).astype(float) * 0.20
    df = df.drop(columns=["norm_text", "text_len"])

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
        structural_support = (
            row["spam_pattern_score"] >= 0.20
            or row["account_risk_score"] >= 0.30
            or row["coordination_score"] >= 0.20
        )
        if row["text_suspicion"] == "strong" and structural_support:
            return "High", 0.75, "Strong text suspicion + support"
        if row["text_suspicion"] in ["strong", "moderate"]:
            return "Medium", 0.45, "Text suspicion"
        if (
            row["spam_pattern_score"] >= 0.30
            or row["account_risk_score"] >= 0.45
            or (row["coordination_score"] >= 0.20 and len(text) >= 30)
        ):
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
    ax.bar(counts.index, counts.values, color=["#55735d", "#eea035", "#a43c34"])
    ax.set_title("Comment Risk Distribution")
    ax.set_ylabel("Count")
    plt.tight_layout()
    return fig


def analyze(api_key, url, max_comments):
    youtube = build("youtube", "v3", developerKey=api_key)

    max_comments = int(max_comments)
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError("Invalid YouTube link. Paste a full video URL.")

    df = fetch_comments(youtube, video_id, max_comments=max_comments)
    if df is None or len(df) == 0:
        raise ValueError("No comments found (or comments unavailable).")

    scored = score_comments(df)

    total = len(scored)
    low = (scored["final_risk_level"] == "Low").sum()
    med = (scored["final_risk_level"] == "Medium").sum()
    high = (scored["final_risk_level"] == "High").sum()
    auth = round((low * 1.0 + med * 0.5 + high * 0.0) / total * 100, 2)
    risk = "Low" if auth >= 85 else ("Medium" if auth >= 60 else "High")

    top = scored.sort_values("final_risk_score", ascending=False)[
        ["comment_text", "final_risk_level", "final_risk_score", "final_reasons"]
    ].head(15)

    return {
        "video_id": video_id, "total": total, "low": low, "med": med, "high": high,
        "auth": auth, "risk": risk, "top": top, "scored": scored, "chart": make_chart(scored),
    }


# ---------------------------------------------------------------- UI ------

st.set_page_config(page_title="Varuna — YouTube Comment Integrity Analyzer", page_icon="🛡️", layout="centered")

st.title("Varuna")
st.caption("Paste a YouTube URL. Get a per-comment Low / Medium / High integrity report.")

with st.expander("🔑 Get a free YouTube Data API v3 key (~2 min)", expanded=not st.session_state.get("api_key")):
    st.markdown(
        "1. Open [console.cloud.google.com](https://console.cloud.google.com/) and create (or pick) a project.\n"
        "2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.\n"
        "3. **APIs & Services → Credentials → Create Credentials → API key** → copy it.\n"
        "4. Paste it below.\n\n"
        "Free tier: 10,000 quota units/day — one comment fetch costs 1 unit. "
        "This app never stores, logs, or sends your key anywhere except Google's own API — it only lives "
        "in this browser tab's session."
    )

api_key = st.text_input(
    "YouTube Data API v3 key",
    type="password",
    placeholder="AIza...",
    help="Starts with \"AIza\". See the steps above if you don't have one yet — it's free.",
    key="api_key",
)

url = st.text_input("YouTube URL", placeholder="https://www.youtube.com/watch?v=...")
max_comments = st.number_input("Max comments", min_value=10, max_value=5000, value=500, step=50)

go = st.button("Analyze", type="primary", disabled=not (api_key and url))
if not api_key:
    st.info("Enter your API key above to enable analysis.")

if go:
    with st.spinner("Fetching and scoring comments…"):
        try:
            result = analyze(api_key, url, max_comments)
        except ValueError as e:
            st.error(str(e))
            result = None
        except Exception as e:
            st.error(f"Unexpected error: {e}")
            result = None

    if result:
        st.subheader("Integrity report")
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Comments analyzed", result["total"])
        c2.metric("Authenticity score", f'{result["auth"]}/100')
        c3.metric("Video risk", result["risk"])
        c4.metric("Bot/Spam (High)", f'{result["high"]} ({round(100 * result["high"] / result["total"], 1)}%)')

        st.pyplot(result["chart"])

        st.markdown("**Top 15 most suspicious comments**")
        st.dataframe(result["top"], use_container_width=True)

        st.download_button(
            "Download full scored CSV",
            result["scored"].to_csv(index=False).encode("utf-8"),
            file_name=f'varuna_{result["video_id"]}.csv',
            mime="text/csv",
        )

if not HAS_MODEL:
    st.caption("Running heuristic-only (no trained model on disk) — account-farm, scam-regex and coordination signals still carry the run.")
