/* =========================================================================
   yt-authentic — archive stage (Globe / Stacked / Traditional, unchanged)
   + page behaviours (copy, scrollspy, reveal)
   ========================================================================= */

/* ---- backend content, one "cover" per pipeline component or decide() rung.
   All facts/thresholds are copied verbatim from app.py's score_comments()/
   decide() and the Scoring Engine section above. */
var BOOKS = [
  {
    id: "fetch", kind: "component", palette: "cream",
    top: "01", title: "Comment Fetch", figure: "▤", mark: "YOUTUBE DATA API V3",
    kicker: "Backend · pipeline stage 1 of 6", headline: "100/req", tag: "component", tagLabel: "backend component",
    description: "commentThreads.list paginates 100 comments per request with a 50ms sleep between pages, walking nextPageToken until max_comments is hit. Replies are fetched inline and flagged is_reply so account-farm stats can separate top-level comments from replies.",
    facts: [
      "commentsDisabled → clear error, never a stack trace",
      "videoNotFound → clear error",
      "quota exhausted → “try later”, the run stops cleanly"
    ]
  },
  {
    id: "classifier", kind: "component", palette: "blue",
    top: "02", title: "Bot Classifier", figure: "✦", mark: "LIGHTGBM + TF-IDF",
    kicker: "Backend · pipeline stage 2 of 6", headline: "10K", tag: "component", tagLabel: "backend component",
    description: "A LightGBM binary classifier scores every comment's text alone: TF-IDF over 1–2 word ngrams, 10,000 features, min_df=2. 400 trees, learning rate 0.05, 48 leaves, class_weight=\"balanced\" to counter the natural genuine/bot imbalance in the training set.",
    facts: [
      "output = text_bot_prob, a single probability in [0, 1]",
      "no model on disk → HAS_MODEL=False, heuristic-only mode kicks in automatically",
      "never the sole decider — always fused with structural signals in decide()"
    ]
  },
  {
    id: "account", kind: "component", palette: "orange",
    top: "03", title: "Account Farm", figure: "◉", mark: "ACCOUNT_RISK_SCORE",
    kicker: "Backend · pipeline stage 3 of 6", headline: "1.00", tag: "component", tagLabel: "backend component",
    description: "Every comment's author_channel_id is aggregated on this one video: total comment volume and the ratio of unique text to total comments. The conditions stack — a repeat poster who copy-pastes hits the 1.0 cap fast.",
    facts: [
      "total_comments ≥ 10 → +0.35 · ≥ 5 → +0.20",
      "unique_text_ratio ≤ 0.40 → +0.30",
      "capped at 1.0 · missing channel id → 0.0"
    ]
  },
  {
    id: "scam", kind: "component", palette: "coral",
    top: "04", title: "Scam Regex", figure: "✷", mark: "SPAM_PATTERN_SCORE",
    kicker: "Backend · pipeline stage 4 of 6", headline: "0.50", tag: "component", tagLabel: "backend component",
    description: "A regex battery scans the raw comment text for the classic YouTube scam surface — payment-app handles, contact bait, and a Unicode-bold-digit evasion trick (𝟣𝟤𝟥…) scammers use to slip a phone number past plain-text filters. Capped at 0.50: a strong signal, never the whole verdict.",
    facts: [
      "link → +0.20 (http, www., t.me, wa.me, bit.ly, tinyurl)",
      "contact bait → +0.30 (whatsapp, telegram, dm me, inbox me, contact me, free recovery, lost crypto, signal group)",
      "unicode evasion → +0.30 (bold digits + a contact word together)"
    ],
    code: ["free recovery", "lost crypto", "signal group", "guaranteed profit", "whatsapp", "telegram", "t.me", "wa.me", "bit.ly", "tinyurl", "“dm me”", "“inbox me”"]
  },
  {
    id: "coord", kind: "component", palette: "pink",
    top: "05", title: "Coordination", figure: "✳", mark: "COORDINATION_SCORE",
    kicker: "Backend · pipeline stage 5 of 6", headline: "0.20", tag: "component", tagLabel: "backend component",
    description: "Comment text is normalized — lowercased, whitespace-collapsed, punctuation stripped — then grouped. If the same normalized text appears from 2 or more distinct accounts, 2 or more times, every one of those comments is flagged as a coordinated brigade.",
    facts: [
      "fixed score: +0.20, no partial credit",
      "needs ≥30 characters of normalized text — short phrases like “nice video” are noise, not signal",
      "catches copy-paste brigades across sockpuppet accounts"
    ]
  },
  {
    id: "report", kind: "component", palette: "green",
    top: "06", title: "Integrity Report", figure: "▥", mark: "MARKDOWN + CHART + TOP-15",
    kicker: "Backend · pipeline stage 6 of 6", headline: "/100", tag: "component", tagLabel: "backend component",
    description: "Every scored comment gets a final_risk_level, a final_risk_score, and a final_reasons string. Rolled up per video: an Authenticity Score out of 100, a risk distribution chart, and the top-15 most suspicious comments — the full scored DataFrame is downloadable.",
    facts: [
      "authenticity = (low·1 + medium·0.5 + high·0) ÷ total × 100",
      "video risk: Low ≥85 · Medium ≥60 · High otherwise",
      "the same formula this page's terminal demo runs live"
    ]
  },
  {
    id: "rule1", kind: "rule", palette: "red",
    top: "R1", title: "Hard Scam", figure: "⚠", mark: "HIGH · 0.90",
    kicker: "decide() · rule 1 of 7", headline: "0.90", tag: "high", tagLabel: "final_risk_level",
    description: "Rule 1 of 7 — first match wins. hard_scam==1 fires on free recovery / lost crypto / signal group / guaranteed profit, on whatsapp/telegram/t.me/wa.me/bit.ly/tinyurl, on “dm me”/“inbox me”, or on “contact me” plus context. It short-circuits every other signal.",
    quote: "Lost crypto? I got all of mine back in 48 hours. Free recovery, no upfront fee — join the signal group on telegram @vault_recovery_desk",
    meta: "@CryptoRecovery_Desk · top-level · 0 likes",
    signals: { text_bot_prob: 0.94, account_risk_score: 0.30, spam_pattern_score: 0.50, coordination_score: 0.00 },
    reason: "Hard scam/contact pattern"
  },
  {
    id: "rule2", kind: "rule", palette: "navy",
    top: "R2", title: "Account Farm", figure: "◉", mark: "HIGH · 0.85",
    kicker: "decide() · rule 2 of 7", headline: "0.85", tag: "high", tagLabel: "final_risk_level",
    description: "Rule 2 — a bland, harmless-looking comment still goes High when account_risk_score ≥ 0.60. The text alone is never suspicious here; the account's volume and copy-paste ratio are what convict it.",
    quote: "Nice video bro keep it up 🔥",
    meta: "@user_9931204 · 14 comments here · unique-text ratio 0.21",
    signals: { text_bot_prob: 0.41, account_risk_score: 0.65, spam_pattern_score: 0.00, coordination_score: 0.20 },
    reason: "Strong account farm risk"
  },
  {
    id: "rule3", kind: "rule", palette: "mint",
    top: "R3", title: "Too Short", figure: "●", mark: "LOW · 0.05",
    kicker: "decide() · rule 3 of 7", headline: "0.05", tag: "low", tagLabel: "final_risk_level",
    description: "Rule 3 — under 20 characters with no scam flag is Low by default, no matter what the text classifier guesses. Short comments don't carry enough signal to convict.",
    quote: "first 🔥🔥",
    meta: "@notifsquad · top-level · 212 likes",
    signals: { text_bot_prob: 0.52, account_risk_score: 0.00, spam_pattern_score: 0.00, coordination_score: 0.00 },
    reason: "Short comment with no scam signal"
  },
  {
    id: "rule4", kind: "rule", palette: "red",
    top: "R4", title: "Text + Support", figure: "✷", mark: "HIGH · 0.75",
    kicker: "decide() · rule 4 of 7", headline: "0.75", tag: "high", tagLabel: "final_risk_level",
    description: "Rule 4 — the classifier alone isn't enough. Strong suspicion (p ≥ 0.85) only escalates to High when a support signal backs it up: spam_pattern_score ≥ 0.20 or account_risk_score ≥ 0.30.",
    quote: "Best video on this topic!! Everyone should watch this, amazing content, keep going, already subscribed!!!",
    meta: "@growth_engine_yt · 6 comments here · unique-text ratio 0.33",
    signals: { text_bot_prob: 0.93, account_risk_score: 0.35, spam_pattern_score: 0.00, coordination_score: 0.00 },
    reason: "Strong text suspicion + support"
  },
  {
    id: "rule5", kind: "rule", palette: "yellow",
    top: "R5", title: "Text Suspicion", figure: "✧", mark: "MEDIUM · 0.45",
    kicker: "decide() · rule 5 of 7", headline: "0.45", tag: "med", tagLabel: "final_risk_level",
    description: "Rule 5 — moderate-to-strong text suspicion with no support signal lands at Medium, not High. The model isn't certain enough on its own to convict.",
    quote: "Wow such an informative video, thank you so much for sharing this valuable knowledge with us",
    meta: "@shreya.k · top-level · 3 likes",
    signals: { text_bot_prob: 0.71, account_risk_score: 0.20, spam_pattern_score: 0.00, coordination_score: 0.00 },
    reason: "Text suspicion"
  },
  {
    id: "rule6", kind: "rule", palette: "yellow",
    top: "R6", title: "Structural", figure: "✹", mark: "MEDIUM · 0.35",
    kicker: "decide() · rule 6 of 7", headline: "0.35", tag: "med", tagLabel: "final_risk_level",
    description: "Rule 6 — the text classifier is unconvinced, but spam_pattern_score ≥ 0.30 or account_risk_score ≥ 0.45 alone is enough for Medium. Structure can convict even when the wording looks innocent.",
    quote: "Bhai R2h walo ko bulao ❤️ please bulao unko",
    meta: "9 identical posts · 4 accounts",
    signals: { text_bot_prob: 0.44, account_risk_score: 0.50, spam_pattern_score: 0.00, coordination_score: 0.20 },
    reason: "Structural signals"
  },
  {
    id: "rule7", kind: "rule", palette: "mint",
    top: "R7", title: "No Evidence", figure: "◆", mark: "LOW · 0.05",
    kicker: "decide() · rule 7 of 7", headline: "0.05", tag: "low", tagLabel: "final_risk_level",
    description: "Rule 7 — the fallback. Every prior rung failed to fire, so the comment is Low by default. This is where genuine conversation lives.",
    quote: "The part at 12:40 about TF-IDF finally made ngrams click for me. I had been treating min_df as a noise knob when it is really a vocabulary budget.",
    meta: "@meera.builds · top-level · 47 likes",
    signals: { text_bot_prob: 0.11, account_risk_score: 0.00, spam_pattern_score: 0.00, coordination_score: 0.00 },
    reason: "No strong bot evidence"
  }
];

