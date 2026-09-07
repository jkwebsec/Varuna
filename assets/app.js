/* =========================================================================
   yt-authentic — stage deck + page behaviours
   ========================================================================= */

/* ---- specimen deck data -------------------------------------------------
   Ten comments run through the real decide() ladder in app.py. Ordered by
   the rung that fired, so the "ladder" perspective reads top-to-bottom.
   ------------------------------------------------------------------------ */
var SPECIMENS = [
  {
    verdict: "High", pal: "high", score: 0.90, rule: 1,
    ruleLabel: "Hard scam",
    reason: "Hard scam/contact pattern",
    text: "Lost crypto? I got all of mine back in 48 hours. Free recovery, no upfront fee — join the signal group on telegram @vault_recovery_desk",
    author: "@CryptoRecovery_Desk", meta: "top-level · 0 likes",
    signals: { text: 0.94, account: 0.30, spam: 0.50, coord: 0.00 }
  },
  {
    verdict: "High", pal: "high", score: 0.90, rule: 1,
    ruleLabel: "Hard scam",
    reason: "Hard scam/contact pattern",
    text: "Thanks pal 𝟫𝟪𝟩𝟨𝟧𝟦𝟥𝟤𝟣𝟢 whatsapp me for the daily setups, 100% accurate",
    author: "@TradeSignals_Pro", meta: "reply · 1 like",
    signals: { text: 0.88, account: 0.35, spam: 0.50, coord: 0.20 }
  },
  {
    verdict: "High", pal: "high", score: 0.85, rule: 2,
    ruleLabel: "Account farm",
    reason: "Strong account farm risk",
    text: "Nice video bro keep it up 🔥",
    author: "@user_9931204", meta: "14 comments here · unique-text ratio 0.21",
    signals: { text: 0.41, account: 0.65, spam: 0.00, coord: 0.20 }
  },
  {
    verdict: "Low", pal: "low", score: 0.05, rule: 3,
    ruleLabel: "Too short to judge",
    reason: "Short comment with no scam signal",
    text: "first 🔥🔥",
    author: "@notifsquad", meta: "top-level · 212 likes",
    signals: { text: 0.52, account: 0.00, spam: 0.00, coord: 0.00 }
  },
  {
    verdict: "High", pal: "high", score: 0.75, rule: 4,
    ruleLabel: "Text + support",
    reason: "Strong text suspicion + support",
    text: "Best video on this topic!! Everyone should watch this, amazing content, keep going, already subscribed!!!",
    author: "@growth_engine_yt", meta: "6 comments here · unique-text ratio 0.33",
    signals: { text: 0.93, account: 0.35, spam: 0.00, coord: 0.00 }
  },
  {
    verdict: "Medium", pal: "med", score: 0.45, rule: 5,
    ruleLabel: "Text suspicion",
    reason: "Text suspicion",
    text: "Wow such an informative video, thank you so much for sharing this valuable knowledge with us",
    author: "@shreya.k", meta: "top-level · 3 likes",
    signals: { text: 0.71, account: 0.20, spam: 0.00, coord: 0.00 }
  },
  {
    verdict: "Medium", pal: "med", score: 0.35, rule: 6,
    ruleLabel: "Structural",
    reason: "Structural signals",
    text: "Great breakdown. contact me if you want the spreadsheet I built from this",
    author: "@arjun_builds", meta: "top-level · 8 likes",
    signals: { text: 0.38, account: 0.10, spam: 0.30, coord: 0.00 }
  },
  {
    verdict: "Medium", pal: "med", score: 0.35, rule: 6,
    ruleLabel: "Structural",
    reason: "Structural signals",
    text: "Bhai R2h walo ko bulao ❤️ please bulao unko",
    author: "@r2h_army_fan", meta: "9 identical posts · 4 accounts",
    signals: { text: 0.44, account: 0.50, spam: 0.00, coord: 0.20 }
  },
  {
    verdict: "Low", pal: "low", score: 0.05, rule: 7,
    ruleLabel: "No evidence",
    reason: "No strong bot evidence",
    text: "The part at 12:40 about TF-IDF finally made ngrams click for me. I had been treating min_df as a noise knob when it is really a vocabulary budget.",
    author: "@meera.builds", meta: "top-level · 47 likes",
    signals: { text: 0.11, account: 0.00, spam: 0.00, coord: 0.00 }
  },
  {
    verdict: "Low", pal: "low", score: 0.05, rule: 7,
    ruleLabel: "No evidence",
    reason: "No strong bot evidence",
    text: "Source for the claim at 12:40: https://arxiv.org/abs/1802.09477 — the appendix has the ablation he is describing.",
    author: "@dev_null_", meta: "reply · 12 likes",
    signals: { text: 0.19, account: 0.00, spam: 0.20, coord: 0.00 }
  }
];

