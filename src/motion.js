/*!
 * motion.js: the animation layer for the Kestrel Heating & Plumbing demo site.
 * Vanilla JS, no libraries. Loaded in <head> (not deferred) so it can mark
 * <html class="mo"> before first paint; it never touches booking, enquiry,
 * language or tracking code, and switches itself off with
 * prefers-reduced-motion or on any error. Styles: motion.css.
 */
(function () {
  /* ── Motion core: the same small engine on every demo site ──────────────
     Progressive enhancement: this file runs in <head>. Only when the browser
     can animate (and the visitor has not asked for reduced motion) does it add
     .mo to <html>, and only then is anything hidden-until-revealed. Without JS,
     with reduced motion, or if anything here throws, the page is the page. */
  'use strict';
  var doc = document, root = doc.documentElement, W = window;
  var mm = function (q) { try { return W.matchMedia(q).matches; } catch (e) { return false; } };
  var REDUCE = mm('(prefers-reduced-motion: reduce)');
  var CAN = 'IntersectionObserver' in W && 'requestAnimationFrame' in W && typeof Element !== 'undefined' &&
    'animate' in Element.prototype && W.CSS && CSS.supports && CSS.supports('translate', '1px') && CSS.supports('clip-path', 'inset(0)');
  var ON = !!(CAN && !REDUCE);
  var FINE = mm('(hover: hover) and (pointer: fine)');
  var EASE = 'cubic-bezier(.16, 1, .3, 1)';      // expo out: fast, then a long settle
  var EASE_IO = 'cubic-bezier(.65, 0, .35, 1)';  // in-out for travelling things
  var SPRING = 'cubic-bezier(.34, 1.56, .64, 1)'; // a little overshoot
  var inited = false;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function outExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function inOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function svg(markup) {
    var t = doc.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }

  /* Reveal variants: keyframes for the Web Animations API. They use the
     individual translate / scale / rotate properties and clip-path, so they
     never fight a site's own `transform` hovers or `transition` lists. */
  var V = {
    rise: [{ opacity: 0, translate: '0 42px' }, { opacity: 1, translate: '0 0' }],
    riseSm: [{ opacity: 0, translate: '0 18px' }, { opacity: 1, translate: '0 0' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    left: [{ opacity: 0, translate: '-56px 0' }, { opacity: 1, translate: '0 0' }],
    right: [{ opacity: 0, translate: '56px 0' }, { opacity: 1, translate: '0 0' }],
    zoom: [{ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }],
    pop: [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }],
    blur: [{ opacity: 0, filter: 'blur(14px)', translate: '0 14px' }, { opacity: 1, filter: 'blur(0px)', translate: '0 0' }],
    tilt: [{ opacity: 0, translate: '0 64px', rotate: '-2.5deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }],
    tiltR: [{ opacity: 0, translate: '0 64px', rotate: '2.5deg' }, { opacity: 1, translate: '0 0', rotate: '0deg' }],
    wipe: [{ opacity: 1, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)' }],
    wipeL: [{ opacity: 1, clipPath: 'inset(0 0 0 100%)' }, { opacity: 1, clipPath: 'inset(0 0 0 0%)' }],
    wipeUp: [{ opacity: 1, clipPath: 'inset(100% 0 0 0)', translate: '0 24px' }, { opacity: 1, clipPath: 'inset(0% 0 0 0)', translate: '0 0' }],
    wipeDown: [{ opacity: 1, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, clipPath: 'inset(0 0 0% 0)' }],
    curtain: [{ opacity: 1, clipPath: 'inset(10% 10% 10% 10% round 28px)', scale: 1.06 }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)', scale: 1 }],
    iris: [{ opacity: 1, clipPath: 'circle(0% at 50% 50%)' }, { opacity: 1, clipPath: 'circle(75% at 50% 50%)' }],
  };

  /* ── Reveal on scroll ── */
  var io = null;
  function reveal(el, v, delay, dur) {
    if (!el || el.__moDone) return null;
    el.__moDone = true;
    el.classList.add('mo-in');
    var kf = typeof v === 'function' ? v(el) : (V[v] || V.rise);
    var a = null;
    try { a = el.animate(kf, { duration: dur || 1000, delay: delay || 0, easing: EASE, fill: 'backwards' }); } catch (e) { /* shown anyway */ }
    if (el.__moThen) { try { el.__moThen(el, delay || 0); } catch (e) { /* decoration only */ } }
    return a;
  }
  function watch(el, v, opts) {
    opts = opts || {};
    if (!el || el.__moWatched) return;
    el.__moWatched = true;
    el.__moV = v; el.__moDelay = opts.delay || 0; el.__moDur = opts.dur; el.__moStagger = opts.stagger == null ? 90 : opts.stagger;
    if (opts.then) el.__moThen = opts.then;
    if (io) io.observe(el); else reveal(el, v);
  }
  function startIO() {
    io = new IntersectionObserver(function (entries) {
      var hits = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      hits.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
      var n = 0;
      hits.forEach(function (el) {
        io.unobserve(el);
        reveal(el, el.__moV, el.__moDelay + n * el.__moStagger, el.__moDur);
        n++;
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  }

  /* ── Words: a headline rises word by word, each from behind its own mask.
     The spans stay (no reflow at the end); a language switch that rewrites
     the element simply drops them. ── */
  function splitWords(el) {
    var words = [];
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!/\S/.test(node.nodeValue)) return;
      var frag = doc.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
        var w = doc.createElement('span'); w.className = 'mo-w';
        var i = doc.createElement('span'); i.className = 'mo-wi'; i.textContent = part;
        w.appendChild(i); frag.appendChild(w); words.push(i);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return words;
  }
  function words(el, delay, step) {
    if (!el) return 0;
    var ws = splitWords(el);
    el.classList.add('mo-in');
    el.__moDone = true;
    ws.forEach(function (w, i) {
      w.animate([{ translate: '0 115%', rotate: '4deg' }, { translate: '0 0', rotate: '0deg' }],
        { duration: 1100, delay: delay + i * (step || 70), easing: EASE, fill: 'backwards' });
    });
    var end = delay + ws.length * (step || 70) + 1100;
    setTimeout(function () { el.classList.add('mo-wdone'); }, end);
    return end;
  }

  /* ── Counters: the first number in an element counts up to itself. Only
     that text node changes, and it always ends on the exact original text.
     If anything else rewrites it meanwhile (a language switch), we stop. ── */
  function count(el, dur, delay) {
    if (!el || el.__moCounted) return;
    el.__moCounted = true;
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), node = null;
    while (walker.nextNode()) { if (/\d/.test(walker.currentNode.nodeValue)) { node = walker.currentNode; break; } }
    if (!node) return;
    var orig = node.nodeValue;
    var m = orig.match(/\d[\d.,]*/);
    if (!m) return;
    var tok = m[0].replace(/[.,]$/, '');
    var thou = /^\d{1,3}([.,]\d{3})+$/.test(tok) ? tok.charAt(tok.search(/[.,]/)) : '';
    var dec = !thou && /[.,]/.test(tok) ? tok.charAt(tok.search(/[.,]/)) : '';
    var digits = dec ? tok.split(dec)[1].length : 0;
    var target = parseFloat(thou ? tok.split(thou).join('') : dec ? tok.replace(dec, '.') : tok);
    if (!isFinite(target) || target === 0) return;
    var pre = orig.slice(0, m.index), post = orig.slice(m.index + tok.length);
    function fmt(v) {
      var s = v.toFixed(digits);
      if (dec) s = s.replace('.', dec);
      if (thou) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
      return pre + s + post;
    }
    var last = fmt(0), t0 = null;
    node.nodeValue = last;
    dur = dur || 1400;
    function step(t) {
      if (!node.isConnected || node.nodeValue !== last) return; // someone else wrote here
      if (t0 === null) t0 = t + (delay || 0);
      var p = clamp((t - t0) / dur, 0, 1);
      last = p >= 1 ? orig : fmt(target * outExpo(p));
      node.nodeValue = last;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Scroll-linked work, batched into one rAF per frame ── */
  var scrollFns = [], ticking = false;
  function onScroll(fn) { scrollFns.push(fn); }
  function tick() {
    ticking = false;
    var vh = W.innerHeight || root.clientHeight, vw = root.clientWidth;
    for (var i = 0; i < scrollFns.length; i++) { try { scrollFns[i](vh, vw); } catch (e) { /* keep the others going */ } }
  }
  function kick() { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }
  /** 0 when the element's top is at a·vh, 1 when it is at b·vh. */
  function enter(el, a, b, vh) { var r = el.getBoundingClientRect(); return clamp((vh * a - r.top) / (vh * (a - b)), 0, 1); }
  /** 0 when the element enters at the bottom, 1 when it leaves at the top. */
  function through(el, vh) { var r = el.getBoundingClientRect(); return clamp((vh - r.top) / (vh + r.height), 0, 1); }
  function visible(el, vh) { var r = el.getBoundingClientRect(); return r.bottom > -80 && r.top < vh + 80; }

  /* A band (usually a dark section) that opens out to full width as it comes in. */
  function band(el) {
    if (!el) return;
    onScroll(function (vh, vw) {
      var p = enter(el, 1.02, 0.55, vh);
      if (p >= 1) { if (el.style.clipPath) el.style.clipPath = ''; return; }
      var m = (1 - outExpo(p)) * Math.min(56, vw * 0.03), r = (1 - p) * 36;
      el.style.clipPath = 'inset(0 ' + m.toFixed(1) + 'px round ' + r.toFixed(1) + 'px)';
    });
  }

  /* Parallax: moves an element by `k` px per px its parent scrolls. */
  function parallax(el, k, ref) {
    if (!el) return;
    ref = ref || el.parentElement || el;
    onScroll(function (vh) {
      if (!visible(ref, vh)) return;
      var r = ref.getBoundingClientRect();
      var c = r.top + r.height / 2 - vh / 2;
      el.style.translate = '0 ' + (-c * k).toFixed(1) + 'px';
    });
  }

  /* ── Smooth, eased anchor scrolling that respects the sticky header ── */
  function headerOffset() {
    var sp = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    var h = 0;
    $$('header, .nav, .top').forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position === 'sticky' || cs.position === 'fixed') h = Math.max(h, el.offsetHeight);
    });
    return Math.max(sp, h + 12);
  }
  var scrollAnim = null;
  function scrollToY(y, cb) {
    var start = W.scrollY, dist = y - start, t0 = null;
    var dur = clamp(Math.abs(dist) * 0.45, 450, 1150);
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    var stop = function () { scrollAnim = null; root.style.scrollBehavior = prev; W.removeEventListener('wheel', stop); W.removeEventListener('touchstart', stop); };
    W.addEventListener('wheel', stop, { passive: true });
    W.addEventListener('touchstart', stop, { passive: true });
    var id = {};
    scrollAnim = id;
    function step(t) {
      if (scrollAnim !== id) return;
      if (t0 === null) t0 = t;
      var p = clamp((t - t0) / dur, 0, 1);
      W.scrollTo(0, start + dist * inOut(p));
      if (p < 1) requestAnimationFrame(step); else { stop(); if (cb) cb(); }
    }
    requestAnimationFrame(step);
  }
  function smoothAnchors() {
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a || a.target === '_blank') return;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
      var id = decodeURIComponent(url.hash.slice(1));
      if (!id) return;
      var target = doc.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var y = target.getBoundingClientRect().top + W.scrollY - headerOffset();
      scrollToY(Math.max(0, y), function () {
        try { history.pushState(null, '', '#' + id); } catch (err) { /* file:// */ }
        if (!target.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
        try { target.focus({ preventScroll: true }); } catch (err) { /* old browser */ }
      });
    });
  }

  /* ── Hover and press micro-interactions (desktop pointers only for hover) ── */
  function magnetic(sel, strength) {
    if (!FINE) return;
    $$(sel).forEach(function (el) {
      var x = 0, y = 0, tx = 0, ty = 0, raf = 0;
      function loop() {
        x = lerp(x, tx, 0.18); y = lerp(y, ty, 0.18);
        el.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
        if (Math.abs(x - tx) > 0.05 || Math.abs(y - ty) > 0.05) raf = requestAnimationFrame(loop);
        else { raf = 0; if (!tx && !ty) el.style.translate = ''; }
      }
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - r.left - r.width / 2) * (strength || 0.22);
        ty = (e.clientY - r.top - r.height / 2) * (strength || 0.22) * 1.3;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
    });
  }
  function press(sel) {
    doc.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest(sel);
      if (!el) return;
      try { el.animate([{ scale: 1 }, { scale: 0.95 }, { scale: 1 }], { duration: 380, easing: EASE }); } catch (err) { /* fine */ }
    });
  }
  /* A soft light that follows the pointer across a card (CSS reads --mx/--my). */
  function spotlight(sel) {
    if (!FINE) return;
    doc.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  /* Draw an SVG stroke: from nothing to whole. */
  function draw(path, dur, delay, ease) {
    if (!path) return null;
    path.setAttribute('pathLength', '1');
    path.style.strokeDasharray = '1 3';
    var a = path.animate([{ strokeDashoffset: 1.02 }, { strokeDashoffset: 0 }], { duration: dur || 1400, delay: delay || 0, easing: ease || EASE_IO, fill: 'both' });
    return a;
  }

  /* ── Boot ── */
  var hideCss = [];
  function hide(sel) { hideCss.push('html.mo ' + sel + ':not(.mo-in)'); }
  function boot(cfg) {
    // Before first paint: what will be revealed starts hidden.
    if (ON) {
      root.classList.add('mo');
      (cfg.reveal || []).forEach(function (r) { hide(r[0]); });
      (cfg.hero || []).forEach(function (r) { hide(r[0]); });
      var st = doc.createElement('style');
      st.setAttribute('data-motion', '');
      st.textContent = hideCss.join(',\n') + ' { opacity: 0; }\n@media print { html.mo * { opacity: 1 !important; } }';
      (doc.head || root).appendChild(st);
      // If the page never gets as far as init, give the content back.
      setTimeout(function () { if (!inited) root.classList.remove('mo'); }, 5000);
    } else {
      root.classList.add(REDUCE ? 'mo-reduce' : 'mo-off');
    }
    function init() {
      if (inited) return;
      inited = true;
      try {
        if (ON) {
          startIO();
          (cfg.reveal || []).forEach(function (r) {
            $$(r[0]).forEach(function (el) { watch(el, r[1], r[2]); });
          });
          (cfg.counters || []).forEach(function (c) {
            $$(c[0]).forEach(function (el) {
              var prev = el.__moThen;
              if (el.__moWatched) {
                el.__moThen = function (x, d) { if (prev) prev(x, d); count(x, c[1], d + (c[2] || 150)); };
              } else {
                var cio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { cio.disconnect(); count(el, c[1], c[2] || 0); } }); }, { rootMargin: '0px 0px -10% 0px' });
                cio.observe(el);
              }
            });
          });
          (cfg.bands || []).forEach(function (s) { $$(s).forEach(band); });
          smoothAnchors();
          if (cfg.magnetic) magnetic(cfg.magnetic, cfg.magneticStrength);
          if (cfg.press) press(cfg.press);
          if (cfg.spotlight) spotlight(cfg.spotlight);
          W.addEventListener('scroll', kick, { passive: true });
          W.addEventListener('resize', kick, { passive: true });
        }
        if (cfg.site) cfg.site({ ON: ON, REDUCE: REDUCE });
        if (ON) {
          var go = function () {
            if (go.done) return; go.done = true;
            (cfg.hero || []).forEach(function (h) {
              var el = $(h[0]);
              if (!el) return;
              if (h[1] === 'words') words(el, h[2] || 0, h[3]);
              else reveal(el, h[1], h[2] || 0, h[3]);
            });
            if (cfg.afterHero) cfg.afterHero();
            kick();
          };
          // Wait (briefly) for the web fonts so the headline does not reflow mid-animation.
          if (doc.fonts && doc.fonts.ready) { doc.fonts.ready.then(go, go); setTimeout(go, 450); } else go();
        }
      } catch (err) {
        root.classList.remove('mo');
        if (W.console && console.warn) console.warn('motion: switched off', err);
      }
    }
    // After every other DOMContentLoaded handler (language, booking, listings).
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
    else setTimeout(init, 0);
  }

  /* ── Kestrel: the pressure gauge climbs to 1.3 bar on a spring, the burner
     flame flickers, and water runs along a copper pipe as you scroll ── */
  var ROT0 = 135, PER_BAR = 67.5; // needle angle at 0 bar, degrees per bar (0 to 4 bar over 270°)

  function gaugeScene() {
    var needle = $('.g-needle'), read = $('.g-read');
    if (!needle || !read) return null;
    var target = parseFloat(read.textContent) || 1.3;
    var orig = read.textContent;
    var restRot = ROT0 + target * PER_BAR;
    // A soft glow behind the healthy band, lit when the needle settles.
    var ok = $('.g-ok'), glow = null;
    if (ok) {
      glow = ok.cloneNode(false);
      glow.setAttribute('class', 'mo-ok-glow');
      ok.parentNode.insertBefore(glow, ok);
    }
    var rot = ROT0, vel = 0, goal = ROT0, bump = 0, settled = false, last = null, live = true;
    needle.style.transform = 'rotate(' + rot + 'deg)';
    read.textContent = '0.0';
    function step(t) {
      if (last === null) last = t;
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      // A damped spring: quick climb, one honest overshoot, settle.
      var k = 24, c = 5.2;
      var acc = k * (goal + bump - rot) - c * vel;
      vel += acc * dt; rot += vel * dt;
      bump *= Math.pow(0.08, dt); // scroll pressure fades back out
      var flutter = settled ? Math.sin(t / 380) * 0.35 + Math.sin(t / 157) * 0.18 : 0;
      needle.style.transform = 'rotate(' + (rot + flutter).toFixed(2) + 'deg)';
      var near = Math.abs(rot - restRot) < 0.6 && Math.abs(vel) < 1.5 && bump < 0.5;
      read.textContent = near ? orig : Math.max(0, (rot - ROT0) / PER_BAR).toFixed(1);
      if (!settled && goal === restRot && near) {
        settled = true;
        if (glow) glow.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0.18 }], { duration: 1600, easing: 'ease-out', fill: 'forwards' });
      }
      if (live && !doc.hidden) requestAnimationFrame(step); else last = null;
    }
    return {
      start: function (delay) { setTimeout(function () { goal = restRot; requestAnimationFrame(step); }, delay); },
      push: function (v) { if (settled) bump = Math.min(13.5, bump + v); },
      setLive: function (on) { var was = live; live = on; if (on && !was && goal === restRot) requestAnimationFrame(step); },
    };
  }

  function flame(wrap) {
    var b = svg('<span class="mo-burner mo-deco" aria-hidden="true"><svg xmlns="' + SVGNS + '" viewBox="0 0 48 48" focusable="false">' +
      '<defs><radialGradient id="mo-fl-glow"><stop offset="0" stop-color="#F06A22" stop-opacity=".55"/><stop offset="1" stop-color="#F06A22" stop-opacity="0"/></radialGradient></defs>' +
      '<circle class="mo-fl-glow" cx="24" cy="30" r="22" fill="url(#mo-fl-glow)"/>' +
      '<path class="mo-fl mo-fl-o" d="M24 6 C 30 15, 36 21, 36 29 A 12 12 0 0 1 12 29 C 12 23, 16 19, 18 14 C 20 18, 21 20, 23 21 C 22 15, 22 11, 24 6 Z" fill="#F06A22"/>' +
      '<path class="mo-fl mo-fl-m" d="M24 15 C 28 21, 31 25, 31 30 A 7 7 0 0 1 17 30 C 17 26, 20 23, 21 20 C 22 23, 23 24, 24 25 C 24 21, 23 18, 24 15 Z" fill="#FFB547"/>' +
      '<path class="mo-fl mo-fl-i" d="M24 25 C 26.5 28, 28 30, 28 32.5 A 4 4 0 0 1 20 32.5 C 20 30, 21.5 28, 24 25 Z" fill="#7CC4FF"/>' +
      '<rect x="14" y="40" width="20" height="3" rx="1.5" fill="#5A6573"/>' +
      '</svg></span>');
    wrap.appendChild(b);
    return b;
  }
  function flicker(b) {
    var rnd = function (a, z) { return a + Math.random() * (z - a); };
    [['.mo-fl-o', 1.0, 900], ['.mo-fl-m', 0.9, 640], ['.mo-fl-i', 0.6, 1100]].forEach(function (L) {
      var el = $(L[0], b), kf = [];
      for (var i = 0; i <= 8; i++) {
        var sy = i === 0 || i === 8 ? 1 : rnd(0.86, 1.12), sx = i === 0 || i === 8 ? 1 : rnd(0.92, 1.06), sk = i === 0 || i === 8 ? 0 : rnd(-5, 5) * L[1];
        kf.push({ transform: 'scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ') skewX(' + sk.toFixed(2) + 'deg)' });
      }
      el.animate(kf, { duration: L[2] * 2.2, iterations: Infinity, easing: 'ease-in-out' });
    });
    $('.mo-fl-glow', b).animate([{ opacity: 0.6 }, { opacity: 1 }, { opacity: 0.7 }, { opacity: 0.95 }, { opacity: 0.6 }], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' });
  }

  /* The pipe: copper along the top of the "no heating?" section. The water
     fills it as the section comes in, then runs (and drips) as you scroll. */
  function pipe(section) {
    var box = doc.createElement('div');
    box.className = 'mo-pipe mo-deco';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<svg xmlns="' + SVGNS + '" focusable="false">' +
      '<defs><clipPath id="mo-water-clip"><rect class="mo-water-fill" x="0" y="0" width="0" height="80"/></clipPath>' +
      '<linearGradient id="mo-copper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9A36A"/><stop offset=".45" stop-color="#C2763A"/><stop offset="1" stop-color="#7A4320"/></linearGradient></defs>' +
      '<path class="mo-pipe-shadow" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="mo-pipe-body" fill="none" stroke="#B5682F" stroke-width="18" stroke-linecap="butt" stroke-linejoin="round"/>' +
      '<g class="mo-joints"></g>' +
      '<g clip-path="url(#mo-water-clip)"><path class="mo-water-bed" fill="none" stroke="#2E8FC0" stroke-opacity=".9" stroke-width="6"/><path class="mo-water" fill="none" stroke="#8FDCF8" stroke-width="3" stroke-linecap="round" stroke-dasharray="10 16"/></g>' +
      '<path class="mo-pipe-shine" fill="none" stroke="#FFD9B5" stroke-opacity=".7" stroke-width="2.5" stroke-linecap="round"/>' +
      '<g class="mo-valve-body"><rect x="-13" y="-14" width="26" height="28" rx="4" fill="#8C8F94"/><rect x="-4" y="-27" width="8" height="14" fill="#6B7178"/></g>' +
      '<g class="mo-valve"><circle r="12" fill="none" stroke="#C2410C" stroke-width="3.5"/><path d="M0 -12 V12 M-12 0 H12" stroke="#C2410C" stroke-width="2.5"/><circle r="3.5" fill="#16202A" stroke="#C2410C" stroke-width="2"/></g>' +
      '<g class="mo-drops" fill="#5EC8F2"></g>' +
      '</svg>';
    section.insertBefore(box, section.firstChild);
    var s = box.firstChild;
    var P = { box: box, s: s, body: $('.mo-pipe-body', s), shadow: $('.mo-pipe-shadow', s), shine: $('.mo-pipe-shine', s), water: $('.mo-water', s),
      fill: $('.mo-water-fill', s), bed: $('.mo-water-bed', s), joints: $('.mo-joints', s), valve: $('.mo-valve', s), drops: $('.mo-drops', s), W: 0, tap: [0, 0] };
    function layout() {
      var W = box.clientWidth, y = 40, end = W - Math.min(120, W * 0.14);
      if (!W || W === P.W) return;
      P.W = W;
      s.setAttribute('width', W); s.setAttribute('height', 88);
      var d = 'M-10 ' + y + ' H' + (end - 20) + ' Q' + end + ' ' + y + ' ' + end + ' ' + (y + 20) + ' V64';
      [P.body, P.shadow, P.water, P.bed].forEach(function (p) { p.setAttribute('d', d); });
      P.shadow.setAttribute('transform', 'translate(0 3)');
      P.shine.setAttribute('d', 'M-10 ' + (y - 5) + ' H' + (end - 24));
      P.tap = [end, 68];
      var j = '';
      var vx = Math.round(end * 0.5);
      for (var x = 160; x < end - 60; x += 260) if (Math.abs(x - vx) > 50) j += '<rect x="' + (x - 8) + '" y="' + (y - 12) + '" width="16" height="24" rx="3" fill="#94531F"/>';
      j += '<rect x="' + (end - 12) + '" y="62" width="24" height="8" rx="2" fill="#5A6573"/>';
      P.joints.innerHTML = j;
      $('.mo-valve-body', s).setAttribute('transform', 'translate(' + vx + ' ' + y + ')');
      P.vx = vx; P.vy = y - 27;
      P.valve.setAttribute('transform', 'translate(' + P.vx + ' ' + P.vy + ')');
    }
    layout();
    W.addEventListener('resize', layout, { passive: true });
    return P;
  }
  function drip(P) {
    var c = doc.createElementNS(SVGNS, 'path');
    c.setAttribute('d', 'M0 -5 C 2.5 -1.5, 4 1, 4 3 A 4 4 0 0 1 -4 3 C -4 1, -2.5 -1.5, 0 -5 Z');
    P.drops.appendChild(c);
    var x = P.tap[0], y = P.tap[1] + 3;
    var a = c.animate([
      { transform: 'translate(' + x + 'px,' + y + 'px) scale(.2)', opacity: 1 },
      { transform: 'translate(' + x + 'px,' + (y + 2) + 'px) scale(1)', opacity: 1, offset: 0.35, easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: 'translate(' + x + 'px,' + (y + 18) + 'px) scale(.9, 1.2)', opacity: 0 },
    ], { duration: 900 });
    a.onfinish = function () { c.remove(); };
  }

  boot({
    hero: [
      ['.hero .kicker', 'riseSm', 0, 800],
      ['.hero h1', 'words', 100, 60],
      ['.hero .lede', 'blur', 560, 1000],
      ['.hero-actions', 'riseSm', 720],
      ['.hero .proof', 'fade', 860, 900],
      ['.hero .panel', 'right', 220, 1300],
    ],
    reveal: [
      ['.checks .section-head', 'rise'],
      ['.check-list > li', 'wipeUp', { stagger: 150, dur: 1100 }],
      ['.checks-cta', 'riseSm'],
      ['#prices .section-head', 'rise'],
      ['.price-table', 'fade', { dur: 600 }],
      ['.pt-row', 'left', { stagger: 85 }],
      ['.book-side h2', 'wipeUp'],
      ['.book-side > p', 'riseSm', { delay: 100 }],
      ['.book-side .ticks > li', 'left', { stagger: 90 }],
      ['.areas-grid > div:first-child', 'rise'],
      ['.postcodes > li', 'zoom', { stagger: 60 }],
      ['.reviews .section-head', 'rise'],
      ['.review', function (el) { return Array.prototype.indexOf.call(el.parentNode.children, el) % 2 ? V.tiltR : V.tilt; }, { stagger: 100 }],
      ['.about-copy', 'left'],
      ['.team > li', 'right', { stagger: 110, then: function (el, d) {
        var av = el.querySelector('.avatar');
        if (av) av.animate([{ rotate: '-180deg', scale: 0.3 }, { rotate: '0deg', scale: 1 }], { duration: 1000, delay: d + 150, easing: SPRING, fill: 'backwards' });
      } }],
      ['.quote-grid > div', 'left'],
      ['.quote-form', 'riseSm', { delay: 120 }],
      ['.foot-grid > div', 'riseSm', { stagger: 100 }],
    ],
    counters: [['.proof b', 1300, 1000], ['.pt-price', 1000, 250], ['.score b', 1200, 200]],
    bands: ['.book'],
    magnetic: '.hero .btn-lg, .nav-book',
    press: '.btn',
    spotlight: '.review',
    site: function (m) {
      var wrap = $('.gauge-wrap');
      var b = wrap ? flame(wrap) : null;
      var checks = $('.checks');
      var P = checks ? pipe(checks) : null;
      if (!m.ON) {
        if (P) { P.fill.setAttribute('width', '100000'); }
        return;
      }
      var g = gaugeScene();
      if (g) {
        g.start(900);
        new IntersectionObserver(function (es) { g.setLive(es[0].isIntersecting); }).observe($('.gauge'));
      }
      if (b) {
        flicker(b);
        b.animate([{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }], { duration: 900, delay: 1300, easing: SPRING, fill: 'backwards' });
      }
      var lastY = W.scrollY, lastDrip = 0, full = false, idle = null;
      onScroll(function (vh) {
        var y = W.scrollY, dy = y - lastY;
        lastY = y;
        if (g && dy) g.push(Math.min(4, Math.abs(dy) * 0.05));
        if (!P || !visible(P.box, vh)) return;
        var p = enter(checks, 1.05, 0.45, vh);
        P.fill.setAttribute('width', String(Math.round((P.W + 40) * outExpo(p))));
        P.water.style.strokeDashoffset = String((-y * 0.5).toFixed(1));
        P.valve.setAttribute('transform', 'translate(' + P.vx + ' ' + P.vy + ') rotate(' + (y * 0.4).toFixed(1) + ')');
        full = p > 0.97;
        var now = performance.now();
        if (full && Math.abs(dy) > 1 && now - lastDrip > 280) { lastDrip = now; drip(P); }
      });
      // A slow drip when the page is still and the pipe is full.
      idle = setInterval(function () { if (full && P && !doc.hidden && visible(P.box, W.innerHeight)) drip(P); }, 2600);
    },
  });
})();