var VIEW_LABELS = { globe: "Globe perspective", stacked: "Stacked perspective", traditional: "Traditional perspective" };

/* =========================================================================
   DEMO REEL — the one line to change.
   Swap DEMO_VIDEO_URL for any YouTube link (youtu.be / watch?v= / shorts /
   live / embed, tracking params like ?si= are fine) and the screening
   section rebuilds itself: poster, caption, and embed all follow.
   ========================================================================= */
var DEMO_VIDEO_URL = "https://youtu.be/-6gOljCctCw";


function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
var finePointer = window.matchMedia("(pointer: fine)");

var stack = document.querySelector("#coverStack");
var expandedCard = document.querySelector("#expandedCard");
var closeExpanded = document.querySelector("#closeExpanded");
var archiveFrame = document.querySelector("#archiveFrame");
var archiveArt = document.querySelector("#archiveArt");
var selectionLabel = document.querySelector("#selectionLabel");
var currentView = "stacked";
var lastOpener = null;

/* ---- build the cover stack ----------------------------------------------
   --i drives the stacked/globe transforms (unchanged formulas from the
   reference); --center generalizes the globe arc to any book count instead
   of a hardcoded "4" (only correct for exactly 10 covers). --col/--row drive
   the traditional cascade, same as reference. */
stack.style.setProperty("--center", String((BOOKS.length - 1) / 2));

