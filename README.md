# Varuna

**Paste a YouTube URL. Get an integrity report.** Per-comment `Low / Medium / High`
risk verdicts + a per-video Authenticity Score — bot-text classifier, account-farm
heuristics, scam regexes, and coordination detection fused in one decision ladder.

Live site (GitHub Pages): `https://jkwebsec.github.io/Varuna/`

## Run it (2 commands)

```bash
pip install -r requirements.txt
streamlit run app.py                    # → http://localhost:8501
```

No `YOUTUBE_API_KEY` env var needed — the app asks for your key in the browser
the first time you use it (see the "Get a free YouTube Data API v3 key"
panel at the top). Nobody's key is baked into this repo; each visitor brings
their own, and it only ever lives in their own session.

No model files? It runs heuristic-only automatically. The model artifacts
(`bot_text_model_v2.pkl`, `tfidf_vectorizer_v2.pkl`) are produced by the first
8 cells of `notebook/yt-authentic-1-2v.ipynb` — drop them next to `app.py` to
activate the LightGBM text signal.

## Repo map

| path | what |
|---|---|
| `index.html` + `assets/` | this GitHub Pages site (zero build) |
| `app.py` | standalone Streamlit app (notebook cells 9–11, logic unchanged) |
| `notebook/yt-authentic-1-2v.ipynb` | full Kaggle notebook: train + live inference |
| `requirements.txt` | pinned-enough deps |

## Publish the site

GitHub → repo Settings → Pages → Source: `main` / `/(root)` → Save.

GitHub Pages only serves static files — it can't run the Python backend.
For a live, clickable version of the app (not just the local `streamlit run`),
deploy it free on [Streamlit Community Cloud](https://streamlit.io/cloud):
sign in with GitHub → **New app** → pick this repo/branch → main file `app.py`
→ Deploy. You get a public `*.streamlit.app` URL.

The site already has two "Try it live" buttons (hero + Demo section) wired to
a placeholder — once you have your real URL, find/replace
`https://YOUR-APP-NAME.streamlit.app` in `index.html` (2 occurrences) with it,
then `git push`. GitHub Pages picks up the change automatically, no rebuild
step.

## Scoring engine (exact thresholds)

| signal | rule |
|---|---|
| account risk (cap 1.0) | ≥10 comments on this video +0.35 · unique-text ratio ≤0.40 +0.30 |
| spam patterns (cap 0.50) | links +0.20 · contact bait (whatsapp/telegram/dm me/inbox me/free recovery/lost crypto/signal group) +0.30 · unicode-bold-digit evasion +0.30 |
| coordination | same normalized text, ≥2 accounts, ≥2 posts → +0.20 |
| text suspicion | LightGBM prob: strong ≥0.85 · moderate ≥0.60 · weak ≥0.40 |
| decision ladder | hard scam → High 0.90 · account ≥0.60 → High 0.85 · len<20 → Low 0.05 · strong+support → High 0.75 · suspicion → Medium 0.45 · structural → Medium 0.35 · else Low 0.05 |
| authenticity | `(low·1 + med·0.5 + high·0) / total × 100` · video risk: ≥85 Low, ≥60 Medium, else High |

Full breakdown with rationale: see the site's **scoring** section.
