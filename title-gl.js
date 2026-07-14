/* ============================================================
   Title WebGL — Per-Letter Lens Refraction
   Each character has its own displacement bubble
   ============================================================ */
(function () {
  'use strict';

  if (!window.WebGLRenderingContext) return;

  /* ── GLSL ─────────────────────────────────────────────────── */

  var VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* Per-letter: each letter has its own lens that activates
     when the cursor is nearby. Max 10 chars (Hulya+Zorlu=10). */
  var FS = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec2  uMouse;',
    'uniform vec2  uRes;',
    'uniform float uStr;',
    'uniform vec2  uLetters[10];',
    'uniform float uLetterR;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2  uv  = vUv;',
    '  float ar  = uRes.x / uRes.y;',
    '  vec2  m   = vec2(uMouse.x/uRes.x, 1.0-uMouse.y/uRes.y);',
    '  float lr  = uLetterR / uRes.y;',   /* letter radius in UV  */
    '  float cr  = lr * 0.9;',            /* cursor influence zone — tight so only nearest letter activates */
    '  vec2  off = vec2(0.0);',
    '  for(int i=0;i<10;i++){',
    '    vec2 lp = uLetters[i];',
    /* cursor → letter distance (how much this letter activates) */
    '    vec2 cd = (m - lp) * vec2(ar,1.0);',
    '    float cg = exp(-dot(cd,cd)/(2.0*cr*cr));',
    /* pixel → letter distance (where pixels are displaced) */
    '    vec2 pd = (uv - lp) * vec2(ar,1.0);',
    '    float pg = exp(-dot(pd,pd)/(2.0*lr*lr));',
    /* displace outward from cursor */
    '    vec2 dir = normalize((uv-m)*vec2(ar,1.0)+vec2(0.0001));',
    '    off += dir * (uStr/uRes.y) * cg * pg;',
    '  }',
    '  gl_FragColor = texture2D(uTex, uv + off);',
    '}'
  ].join('\n');

  /* ── GL helpers ───────────────────────────────────────────── */

  function mkShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function mkProgram(gl) {
    var p = gl.createProgram();
    gl.attachShader(p, mkShader(gl, gl.VERTEX_SHADER,   VS));
    gl.attachShader(p, mkShader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    return p;
  }

  /* ── Text → texture ────────────────────────────────────────── */

  function buildTexture(gl, titleEl) {
    var dpr  = Math.min(window.devicePixelRatio || 1, 2);
    var rect = titleEl.getBoundingClientRect();
    var W    = Math.round(rect.width);
    var H    = Math.round(rect.height);
    if (!W || !H) return null;

    var off = document.createElement('canvas');
    off.width  = W * dpr;
    off.height = H * dpr;
    var ctx = off.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#F8F6F2';
    ctx.fillRect(0, 0, W, H);

    var fs = parseFloat(window.getComputedStyle(titleEl).fontSize);
    var ls = -0.03 * fs;
    ctx.fillStyle    = '#0A0A0A';
    ctx.font         = '400 ' + fs + 'px montrealbook, sans-serif';
    ctx.textBaseline = 'alphabetic';

    titleEl.querySelectorAll('.ttj').forEach(function (row) {
      var rr   = row.getBoundingClientRect();
      var text = row.textContent.replace(/\s/g, '');
      var m    = ctx.measureText(text);
      var desc = (typeof m.actualBoundingBoxDescent === 'number')
                  ? m.actualBoundingBoxDescent : fs * 0.18;
      var x = rr.left - rect.left;
      var y = rr.bottom - rect.top - desc;
      for (var i = 0; i < text.length; i++) {
        ctx.fillText(text[i], x, y);
        x += ctx.measureText(text[i]).width + ls;
      }
    });

    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
    return t;
  }

  /* ── State ────────────────────────────────────────────────── */

  var glCanvas, gl, uMouse, uRes, uStr, uLettersLoc, uLetterR, tex;
  var mx = -999, my = -999, targetX = -999, targetY = -999;
  var titleEl;

  /* ── Letter UV positions ──────────────────────────────────── */

  function uploadLetterPositions() {
    if (!gl || !glCanvas || !titleEl) return;
    var cr   = glCanvas.getBoundingClientRect();
    var chars = titleEl.querySelectorAll('.ttj .char');
    var data  = new Float32Array(20); /* 10 × vec2 */
    for (var k = 0; k < 20; k++) data[k] = -2.0; /* default: off-screen */

    chars.forEach(function (ch, i) {
      if (i >= 10) return;
      var r = ch.getBoundingClientRect();
      /* UV x: left→right, UV y: flipped (WebGL Y=0 is bottom) */
      data[i * 2]     = (r.left + r.width  / 2 - cr.left) / cr.width;
      data[i * 2 + 1] = 1.0 - (r.top + r.height / 2 - cr.top) / cr.height;
    });
    gl.uniform2fv(uLettersLoc, data);

    /* letter radius ≈ 55% of char height in canvas pixels */
    var firstChar = titleEl.querySelector('.ttj .char');
    if (firstChar && uLetterR) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var charH = firstChar.getBoundingClientRect().height;
      gl.uniform1f(uLetterR, charH * 0.55 * dpr);
    }
  }

  /* ── Resize ───────────────────────────────────────────────── */

  function resize() {
    if (!gl || !titleEl || !glCanvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var tr  = titleEl.getBoundingClientRect();
    var pr  = glCanvas.parentElement.getBoundingClientRect();
    var W   = Math.round(tr.width);
    var H   = Math.round(tr.height);

    glCanvas.width  = W * dpr;
    glCanvas.height = H * dpr;
    glCanvas.style.width  = W + 'px';
    glCanvas.style.height = H + 'px';
    glCanvas.style.left   = Math.round(tr.left - pr.left) + 'px';
    glCanvas.style.top    = Math.round(tr.top  - pr.top)  + 'px';

    gl.viewport(0, 0, W * dpr, H * dpr);
    if (uRes) gl.uniform2f(uRes, W * dpr, H * dpr);

    if (tex) gl.deleteTexture(tex);
    tex = buildTexture(gl, titleEl);
    uploadLetterPositions();
  }

  /* ── Render loop ──────────────────────────────────────────── */

  function loop() {
    requestAnimationFrame(loop);
    if (!tex) return;
    mx += (targetX - mx) * 0.1;
    my += (targetY - my) * 0.1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    gl.uniform2f(uMouse, mx * dpr, my * dpr);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ── Setup ────────────────────────────────────────────────── */

  function setup() {
    titleEl = document.querySelector('.cnt_tt');
    if (!titleEl) return;

    glCanvas = document.createElement('canvas');
    glCanvas.id = 'title-gl';
    glCanvas.setAttribute('aria-hidden', 'true');
    titleEl.parentElement.appendChild(glCanvas);

    gl = glCanvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) { glCanvas.remove(); return; }

    var glProg = mkProgram(gl);
    gl.useProgram(glProg);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),
      gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(glProg, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(gl.getUniformLocation(glProg, 'uTex'), 0);
    uMouse      = gl.getUniformLocation(glProg, 'uMouse');
    uRes        = gl.getUniformLocation(glProg, 'uRes');
    uStr        = gl.getUniformLocation(glProg, 'uStr');
    uLettersLoc = gl.getUniformLocation(glProg, 'uLetters[0]');
    uLetterR    = gl.getUniformLocation(glProg, 'uLetterR');
    gl.uniform1f(uStr, 4.5); /* max displacement px — soft */

    resize();
    window.addEventListener('resize', resize, { passive: true });

    document.addEventListener('mousemove', function (e) {
      var r = glCanvas.getBoundingClientRect();
      targetX = e.clientX - r.left;
      targetY = e.clientY - r.top;
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      targetX = -999; targetY = -999;
    });

    /* Fade in — CSS transition on #title-gl handles the ease */
    requestAnimationFrame(function () {
      glCanvas.style.opacity = '1';
    });

    loop();
  }

  /* ── Entry ──────────────────────────────────────────────── */

  var ran = false;
  function trySetup() {
    if (ran) return;
    ran = true;
    /* Mobile: skip the opaque WebGL title overlay (mouse-driven, useless on
       touch) so the dotted background grid stays visible behind the title. */
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return;
    var el = document.querySelector('.cnt_tt');
    if (!el) return;
    /* Hide chars immediately — WebGL canvas will replace them */
    el.querySelectorAll('.ttj .char').forEach(function (ch) {
      ch.style.color = 'transparent';
    });
    var fs = parseFloat(window.getComputedStyle(el).fontSize);
    var p  = (document.fonts && document.fonts.load)
               ? document.fonts.load('400 ' + fs + 'px montrealbook')
               : Promise.resolve();
    p.then(setup).catch(setup);
  }

  document.addEventListener('titleReady', trySetup, { once: true });
  setTimeout(trySetup, 3500);

})();