BOOKS.forEach(function (book, index) {
  var button = document.createElement("button");
  button.className = "magazine-cover palette-" + book.palette;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", "Open " + book.title + " cover");
  button.style.setProperty("--i", String(index));
  button.style.setProperty("--col", String(index % 5));
  button.style.setProperty("--row", String(Math.floor(index / 5)));
  button.style.setProperty("--depth", String(index / Math.max(BOOKS.length - 1, 1)));
  button.innerHTML =
    '<span class="cover-top">' + esc(book.top) + '</span>' +
    '<strong>' + esc(book.title) + '</strong>' +
    '<span class="cover-art"><i>' + book.figure + '</i><i>' + book.figure + '</i><i>' + book.figure + '</i></span>' +
    '<span class="cover-mark">' + esc(book.mark) + '</span>';
  button.addEventListener("click", function () { openCover(index, button); });
  stack.append(button);
});

/* ---- adaptive traditional grid --------------------------------------------
   Fixed 5 columns squeeze cards to illegible 70px slivers on phones while
   their inner content (icon glyphs, hairline rules) keeps fixed minimums —
   the icons then burst out of the card (the reported mobile bug). So the
   column count follows the panel: ≤460px → 3 cols, ≤720px → 4, else 5. */
function tradColsFor(artWidth) {
  if (artWidth <= 460) return 3;
  if (artWidth <= 720) return 4;
  return 5;
}

