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

var navLinks = document.querySelectorAll(".nav-links a");
var sections = Array.from(navLinks).map(function (a) {
  return document.querySelector(a.getAttribute("href"));
});

function onScroll() {
  var pos = window.scrollY + 120;
  var current = sections[0];
  sections.forEach(function (sec) {
    if (sec && sec.offsetTop <= pos) current = sec;
  });
  navLinks.forEach(function (a) {
    a.classList.toggle("active", a.getAttribute("href") === "#" + current.id);
  });
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

var observer = new IntersectionObserver(
  function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  },
  { threshold: 0.08 }
);
document.querySelectorAll(".reveal").forEach(function (el) {
  observer.observe(el);
});
