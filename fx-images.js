/**
 * fx-images.js
 * WebGL displacement ripple on project thumbnail images.
 * No external dependencies — browser only.
 */
(function () {
  'use strict';

  var VS = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  var FS = `
    precision highp float;
    uniform sampler2D uTex;
    uniform vec2 uMouse;
    uniform float uHover;
    uniform float uTime;
    varying vec2 vUv;

    void main(){
      vec2 uv = vUv;

      // Ripple displacement
      vec2 delta = uv - uMouse;
      float dist = length(delta);

      // Gaussian falloff
      float falloff = exp(-dist * dist * 18.0);

      // Sin wave ring expanding outward
      float wave = sin(dist * 28.0 - uTime * 4.0) * falloff;

      // Max 0.018 UV displacement, modulated by hover amount
      vec2 disp = normalize(delta + 0.0001) * wave * 0.018 * uHover;

      /* Clamp to avoid sampling white edges of the image */
      vec2 displaced = clamp(uv + disp, 0.002, 0.998);
      gl_FragColor = texture2D(uTex, displaced);
    }
  `;

  function createShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('fx-images shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    var vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('fx-images program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function initRipple(thumb) {
    var img = thumb.querySelector('img.work_cover');
    if (!img) return;

    // Ensure thumb is positioned
    var thumbStyle = window.getComputedStyle(thumb);
    if (thumbStyle.position === 'static') {
      thumb.style.position = 'relative';
    }

    var canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'z-index:5',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity 0.6s ease',
      'display:block'
    ].join(';');
    thumb.appendChild(canvas);

    var gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!gl) { canvas.remove(); return; }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var prog = createProgram(gl, VS, FS);
    if (!prog) { canvas.remove(); return; }

    // Fullscreen quad
    var quad = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    var aPos  = gl.getAttribLocation(prog, 'aPos');
    var uTex   = gl.getUniformLocation(prog, 'uTex');
    var uMouse = gl.getUniformLocation(prog, 'uMouse');
    var uHover = gl.getUniformLocation(prog, 'uHover');
    var uTime  = gl.getUniformLocation(prog, 'uTime');

    var tex = gl.createTexture();

    function uploadTexture() {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      // Draw to offscreen canvas first — avoids crossorigin/SVG issues in WebGL
      var w = img.naturalWidth  || thumb.offsetWidth  || 512;
      var h = img.naturalHeight || thumb.offsetHeight || 512;
      var offscreen = document.createElement('canvas');
      offscreen.width  = w;
      offscreen.height = h;
      var ctx2d = offscreen.getContext('2d');
      ctx2d.drawImage(img, 0, 0, w, h);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
      } catch (e) {
        canvas.remove(); return;
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    function resize() {
      var w = thumb.offsetWidth;
      var h = thumb.offsetHeight;
      canvas.width  = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    var mouse    = { x: 0.5, y: 0.5 };
    var hoverVal = 0.0;
    var hoverTarget = 0.0;
    var rafId = null;
    var startTime = performance.now();
    var textureReady = false;

    function render() {
      rafId = requestAnimationFrame(render);

      // Lerp hover
      hoverVal += (hoverTarget - hoverVal) * 0.06;

      var t = (performance.now() - startTime) * 0.001;

      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uTex, 0);

      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uHover, hoverVal);
      gl.uniform1f(uTime, t);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function onMouseMove(e) {
      var rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width;
      mouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
    }

    function onMouseEnter() {
      hoverTarget = 1.0;
    }

    function onMouseLeave() {
      hoverTarget = 0.0;
    }

    thumb.addEventListener('mouseenter', onMouseEnter);
    thumb.addEventListener('mouseleave', onMouseLeave);
    thumb.addEventListener('mousemove', onMouseMove);

    window.addEventListener('resize', resize);

    function start() {
      resize();
      uploadTexture();
      textureReady = true;
      render();
      // Fade canvas in
      requestAnimationFrame(function () {
        canvas.style.opacity = '1';
      });
    }

    if (img.complete && img.naturalWidth > 0) {
      start();
    } else {
      img.addEventListener('load', start);
      img.addEventListener('error', function () {
        canvas.remove();
      });
    }
  }

  function init() {
    var thumbs = document.querySelectorAll('.work_thumb');
    thumbs.forEach(function (thumb) {
      /* Skip transparent product mockups (project 3): the WebGL canvas would
         overlay a second copy of the image and read as a duplicate. */
      if (thumb.classList.contains('work_thumb--c')) return;
      if (thumb.querySelector('img.work_cover')) {
        initRipple(thumb);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