function layoutTraditionalGrid() {
  var artRect = archiveArt.getBoundingClientRect();
  var cols = tradColsFor(artRect.width || 800);
  var covers = stack.children;
  for (var k = 0; k < covers.length; k++) {
    covers[k].style.setProperty("--col", String(k % cols));
    covers[k].style.setProperty("--row", String(Math.floor(k / cols)));
  }
  return cols;
}

/* ---- traditional view: size the cascade so every row stays inside the
   panel, however many books there are and however small the viewport is.
   Same transform formula as the reference (col × 23%, row × 115%,
   translate3d) — only the container's own width is solved for, which in
   turn sets card height via the fixed .69 aspect ratio.

   The container is centered on its OWN single-card box, but the cascade
   only grows down-and-right from that box — so the largest card size whose
   worst-case bound still lands inside the panel is solved for. Floor is
   92px: below that glyphs get cramped, so instead the panel grows taller
   (minHeight below) and readability wins over fitting a short box. */
function sizeTraditionalView() {
  if (currentView !== "traditional") return;
  var n = BOOKS.length;
  var artRect = archiveArt.getBoundingClientRect();
  if (!artRect.width || !artRect.height) return;
  var cols = Math.min(layoutTraditionalGrid(), n);
  var rows = Math.ceil(n / cols);
  var aspect = 0.69;
  var narrow = artRect.width < 520;
  /* narrow panels: pack tighter (0.80 fill) and cap cards at 100px —
     a 13-cover grid is inherently tall on phones; this keeps the panel
     near ~2 phone screens instead of ~3 while staying readable */
  var fill = narrow ? 0.80 : 0.62;
  var cap = narrow ? 100 : 760;
  var vDenom = 0.5 + (rows - 1) * 1.15;
  var wByHeight = (artRect.height * fill / vDenom) * aspect;
  var hDenom = 0.5 + Math.max(0, cols - 1) * 0.23;
  var wByWidth = artRect.width * 0.6 / hDenom;
  var w = Math.min(wByHeight, wByWidth, cap);
  if (w < 92) {
    w = Math.min(narrow ? 100 : 120, (artRect.width * 0.72) / hDenom, cap);
    var needH = Math.ceil(((w / aspect) * vDenom) / fill + 40);
    archiveArt.style.minHeight = Math.max(artRect.height, needH) + "px";
  } else {
    archiveArt.style.minHeight = "";
  }
  w = Math.max(64, w);
  stack.style.setProperty("--trad-w", w + "px");
  stack.style.setProperty("--trad-cols", String(cols));
  stack.style.setProperty("--trad-rows", String(rows));
}

/* ---- stacked view: scale the perspective cascade to the panel and center
   the whole fanned block (not just its first card) inside it. Same shape as
   the reference's per-card translate3d/rotate, but the step size shrinks on
   narrow panels instead of overflowing, and the container shift is solved
   from the actual step so the cascade's midpoint — not its first card —
   lands on the panel's center. */
