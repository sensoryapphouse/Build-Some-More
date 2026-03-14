/* splash-fx.js — Enhanced splash screen effects for Build Some More */

(function () {
  'use strict';

  // --- Title: split into per-letter spans for wave + rainbow ---
  function initSplashTitle() {
    var title = document.getElementById('splash-title');
    if (!title || title.querySelector('.title-letter')) return;
    var text = title.textContent;
    title.textContent = '';
    title.setAttribute('aria-label', text);
    text.split('').forEach(function (ch, i) {
      var span = document.createElement('span');
      span.className = 'title-letter';
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      span.style.setProperty('--i', i);
      span.setAttribute('aria-hidden', 'true');
      title.appendChild(span);
    });
  }

  // --- Hover / touch proximity tracking ---
  var pointerX = -9999, pointerY = -9999;

  function initHoverTracking() {
    var screen = document.getElementById('select-screen');
    screen.addEventListener('pointermove', function (e) {
      pointerX = e.clientX;
      pointerY = e.clientY;
    });
    screen.addEventListener('pointerdown', function (e) {
      pointerX = e.clientX;
      pointerY = e.clientY;
    }, { passive: true });
    screen.addEventListener('pointerleave', function () {
      pointerX = -9999;
      pointerY = -9999;
    });
    screen.addEventListener('touchmove', function (e) {
      if (e.touches.length > 0) {
        pointerX = e.touches[0].clientX;
        pointerY = e.touches[0].clientY;
      }
    }, { passive: true });
    screen.addEventListener('touchend', function () {
      pointerX = -9999;
      pointerY = -9999;
    });
  }

  // --- Decoration effects: hover, pulse, glow, tint ---
  var PULSE_INDICES = [0, 3, 5, 8, 10];
  var HOVER_THRESHOLD = 100;

  function updateDecorEffects(decors, time) {
    // Batch-read bounding rects first to avoid layout thrashing
    var rects = decors.map(function (el) { return el.getBoundingClientRect(); });

    decors.forEach(function (el, i) {
      var rect = rects[i];
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = pointerX - cx;
      var dy = pointerY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Hover: push away + scale up
      var hoverScale = 1;
      var tx = 0, ty = 0;
      if (dist < HOVER_THRESHOLD) {
        var intensity = 1 - dist / HOVER_THRESHOLD;
        tx = -dx * intensity * 0.3;
        ty = -dy * intensity * 0.3;
        hoverScale = 1 + intensity * 0.15;
      }

      // Pulse: gentle breathing on selected decorations
      var pulseScale = 1;
      if (PULSE_INDICES.indexOf(i) !== -1) {
        pulseScale = 1 + 0.05 * Math.sin(time * 0.001 + i * 1.2);
      }

      // Glow: pulsing drop-shadow intensity
      var glowSize = 6 + 8 * (0.5 + 0.5 * Math.sin(time * 0.002 + i * 0.8));
      var glowOpacity = (0.3 + 0.2 * Math.sin(time * 0.002 + i * 0.8)).toFixed(2);

      // Tint: hue-rotate cycling in sync with background gradient (12s period)
      var hueShift = ((time * 0.03 + i * 30) % 360).toFixed(0);

      // Apply — translate and scale are independent CSS properties, don't conflict with transform animations
      el.style.translate = tx.toFixed(1) + 'px ' + ty.toFixed(1) + 'px';
      el.style.scale = (hoverScale * pulseScale).toFixed(3);
      el.style.filter = 'drop-shadow(0 0 ' + glowSize.toFixed(1) + 'px rgba(255,255,255,' + glowOpacity + ')) hue-rotate(' + hueShift + 'deg)';
    });
  }

  // --- Background particles ---
  var particleCanvas, particleCtx;
  var particles = [];
  var PARTICLE_COUNT = 40;

  function initParticles() {
    particleCanvas = document.getElementById('splash-particles');
    if (!particleCanvas) return;
    particleCtx = particleCanvas.getContext('2d');
    resizeParticleCanvas();
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(true));
    }
  }

  function resizeParticleCanvas() {
    if (!particleCanvas) return;
    particleCanvas.width = particleCanvas.clientWidth;
    particleCanvas.height = particleCanvas.clientHeight;
  }

  function createParticle(randomY) {
    var w = particleCanvas.width || 800;
    var h = particleCanvas.height || 600;
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h + 10,
      size: 1.5 + Math.random() * 2.5,
      speedY: -(0.3 + Math.random() * 0.7),
      speedX: (Math.random() - 0.5) * 0.3,
      opacity: randomY ? Math.random() * 0.4 : 0,
      maxOpacity: 0.3 + Math.random() * 0.4,
      fadeIn: true,
      hue: Math.random() * 60 + 170
    };
  }

  function updateParticles() {
    if (!particleCtx) return;
    var w = particleCanvas.width;
    var h = particleCanvas.height;
    particleCtx.clearRect(0, 0, w, h);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.fadeIn) {
        p.opacity += 0.005;
        if (p.opacity >= p.maxOpacity) p.fadeIn = false;
      }
      if (p.y < h * 0.1) {
        p.opacity -= 0.008;
      }

      if (p.y < -10 || p.opacity <= 0) {
        particles[i] = createParticle(false);
        continue;
      }

      // Draw sparkle
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      particleCtx.fillStyle = 'hsla(' + p.hue + ', 80%, 75%, ' + p.opacity.toFixed(3) + ')';
      particleCtx.fill();

      // Subtle glow around sparkle
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      particleCtx.fillStyle = 'hsla(' + p.hue + ', 80%, 75%, ' + (p.opacity * 0.25).toFixed(3) + ')';
      particleCtx.fill();
    }
  }

  // --- Main animation loop ---
  var decorEls = [];

  function splashLoop(time) {
    var screen = document.getElementById('select-screen');
    if (screen && screen.classList.contains('active')) {
      updateDecorEffects(decorEls, time);
      updateParticles();
    }
    requestAnimationFrame(splashLoop);
  }

  // --- Init ---
  function initSplashFx() {
    initSplashTitle();
    initHoverTracking();
    initParticles();
    decorEls = Array.prototype.slice.call(document.querySelectorAll('.decor'));
    requestAnimationFrame(splashLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSplashFx);
  } else {
    initSplashFx();
  }

  window.addEventListener('resize', resizeParticleCanvas);
})();