var SIGNAL_ORDER = [
  ["text", "text_bot_prob"],
  ["account", "account_risk_score"],
  ["spam", "spam_pattern_score"],
  ["coord", "coordination_score"]
];

var VIEW_LABELS = { stack: "Stacked perspective", ladder: "Ladder perspective", grid: "Contact sheet" };

/* ---- helpers ----------------------------------------------------------- */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function pad2(n) { return String(n).padStart(2, "0"); }
function fixed2(n) { return n.toFixed(2); }

var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---- build the deck ---------------------------------------------------- */
var deck = document.querySelector("#deck");
var expanded = document.querySelector("#expanded");
var closeExpanded = document.querySelector("#closeExpanded");
var stageFrame = document.querySelector("#stageFrame");
var stageArt = document.querySelector("#stageArt");
var selectionLabel = document.querySelector("#selectionLabel");
var lastOpener = null;

if (deck) {
  SPECIMENS.forEach(function (spec, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "spec-card pal-" + spec.pal;
    btn.dataset.index = String(i);
    btn.style.setProperty("--i", String(i));
    btn.style.setProperty("--col", String(i % 5));
    btn.style.setProperty("--row", String(Math.floor(i / 5)));
    btn.setAttribute("aria-label",
      "Specimen " + pad2(i + 1) + ", verdict " + spec.verdict + ", score " + fixed2(spec.score) + ". Open details.");
    btn.innerHTML =
      '<span class="spec-head"><span class="spec-no">Spec ' + pad2(i + 1) + '</span>' +
      '<span class="spec-verdict">' + spec.verdict + '</span></span>' +
      '<span class="spec-text"><q>' + esc(spec.text) + '</q></span>' +
      '<span class="spec-foot"><span class="spec-score">' + fixed2(spec.score) + '</span>' +
      '<span class="spec-rule">Rule ' + spec.rule + '<br>' + esc(spec.ruleLabel) + '</span></span>';
    btn.addEventListener("click", function () { openSpecimen(i, btn); });
    deck.append(btn);
  });
}