function sizeStackedView() {
  if (currentView !== "stacked") return;
  var n = BOOKS.length;
  var artRect = archiveArt.getBoundingClientRect();
  var cardRect = stack.getBoundingClientRect();
  if (!artRect.width || !cardRect.width) return;
  /* reserve the card itself plus breathing room: the old fixed 0.3 budget
     ignored card width, so on narrow panels card + cascade clipped right */
  var pad = 28;
  var budgetX = Math.max(0, artRect.width - cardRect.width * 1.18 - pad);
  var stepX = Math.max(4, Math.min(14, budgetX / Math.max(n - 1, 1)));
  var ratio = stepX / 14;
  var stepY = 7 * ratio;
  /* cap the total vertical rise so the back of the fan never leaves the top */
  var maxRise = artRect.height * 0.30;
  if (stepY * (n - 1) > maxRise) stepY = Math.max(2, maxRise / Math.max(n - 1, 1));
  var stepZ = 10 * ratio;
  stack.style.setProperty("--stack-step-x", stepX + "px");
  stack.style.setProperty("--stack-step-y", "-" + stepY + "px");
  stack.style.setProperty("--stack-step-z", stepZ + "px");
  stack.style.setProperty("--stack-shift-x", ((n - 1) * stepX / 2) + "px");
  stack.style.setProperty("--stack-shift-y", ((n - 1) * stepY / 2) + "px");
}

/* ---- globe view: scale the arc's spread to the panel, not a fixed viewport.
   The reference hardcodes 33px/45px/3px/7deg tuned for one specific desktop
   width and exactly 10 covers; at any other panel size or book count the
   outer covers drift past the panel edge. Same sin()-arc shape, same linear
   per-index spread — only the step/amplitude/depth/rotation magnitudes are
   solved from the actual panel width and book count so the arc always fits. */
function sizeGlobeView() {
  if (currentView !== "globe") return;
  var n = BOOKS.length;
  var center = (n - 1) / 2;
  var artRect = archiveArt.getBoundingClientRect();
  var cardRect = stack.getBoundingClientRect();
  if (!artRect.width || !cardRect.width) return;
  var budget = artRect.width * 0.36 - cardRect.width * 0.75;
  var step = Math.max(4, Math.min(33, budget / Math.max(center, 1)));
  var ratio = step / 33;
  /* cap arc height to short panels so top/bottom covers never clip */
  var amp = Math.min(45 * ratio, artRect.height * 0.14);
  stack.style.setProperty("--globe-step", step + "px");
  stack.style.setProperty("--globe-amp", amp + "px");
  stack.style.setProperty("--globe-z", (3 * ratio) + "px");
  stack.style.setProperty("--globe-rot", (7 * ratio) + "deg");
}

/* ---- open / close --------------------------------------------------------- */
function openCover(index, opener) {
  var book = BOOKS[index];
  lastOpener = opener || null;

  var html =
    '<div class="expanded-cover palette-' + book.palette + '">' +
      '<span class="cover-top">' + esc(book.top) + '</span>' +
      '<strong>' + esc(book.title) + '</strong>' +
      '<span class="cover-art"><i>' + book.figure + '</i><i>' + book.figure + '</i><i>' + book.figure + '</i></span>' +
      '<span class="cover-mark">' + esc(book.mark) + '</span>' +
    '</div>' +
    '<div class="expanded-copy">' +
      '<span class="expanded-kicker">' + esc(book.kicker) + '</span>' +
      '<h2>' + esc(book.headline) + '</h2>' +
      '<div class="expanded-level"><span class="tag ' + book.tag + '">' + esc(book.tag === "component" ? "COMPONENT" : book.tag.toUpperCase()) + '</span>' +
        '<span class="spec-kicker">' + esc(book.tagLabel) + '</span></div>';

  if (book.quote) {
    html += '<blockquote class="expanded-quote">' + esc(book.quote) + '</blockquote>';
    html += '<div class="expanded-meta">' + esc(book.meta) + '</div>';
  }
  if (book.signals) {
    html += '<div class="signal-readout">' + Object.keys(book.signals).map(function (key) {
      var v = book.signals[key];
      return '<div class="signal-row"><span class="sig-name">' + key + '</span>' +
        '<span class="sig-bar"><span class="sig-fill" style="width:' + Math.round(v * 100) + '%"></span></span>' +
        '<span class="sig-val">' + v.toFixed(2) + '</span></div>';
    }).join("") + '</div>';
  }
  html += '<p class="expanded-desc">' + esc(book.description) + '</p>';
  if (book.facts) {
    html += '<ul class="expanded-facts">' + book.facts.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join("") + '</ul>';
  }
  if (book.code) {
    html += '<div class="expanded-code">' + book.code.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join("") + '</div>';
  }
  if (book.reason) {
    html += '<p class="expanded-reason"><b>final_reasons</b>' + esc(book.reason) + '</p>';
  }
  html += '<button class="text-button" id="returnToStack">Return to collection <span>↗</span></button>';

  expandedCard.innerHTML = html;
  archiveFrame.classList.add("is-expanded");
  expandedCard.classList.add("is-visible");
  closeExpanded.classList.add("is-visible");
  selectionLabel.textContent = book.title;

  var back = document.querySelector("#returnToStack");
  back.addEventListener("click", closeCover);
  back.focus();
}

