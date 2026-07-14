/* ============================================================
   Section headings — 3D letter reveal on scroll
   Animates .t-fr and .t-en spans independently so CSS
   language switching (display:none) keeps working at all times.
   ============================================================ */
(function () {
  'use strict';

  /* ── Inject styles ──────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '.sec-reveal-wrap{display:inline-block;vertical-align:bottom;perspective:600px;}',
    '.sec-reveal-char{display:inline-block;opacity:0;',
    '  transform:rotateX(-72deg) translateY(18px);transform-origin:50% 100%;',
    '  transition:opacity 0.55s cubic-bezier(.22,1,.36,1),transform 0.55s cubic-bezier(.22,1,.36,1);}',
    '.sec-reveal-char.in{opacity:1;transform:rotateX(0deg) translateY(0px);}',
    '.sec-reveal-space{display:inline-block;width:0.28em;}'
  ].join('\n');
  document.head.appendChild(style);

  /* ── Split ONE span into animated chars (keeps the span itself) ── */
  function splitSpan(span, color) {
    var text = span.textContent.trim();
    if (!text) return [];
    span.innerHTML = '';
    var chars = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === ' ') {
        var sp = document.createElement('span');
        sp.className = 'sec-reveal-space';
        sp.setAttribute('aria-hidden', 'true');
        span.appendChild(sp);
      } else {
        var wrap  = document.createElement('span');
        wrap.className = 'sec-reveal-wrap';
        var inner = document.createElement('span');
        inner.className = 'sec-reveal-char';
        inner.textContent = ch;
        if (color) inner.style.color = color;
        wrap.appendChild(inner);
        span.appendChild(wrap);
        chars.push(inner);
      }
    }
    return chars;
  }

  /* ── Split element: animate t-fr and t-en spans separately ── */
  function splitEl(el, color) {
    /* querySelectorAll: a title can hold several language spans (e.g. the
       about title has two lines, each with its own .t-fr/.t-en). Animate them all. */
    var frSpans = el.querySelectorAll('.t-fr');
    var enSpans = el.querySelectorAll('.t-en');
    var chars = [];
    frSpans.forEach(function (s) { chars = chars.concat(splitSpan(s, color)); });
    enSpans.forEach(function (s) { chars = chars.concat(splitSpan(s, color)); });
    /* Plain element with no language spans */
    if (!frSpans.length && !enSpans.length) {
      var text = el.textContent.trim();
      if (!text) return [];
      el.innerHTML = '';
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === ' ') {
          var sp2 = document.createElement('span');
          sp2.className = 'sec-reveal-space';
          sp2.setAttribute('aria-hidden', 'true');
          el.appendChild(sp2);
        } else {
          var wrap2  = document.createElement('span');
          wrap2.className = 'sec-reveal-wrap';
          var inner2 = document.createElement('span');
          inner2.className = 'sec-reveal-char';
          inner2.textContent = ch;
          if (color) inner2.style.color = color;
          wrap2.appendChild(inner2);
          el.appendChild(wrap2);
          chars.push(inner2);
        }
      }
    }
    return chars;
  }

  /* ── Trigger reveal with stagger ────────────────────── */
  function reveal(chars) {
    chars.forEach(function (ch, i) {
      setTimeout(function () { ch.classList.add('in'); }, i * 50);
    });
  }

  /* ── Setup ───────────────────────────────────────────── */
  var SELECTORS = ['.works_title', '.about_title', '.xp_title'];

  function setup() {
    var targets = [];
    SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        targets.push(el);
      });
    });
    if (!targets.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        var chars = entry.target._rc;
        if (chars) reveal(chars);
      });
    }, { threshold: 0.3 });

    targets.forEach(function (el) {
      var sec    = el.closest('section');
      var isDark = sec && (
        sec.classList.contains('section-dark') ||
        sec.id === 'skills' || sec.id === 'about'
      );
      var color  = isDark ? '#F8F6F2' : null;
      var chars  = splitEl(el, color);
      el._rc = chars;
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

})();