/* ---- open / close ------------------------------------------------------ */
function openSpecimen(i, opener) {
  var spec = SPECIMENS[i];
  lastOpener = opener || null;

  var rows = SIGNAL_ORDER.map(function (pair) {
    var key = pair[0], name = pair[1], v = spec.signals[key];
    return '<div class="signal-row">' +
      '<span class="sig-name">' + name + '</span>' +
      '<span class="sig-bar"><span class="sig-fill" style="width:' + Math.round(v * 100) + '%"></span></span>' +
      '<span class="sig-val">' + fixed2(v) + '</span>' +
      '</div>';
  }).join("");

  expanded.innerHTML =
    '<div class="expanded-face pal-' + spec.pal + '">' +
      '<span class="spec-head"><span class="spec-no">Spec ' + pad2(i + 1) + '</span>' +
      '<span class="spec-verdict">' + spec.verdict + '</span></span>' +
      '<span class="spec-text"><q>' + esc(spec.text) + '</q></span>' +
      '<span class="spec-foot"><span class="spec-score">' + fixed2(spec.score) + '</span>' +
      '<span class="spec-rule">Rule ' + spec.rule + '<br>' + esc(spec.ruleLabel) + '</span></span>' +
    '</div>' +
    '<div class="expanded-copy">' +
      '<span class="spec-kicker">Specimen ' + pad2(i + 1) + ' · decide() rule ' + spec.rule + ' of 7</span>' +
      '<h2>' + fixed2(spec.score) + '</h2>' +
      '<div class="expanded-level"><span class="tag ' + spec.pal + '">' + spec.verdict + '</span>' +
        '<span class="spec-kicker">final_risk_level</span></div>' +
      '<blockquote class="expanded-quote">' + esc(spec.text) + '</blockquote>' +
      '<div class="expanded-meta">' + esc(spec.author) + ' · ' + esc(spec.meta) + '</div>' +
      '<div class="signal-readout">' + rows + '</div>' +
      '<p class="expanded-reason"><b>final_reasons</b>' + esc(spec.reason) + '</p>' +
      '<button class="text-button" type="button" id="returnToDeck">Return to collection <span>↗</span></button>' +
    '</div>';

  stageFrame.classList.add("is-expanded");
  expanded.classList.add("is-visible");
  closeExpanded.classList.add("is-visible");
  selectionLabel.textContent = "Specimen " + pad2(i + 1) + " · " + spec.verdict;

  var back = document.querySelector("#returnToDeck");
  back.addEventListener("click", closeSpecimen);
  back.focus();
}

function closeSpecimen() {
  if (!stageFrame.classList.contains("is-expanded")) return;
  stageFrame.classList.remove("is-expanded");
  expanded.classList.remove("is-visible");
  closeExpanded.classList.remove("is-visible");
  selectionLabel.textContent = VIEW_LABELS[stageArt.dataset.view] || VIEW_LABELS.stack;
  if (lastOpener) { lastOpener.focus(); lastOpener = null; }
}

if (closeExpanded) closeExpanded.addEventListener("click", closeSpecimen);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSpecimen(); });

/* ---- perspective switcher ---------------------------------------------- */
document.querySelectorAll(".view-button").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var view = btn.dataset.view;
    document.querySelectorAll(".view-button").forEach(function (b) {
      b.classList.remove("is-active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-pressed", "true");
    stageArt.dataset.view = view;
    if (!stageFrame.classList.contains("is-expanded")) {
      selectionLabel.textContent = VIEW_LABELS[view] || view;
    }
  });
});

/* ---- pointer parallax --------------------------------------------------- */
if (stageArt) {
  stageArt.addEventListener("pointermove", function (e) {
    if (stageFrame.classList.contains("is-expanded") || reduceMotion.matches) return;
    var b = stageArt.getBoundingClientRect();
    var x = (e.clientX - b.left) / b.width - 0.5;
    var y = (e.clientY - b.top) / b.height - 0.5;
    stageArt.style.setProperty("--pointer-x", (x * 5) + "deg");
    stageArt.style.setProperty("--pointer-y", (y * -4) + "deg");
  });
  stageArt.addEventListener("pointerleave", function () {
    stageArt.style.setProperty("--pointer-x", "0deg");
    stageArt.style.setProperty("--pointer-y", "0deg");
  });
}

/* ---- copy buttons (unchanged behaviour) --------------------------------- */
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

/* ---- nav: reveal after the stage + scrollspy ---------------------------- */
var siteNav = document.querySelector("nav");
var stage = document.querySelector(".stage");
var navLinks = document.querySelectorAll(".nav-links a");
var sections = Array.prototype.map.call(navLinks, function (a) {
  return document.querySelector(a.getAttribute("href"));
});

function onScroll() {
  var trigger = stage ? stage.offsetHeight * 0.65 : 400;
  if (siteNav) siteNav.classList.toggle("is-stuck", window.scrollY > trigger);

  var pos = window.scrollY + 120;
  var current = sections[0];
  sections.forEach(function (sec) {
    if (sec && sec.offsetTop <= pos) current = sec;
  });
  navLinks.forEach(function (a) {
    a.classList.toggle("active", current && a.getAttribute("href") === "#" + current.id);
  });
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---- reveal on scroll ---------------------------------------------------- */
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