function closeCover() {
  if (!archiveFrame.classList.contains("is-expanded")) return;
  archiveFrame.classList.remove("is-expanded");
  expandedCard.classList.remove("is-visible");
  closeExpanded.classList.remove("is-visible");
  selectionLabel.textContent = VIEW_LABELS[currentView];
  if (lastOpener) { lastOpener.focus(); lastOpener = null; }
}

closeExpanded.addEventListener("click", closeCover);
document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeCover(); });

/* ---- perspective switcher: Globe / Stacked / Traditional, unchanged ------ */
document.querySelectorAll(".view-button").forEach(function (button) {
  button.addEventListener("click", function () {
    var view = button.dataset.view;
    document.querySelectorAll(".view-button").forEach(function (item) {
      item.classList.remove("is-active");
      item.setAttribute("aria-pressed", "false");
    });
    button.classList.add("is-active");
    button.setAttribute("aria-pressed", "true");
    currentView = view;
    archiveArt.dataset.view = view;
    if (!archiveFrame.classList.contains("is-expanded")) {
      selectionLabel.textContent = VIEW_LABELS[view];
    }
    /* traditional grows the panel (minHeight) on short screens — release it
       when leaving so stacked/globe re-center in the natural panel */
    if (view !== "traditional") archiveArt.style.minHeight = "";
    if (view === "traditional") sizeTraditionalView();
    if (view === "globe") sizeGlobeView();
    if (view === "stacked") sizeStackedView();
  });
});

window.addEventListener("resize", function () { sizeTraditionalView(); sizeGlobeView(); sizeStackedView(); }, { passive: true });
layoutTraditionalGrid();
sizeStackedView();

/* ---- pointer parallax — fine pointers only, never on touch/coarse ------ */
archiveArt.addEventListener("pointermove", function (event) {
  if (archiveFrame.classList.contains("is-expanded") || reduceMotion.matches || !finePointer.matches) return;
  var bounds = archiveArt.getBoundingClientRect();
  var x = (event.clientX - bounds.left) / bounds.width - 0.5;
  var y = (event.clientY - bounds.top) / bounds.height - 0.5;
  archiveArt.style.setProperty("--pointer-x", (x * 5) + "deg");
  archiveArt.style.setProperty("--pointer-y", (y * -4) + "deg");
  archiveArt.style.setProperty("--mx", ((x + 0.5) * 100) + "%");
  archiveArt.style.setProperty("--my", ((y + 0.5) * 100) + "%");
});
archiveArt.addEventListener("pointerleave", function () {
  archiveArt.style.setProperty("--pointer-x", "0deg");
  archiveArt.style.setProperty("--pointer-y", "0deg");
});

/* ---- copy buttons --------------------------------------------------------- */
function flash(btn, label) {
  btn.textContent = label;
  btn.classList.add("done");
  setTimeout(function () {
    btn.textContent = "copy";
    btn.classList.remove("done");
  }, 1600);
}

function fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

document.querySelectorAll(".copy-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var pre = btn.closest(".codeblock").querySelector("pre");
    var text = pre.innerText;
    var done = function () { flash(btn, "copied"); };
    var fail = function () {
      if (fallbackCopy(text)) {
        flash(btn, "copied");
      } else {
        var range = document.createRange();
        range.selectNodeContents(pre);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        flash(btn, "select + ctrl+c");
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  });
});

/* ---- nav: reveal after the stage + scrollspy ------------------------------ */
var siteNav = document.querySelector("nav");
var stageEl = document.querySelector(".stage");
var navLinks = document.querySelectorAll(".nav-links a");
var navPill = document.querySelector(".nav-pill");
var sections = Array.prototype.map.call(navLinks, function (a) {
  return document.querySelector(a.getAttribute("href"));
});

/* fluid sliding indicator under the active nav link, Apple-tab-bar style */
function moveNavPill(link) {
  if (!navPill || !link) return;
  navPill.style.opacity = "1";
  navPill.style.transform = "translateX(" + link.offsetLeft + "px)";
  navPill.style.width = link.offsetWidth + "px";
}

function onScroll() {
  var trigger = stageEl ? stageEl.offsetHeight * 0.65 : 400;
  if (siteNav) siteNav.classList.toggle("is-stuck", window.scrollY > trigger);

  var pos = window.scrollY + 120;
  var current = sections[0];
  sections.forEach(function (sec) {
    if (sec && sec.offsetTop <= pos) current = sec;
  });
  var activeLink = null;
  navLinks.forEach(function (a) {
    var isActive = current && a.getAttribute("href") === "#" + current.id;
    a.classList.toggle("active", isActive);
    if (isActive) activeLink = a;
  });
  moveNavPill(activeLink);
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", function () { moveNavPill(document.querySelector(".nav-links a.active")); }, { passive: true });
onScroll();

/* ---- masthead stat counters: count up to value once revealed -------------- */
function animateCount(el) {
  var raw = el.textContent.trim();
  var match = raw.match(/^(\d+)/);
  if (!match || reduceMotion.matches) return;
  var target = parseInt(match[1], 10);
  var suffix = raw.slice(match[1].length);
  var start = performance.now();
  var duration = 900;
  function tick(now) {
    var t = Math.min(1, (now - start) / duration);
    var eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
var mastheadObserver = new IntersectionObserver(
  function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        mastheadObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll(".mstat .num").forEach(function (el) { mastheadObserver.observe(el); });

/* ---- reveal on scroll ------------------------------------------------------ */
var observer = new IntersectionObserver(
  function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08 }
);
document.querySelectorAll(".reveal").forEach(function (el) { observer.observe(el); });

/* ---- demo reel: poster → click to play → embed ----------------------------- */
function youTubeId(url) {
  if (!url) return null;
  var m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function loadCinema() {
  var cinema = document.getElementById("cinema");
  var stage = document.getElementById("cinemaStage");
  var meta = document.getElementById("cinemaMeta");
  var caption = document.getElementById("cinemaCaption");
  var replayBtn = document.getElementById("cinemaReplay");
  if (!cinema || !stage) return;

  var id = youTubeId(DEMO_VIDEO_URL);

  if (!id) {
    cinema.classList.add("is-bad");
    if (meta) meta.textContent = "no playable id";
    if (caption) caption.textContent = "couldn’t read a YouTube id from the configured link";
    var bad = document.createElement("div");
    bad.className = "cinema-bad";
    bad.innerHTML =
      '<span>No reel to screen — the configured link has no YouTube id.</span>' +
      '<span class="bd-code">' + esc(DEMO_VIDEO_URL || "(empty)") + "</span>";
    var screenEl = document.getElementById("cinemaScreen");
    (screenEl || stage.parentNode).appendChild(bad);
    return;
  }

  if (meta) meta.textContent = id + " · 16:9 · youtube";
  if (caption) caption.textContent = "still · click the reel to roll";

  /* YouTube refuses to play inline when the page has no http referer (e.g. it
     is opened straight from disk as file://). If that is how this page is being
     viewed, surface the fix instead of letting the player silently degrade to
     a "Watch on YouTube" screen. */
  var openedFromDisk = window.location.protocol === "file:";
  if (openedFromDisk) {
    cinema.classList.add("is-bad");
    if (meta) meta.textContent = "file:// — embeds blocked by YouTube";
    if (caption) caption.textContent = "serve over http://localhost, then the reel plays here";
    var diskHint = document.createElement("div");
    diskHint.className = "cinema-bad";
    diskHint.innerHTML =
      "<span>YouTube won’t play inside a page opened from disk.</span>" +
      '<span class="bd-code">cd ' + esc("yt-authentic") + " && python3 -m http.server 8000</span>" +
      '<span class="bd-code">then open http://localhost:8000</span>';
    var screenEl0 = document.getElementById("cinemaScreen");
    (screenEl0 || stage.parentNode).appendChild(diskHint);
    return;
  }

  /* poster stage */
  var poster = document.createElement("img");
  poster.className = "cinema-poster";
  poster.alt = "Poster frame of the Varuna demonstration video";
  poster.loading = "lazy";
  poster.onerror = function () {
    if (poster.src.indexOf("hqdefault") === -1) {
      poster.src = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
    } else {
      poster.style.display = "none";
      stage.classList.add("has-poster-fallback");
    }
  };
  poster.src = "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg";

  var veil = document.createElement("div");
  veil.className = "cinema-veil";

  var play = document.createElement("button");
  play.className = "cinema-play";
  play.type = "button";
  play.setAttribute("aria-label", "Play the demonstration video");
  play.innerHTML = '<span class="play-glyph" aria-hidden="true"></span>';

  var note = document.createElement("div");
  note.className = "cinema-note";
  note.innerHTML =
    '<span class="shot">shot 01 · live run</span>' +
    '<span class="id">' + esc(id) + "</span>";

  stage.appendChild(poster);
  stage.appendChild(veil);
  stage.appendChild(play);
  stage.appendChild(note);

  var hostEl = null;
  var player = null;
  var failed = false;

  /* YT.Player replaces the host element with an <iframe>; after destroy() the
     host is gone, so re-create it whenever playback is (re)started. */
  function ensureHost() {
    if (hostEl && hostEl.isConnected) return hostEl;
    var fresh = document.createElement("div");
    fresh.className = "cinema-embed-host";
    fresh.id = "cinemaHost";
    stage.appendChild(fresh);
    hostEl = fresh;
    return hostEl;
  }

  function destroyPlayer() {
    if (player && player.parentNode) player.parentNode.removeChild(player);
    player = null;
    if (hostEl && hostEl.isConnected) {
      try { hostEl.remove(); } catch (e2) {}
    }
    hostEl = null;
  }

  function showBlocked(code) {
    if (failed) return;
    failed = true;
    destroyPlayer();
    cinema.classList.add("is-owner-blocked");
    if (caption) caption.textContent = "embedding blocked by the video owner";
    var overlay = document.createElement("div");
    overlay.className = "cinema-owner-blocked";
    var msg =
      code === 100 || code === 2
        ? "This video can’t be played here."
        : "This video’s owner has blocked embedding.";
    overlay.innerHTML =
      "<span>" + msg + "</span>" +
      '<a class="owner-link" href="' + esc(DEMO_VIDEO_URL) + '" target="_blank" rel="noreferrer noopener">Watch on YouTube ↗</a>' +
      '<span class="owner-hint">swap DEMO_VIDEO_URL in assets/app.js to feature another reel</span>';
    stage.appendChild(overlay);
    if (replayBtn) { replayBtn.hidden = true; replayBtn.disabled = true; }
  }

  function startPlayback() {
    if (failed) return;
    var host = ensureHost();
    var iframe = document.createElement("iframe");
    var origin = window.location.origin;
    var params = "autoplay=1&playsinline=1&rel=0&color=white";
    if (origin && origin !== "null") params += "&origin=" + encodeURIComponent(origin);
    iframe.className = "cinema-embed";
    iframe.src = "https://www.youtube.com/embed/" + encodeURIComponent(id) + "?" + params;
    iframe.title = "Varuna demonstration video";
    iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.addEventListener("load", function () {
      if (failed) return;
      cinema.classList.add("is-playing");
      play.style.display = "none";
      note.style.display = "none";
      if (caption) caption.textContent = "rolling · the full run, start to finish";
      if (replayBtn) { replayBtn.hidden = false; replayBtn.disabled = false; }
    });
    host.appendChild(iframe);
    player = iframe;
  }

  play.addEventListener("click", startPlayback);

  if (replayBtn) {
    replayBtn.addEventListener("click", function () {
      destroyPlayer();
      failed = false;
      cinema.classList.remove("is-playing");
      cinema.classList.remove("is-owner-blocked");
      var wreck2 = stage.querySelector(".cinema-owner-blocked");
      if (wreck2) wreck2.remove();
      play.style.display = "";
      note.style.display = "";
      if (caption) caption.textContent = "still · click the reel to roll";
      replayBtn.disabled = true;
      replayBtn.hidden = true;
    });
  }
}

/* ---- YouTube IFrame API loader (official, gives us real onError codes) ----- */
function loadYouTubeAPI(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  if (window.__ytApiCallbacks) { window.__ytApiCallbacks.push(cb); return; }
  window.__ytApiCallbacks = [cb];
  var prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    if (prev) prev();
    (window.__ytApiCallbacks || []).forEach(function (fn) { fn(); });
    window.__ytApiCallbacks = [];
  };
  var script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.appendChild(script);
}

loadCinema();

