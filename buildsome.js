'use strict';

let activitiesData = null;
let currentCategory = null;
let currentActivity = null;
let currentMetaIndex = 0;
let currentBreakpoint = 0;
let maxBreakpoint = 0;
let regionNumbers = [];
let busy = false;
let loadRetries = 0;
let audioCtx = null;
let svgCache = {};
let wmfRewardStyle = 0;   // reward style parsed from WMF MDCR data
let wmfInitialSound = '';  // initial sound parsed from first MDCR record
let pressSoundIdx = 0;     // rotating index into fallback press-sound pool

// Fallback press-sounds for WMFs that have no embedded data-mdcr-sound.
// Short, percussive sounds suitable for switch/click feedback.
const PRESS_SOUNDS = [
  'Resources/Wav/bong.wav',    'Resources/Wav/drip.wav',
  'Resources/Wav/tap4.wav',    'Resources/Wav/Boing.wav',
  'Resources/Wav/bonk.wav',    'Resources/Wav/Boink2.wav',
  'Resources/Wav/boyng.wav',   'Resources/Wav/Cork.wav',
  'Resources/Wav/clap.wav',    'Resources/Wav/drum.wav',
  'Resources/Wav/Boing2.wav',  'Resources/Wav/laser.wav',
  'Resources/Wav/boyng2.wav',  'Resources/Wav/magic.wav',
  'Resources/Wav/drum2.wav',   'Resources/Wav/woob.wav',
  'Resources/Wav/throw.wav',   'Resources/Wav/boyng3.wav',
  'Resources/Wav/whistle.wav', 'Resources/Wav/sci_fi.wav'
];
let switchMode = parseInt(localStorage.getItem('switchMode') || '0');
let expectedSwitch = 1;
let switch1Down = false;
let switch2Down = false;
let coopFired = false;
let pointerSwitchMap = {};

// Pagination state
let catStart = 0;
let actStart = 0;
const PAGE_SIZE = 5;

// DOM refs
const selectScreen = document.getElementById('select-screen');
const gameScreen = document.getElementById('game-screen');
const catRow = document.getElementById('cat-row');
const actRow = document.getElementById('act-row');
const catLeft = document.getElementById('cat-left');
const catRight = document.getElementById('cat-right');
const actLeft = document.getElementById('act-left');
const actRight = document.getElementById('act-right');
const gamePic = document.getElementById('game-pic');
const fxCanvas = document.getElementById('fx-canvas');
const fxCtx = fxCanvas.getContext('2d');
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const switchIndLeft = document.getElementById('switch-ind-left');
const switchIndRight = document.getElementById('switch-ind-right');

// ---- Game FX particle system ----

let gameParticles = [];
let gameAnimRunning = false;
let lastClickX = 0;
let lastClickY = 0;
let bgMusicAudio = null;
let pageTransitioning = false;

function startGameFxLoop() {
  if (gameAnimRunning) return;
  gameAnimRunning = true;
  requestAnimationFrame(gameLoop);
}

function stopGameFxLoop() {
  gameAnimRunning = false;
  gameParticles = [];
}

function gameLoop(now) {
  if (!gameAnimRunning) return;
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

  for (let i = gameParticles.length - 1; i >= 0; i--) {
    const p = gameParticles[i];
    const age = now - p.born;
    if (age > p.life) { gameParticles.splice(i, 1); continue; }
    const t = age / p.life;

    if (p.type === 'sparkle') {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const size = p.size * (1 - t);
      const alpha = (1 - t) * 0.5;
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.angle + age * p.spin);
      fxCtx.globalAlpha = alpha;
      fxCtx.fillStyle = p.color;
      // Draw 4-point star
      fxCtx.beginPath();
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * Math.PI * 2;
        const r = j % 2 === 0 ? size : size * 0.35;
        if (j === 0) fxCtx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else fxCtx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      // 8-point star for sparkle effect
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        const r = j % 2 === 0 ? size : size * 0.3;
        fxCtx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      fxCtx.fill();
      fxCtx.restore();
    } else if (p.type === 'confetti') {
      p.vy += 0.15; // gravity
      p.x += p.vx + Math.sin(age * 0.003 + p.swayOff) * 0.8;
      p.y += p.vy;
      p.vx *= 0.99;
      const alpha = (t > 0.8 ? (1 - t) / 0.2 : 1) * 0.35;
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.angle + age * p.spin);
      fxCtx.globalAlpha = alpha;
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      fxCtx.restore();
    }
  }

  if (gameParticles.length > 0) {
    requestAnimationFrame(gameLoop);
  } else {
    gameAnimRunning = false;
  }
}

function spawnClickBurst(x, y) {
  const now = performance.now();
  const colors = ['#ff6b6b', '#ffd93d', '#6bff6b', '#6bd4ff', '#b16bff', '#ff6bb1', '#fff'];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const speed = 2 + Math.random() * 4;
    gameParticles.push({
      type: 'sparkle',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.1,
      born: now,
      life: 300 + Math.random() * 200
    });
  }
  startGameFxLoop();
}

function spawnCelebration() {
  const now = performance.now();
  const colors = ['#ff6b6b', '#ffd93d', '#6bff6b', '#6bd4ff', '#b16bff', '#ff6bb1', '#ff8000', '#00ffcc'];
  const w = fxCanvas.width;
  const h = fxCanvas.height;
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    gameParticles.push({
      type: 'confetti',
      x, y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 4,
      vy: 1 + Math.random() * 3,
      w: 4 + Math.random() * 6,
      h: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.08,
      swayOff: Math.random() * Math.PI * 2,
      born: now,
      life: 2000 + Math.random() * 500
    });
  }
  startGameFxLoop();
}

// ---- Spring easing ----

function springEase(t, damping = 0.6, frequency = 4.5) {
  // t: 0→1 normalised progress
  // Returns value that overshoots 1 then settles
  return 1 - Math.exp(-damping * t * 10) * Math.cos(frequency * t * Math.PI);
}

// JS-driven spring reveal for a set of SVG elements
function springRevealElements(elements) {
  // Skip scale animation for elements containing mix-blend-mode children,
  // because CSS transform creates isolation (stacking context) which breaks
  // blend-mode compositing against the SVG's background
  const hasBlend = elements.some(el => el.querySelector('[style*="mix-blend"]'));
  if (hasBlend) {
    elements.forEach(el => {
      el.style.visibility = 'visible';
      el.classList.add('region-reveal');
    });
    return;
  }
  const duration = 250;
  const start = performance.now();
  elements.forEach(el => {
    el.style.visibility = 'visible';
    el.style.opacity = '1';
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'center';
    el.style.transform = 'scale(0.92)';
  });
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const s = springEase(t, 0.5, 5);
    const scale = 0.92 + 0.08 * s;
    elements.forEach(el => {
      el.style.transform = `scale(${scale})`;
    });
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      elements.forEach(el => {
        el.style.transform = '';
        el.style.opacity = '';
        el.classList.add('region-reveal');
      });
    }
  }
  requestAnimationFrame(tick);
}

// Breathing hint on the next region to be revealed (only visible elements)

// JS-driven spring completion glow — drop-shadow on the whole SVG
let glowSvgEl = null;

function springCompletionGlow(svgEl) {
  clearCompletionGlow();
  if (!svgEl) return;
  glowSvgEl = svgEl;
  const rampDuration = 400;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / rampDuration, 1);
    const s = springEase(t, 0.5, 4);
    const px = s * 10;
    const alpha = s * 0.5;
    svgEl.style.filter = `drop-shadow(0 0 ${px}px rgba(255,215,0,${alpha}))`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function clearCompletionGlow() {
  if (glowSvgEl) { glowSvgEl.style.filter = ''; glowSvgEl = null; }
}

// ---- Background music ----

function startBgMusic(midiName) {
  stopBgMusic();
  if (!midiName || midiName === '-') return;
  let url = midiName.replace(/\\/g, '/');
  const idx = url.indexOf('Resources/');
  if (idx >= 0) url = url.substring(idx);
  url = url.replace(/\.(mid|wav)$/i, '.mp3');
  bgMusicAudio = new Audio(url);
  bgMusicAudio.loop = true;
  bgMusicAudio.volume = 0.3;
  bgMusicAudio.play().catch(() => {});
}

function stopBgMusic() {
  if (!bgMusicAudio) return;
  const a = bgMusicAudio;
  bgMusicAudio = null;
  // Fade out over 500ms
  const fadeStep = 0.02;
  const fadeInterval = setInterval(() => {
    if (a.volume > fadeStep) {
      a.volume -= fadeStep;
    } else {
      clearInterval(fadeInterval);
      a.pause();
      a.src = '';
    }
  }, 25);
}

// ---- Page transitions ----

function animatePageTransition(row, buildFn, direction) {
  if (pageTransitioning) return;
  pageTransitioning = true;

  const outClass = direction === 'left' ? 'slide-out-left' : 'slide-out-right';
  const inClass = direction === 'left' ? 'slide-in-left' : 'slide-in-right';

  const oldBtns = Array.from(row.children);
  oldBtns.forEach((btn, i) => {
    btn.style.animationDelay = (i * 30) + 'ms';
    btn.classList.add(outClass);
  });

  setTimeout(() => {
    buildFn();
    const newBtns = Array.from(row.children);
    newBtns.forEach((btn, i) => {
      btn.style.animationDelay = (i * 40) + 'ms';
      btn.classList.add(inClass);
    });
    setTimeout(() => {
      newBtns.forEach(btn => {
        btn.classList.remove(inClass);
        btn.style.animationDelay = '';
      });
      pageTransitioning = false;
    }, 250 + newBtns.length * 40);
  }, 200 + oldBtns.length * 30);
}

// ---- Screen management ----

let screenTransitioning = false;

function showScreen(target) {
  const current = document.querySelector('.screen.active');
  if (!current || current === target || screenTransitioning) {
    // Fallback: instant swap
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'transitioning'));
    target.classList.add('active');
    return;
  }

  screenTransitioning = true;
  const goingToGame = (target === gameScreen);
  const exitDir = goingToGame ? -1 : 1;
  const enterDir = goingToGame ? 1 : -1;

  target.classList.add('transitioning');
  target.style.transform = `translateY(${enterDir * 60}px)`;
  target.style.opacity = '0';

  const duration = 450;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const s = springEase(t, 0.7, 3.5);

    current.style.transform = `translateY(${exitDir * s * 50}px)`;
    current.style.opacity = String(Math.max(1 - t * 1.5, 0));

    target.style.transform = `translateY(${enterDir * (1 - s) * 60}px)`;
    target.style.opacity = String(Math.min(t * 2, 1));

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      current.classList.remove('active');
      current.style.transform = '';
      current.style.opacity = '';
      target.classList.remove('transitioning');
      target.classList.add('active');
      target.style.transform = '';
      target.style.opacity = '';
      screenTransitioning = false;
    }
  }
  requestAnimationFrame(tick);
}

// ---- Load activities data ----

async function init() {
  const resp = await fetch('activities.json?v=6');
  activitiesData = await resp.json();
  buildCategoryRow();
  // Auto-select first category
  if (activitiesData.categories.length > 0) {
    selectCategory(activitiesData.categories[0]);
  }
}

// ---- Category row ----

function buildCategoryRow() {
  const cats = activitiesData.categories;
  catRow.innerHTML = '';

  const end = Math.min(catStart + PAGE_SIZE, cats.length);
  for (let i = catStart; i < end; i++) {
    const cat = cats[i];
    const btn = document.createElement('button');
    btn.className = 'sel-btn';
    if (currentCategory && currentCategory.id === cat.id) btn.classList.add('selected');
    btn.setAttribute('aria-label', cat.name);

    if (cat.thumbnail) {
      const img = document.createElement('img');
      img.src = cat.thumbnail + '?v=4';
      img.alt = cat.name;
      img.draggable = false;
      btn.appendChild(img);
    }

    btn.addEventListener('click', () => selectCategory(cat));
    catRow.appendChild(btn);
  }

  // Show/hide arrows
  catLeft.classList.toggle('visible', catStart > 0);
  catRight.classList.toggle('visible', catStart + PAGE_SIZE < cats.length);
}

function selectCategory(cat) {
  currentCategory = cat;
  actStart = 0;
  // Category color theming
  const cats = activitiesData.categories;
  const catIndex = cats.indexOf(cat);
  if (catIndex >= 0) {
    const hue = catIndex * (360 / cats.length);
    selectScreen.style.setProperty('--cat-hue', hue + 'deg');
  }
  buildCategoryRow(); // refresh to update selected highlight
  buildActivityRow();
}

// ---- Activity row ----

function buildActivityRow() {
  if (!currentCategory) return;
  const acts = currentCategory.activities;
  actRow.innerHTML = '';

  const end = Math.min(actStart + PAGE_SIZE, acts.length);
  for (let i = actStart; i < end; i++) {
    const act = acts[i];
    const btn = document.createElement('button');
    btn.className = 'sel-btn';
    btn.setAttribute('aria-label', act.id);

    if (act.thumbnail) {
      const img = document.createElement('img');
      img.src = act.thumbnail + '?v=4';
      img.alt = act.id;
      img.draggable = false;
      btn.appendChild(img);
    }

    btn.addEventListener('click', () => startActivity(act));
    actRow.appendChild(btn);
  }

  // Show/hide arrows
  actLeft.classList.toggle('visible', actStart > 0);
  actRight.classList.toggle('visible', actStart + PAGE_SIZE < acts.length);
}

// ---- Navigation arrows ----

catLeft.addEventListener('click', () => {
  const newStart = Math.max(0, catStart - PAGE_SIZE);
  if (newStart === catStart) return;
  animatePageTransition(catRow, () => { catStart = newStart; buildCategoryRow(); }, 'right');
});
catRight.addEventListener('click', () => {
  const cats = activitiesData ? activitiesData.categories : [];
  if (catStart + PAGE_SIZE >= cats.length) return;
  animatePageTransition(catRow, () => { catStart += PAGE_SIZE; buildCategoryRow(); }, 'left');
});
actLeft.addEventListener('click', () => {
  const newStart = Math.max(0, actStart - PAGE_SIZE);
  if (newStart === actStart) return;
  animatePageTransition(actRow, () => { actStart = newStart; buildActivityRow(); }, 'right');
});
actRight.addEventListener('click', () => {
  const acts = currentCategory ? currentCategory.activities : [];
  if (actStart + PAGE_SIZE >= acts.length) return;
  animatePageTransition(actRow, () => { actStart += PAGE_SIZE; buildActivityRow(); }, 'left');
});

// ---- Game logic ----

async function startActivity(activity) {
  currentActivity = activity;
  currentMetaIndex = 0;
  busy = false;

  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (activity.backPic) {
    gamePic.style.background = activity.background + ' url(' + JSON.stringify(activity.backPic) + ') center/cover no-repeat';
  } else {
    gamePic.style.background = activity.background;
  }
  showScreen(gameScreen);
  setTimeout(resizeFxCanvas, 50);
  // Start background music if activity has midiName
  if (activity.midiName && activity.midiName !== '-') {
    startBgMusic(activity.midiName);
  }
  await loadCurrentMeta();
}

function resizeFxCanvas() {
  const area = document.getElementById('game-area');
  fxCanvas.width = area.clientWidth;
  fxCanvas.height = area.clientHeight;
}

async function loadCurrentMeta() {
  const act = currentActivity;
  if (!act) return;

  if (currentMetaIndex >= act.metaNames.length) {
    currentMetaIndex = 0;
  }

  const wmfPath = act.metaNames[currentMetaIndex];
  if (!wmfPath) {
    loadRetries++;
    if (loadRetries > act.metaNames.length) {
      console.warn('No valid WMF files found for activity', act.id);
      loadRetries = 0;
      return;
    }
    currentMetaIndex++;
    if (currentMetaIndex >= act.metaNames.length) currentMetaIndex = 0;
    await loadCurrentMeta();
    return;
  }

  gamePic.innerHTML = '';
  clearCompletionGlow();
  currentBreakpoint = 0;
  maxBreakpoint = 0;
  regionNumbers = [];
  wmfRewardStyle = 0;
  wmfInitialSound = '';
  pressSoundIdx = 0;
  busy = false;
  loadRetries = 0;
  expectedSwitch = switchMode === 2 ? (Math.random() < 0.5 ? 1 : 2) : 1;
  updateIndicators();

  try {
    const result = await wmfParse(wmfPath.replace(/^\//, ''));
    gamePic.innerHTML = result.svg;

    const svgEl = gamePic.querySelector('svg');
    if (svgEl) {
      // Ensure SVG stretches to fill screen (VB6 behaviour)
      svgEl.setAttribute('preserveAspectRatio', 'none');
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');

      // Update blend-mode background rect to match activity background colour
      const blendBg = svgEl.querySelector('[data-blend-bg]');
      if (blendBg) {
        if (act.backPic) {
          // Make transparent so CSS background image shows through
          blendBg.setAttribute('fill', 'transparent');
        } else if (act.background) {
          blendBg.setAttribute('fill', act.background);
        }
      }

      const regionSet = new Set();
      let firstValueParsed = false;

      svgEl.querySelectorAll('[data-mdcr-region]').forEach(el => {
        const r = parseInt(el.getAttribute('data-mdcr-region'));
        if (!isNaN(r) && r > 0) regionSet.add(r);

        // Parse each MDCR-V record
        // VB6 format: "breakpoint|animate|soundfile|rewardstyle|initialsound"
        const val = el.getAttribute('data-mdcr-value');
        if (val) {
          const parts = val.split('|');
          // parts[1] = animate flag (VB6: Val(Mid(s, j+1, 2)))
          if (parts.length >= 2) {
            const anim = parseInt(parts[1]) || 0;
            if (anim === 1) el.setAttribute('data-mdcr-animate', '1');
          }
          // Parse reward style and initial sound from the FIRST record only
          if (!firstValueParsed) {
            if (parts.length >= 4) {
              wmfRewardStyle = parseInt(parts[3]) || 0;
            }
            if (parts.length >= 5) {
              const initSnd = parts[4].trim();
              if (initSnd && initSnd !== '-') {
                wmfInitialSound = normalizeSoundPath(initSnd);
              }
            }
            firstValueParsed = true;
          }
        }
      });

      regionNumbers = [...regionSet].sort((a, b) => a - b);
      maxBreakpoint = regionNumbers.length;

      // Hide all region groups (they'll be revealed on press with CSS animation)
      svgEl.querySelectorAll('[data-mdcr-region]').forEach(el => {
        const r = parseInt(el.getAttribute('data-mdcr-region'));
        if (!isNaN(r) && r > 0) {
          el.style.visibility = 'hidden';
        }
      });

      // Play initial sound (VB6: frmSounds.PlaySnd InitialSound)
      if (wmfInitialSound) {
        playSound(wmfInitialSound);
      }

    }
  } catch (e) {
    console.error('Failed to load WMF:', wmfPath, e);
    loadRetries++;
    if (loadRetries > act.metaNames.length) {
      console.warn('Too many load failures for activity', act.id);
      loadRetries = 0;
      return;
    }
    currentMetaIndex++;
    if (currentMetaIndex >= act.metaNames.length) currentMetaIndex = 0;
    setTimeout(() => loadCurrentMeta(), 200);
  }
}

function handlePress() {
  if (busy) return;
  if (currentBreakpoint >= maxBreakpoint) {
    // VB6: even with 0 breakpoints, first press triggers reward (Switch1: 0 <= 0 → true)
    if (maxBreakpoint === 0 && currentBreakpoint === 0) {
      busy = true;
      updateIndicators();
      currentBreakpoint = 1; // match VB6: CurrentBreakPoint = CurrentBreakPoint + 1
      triggerReward();
      return;
    }
    return;
  }

  busy = true;
  updateIndicators();
  revealNextRegion();
}

function triggerReward(soundPath) {
  const svgEl = gamePic.querySelector('svg');

  // Play sound reward if available (VB6: NewSoundRewards), else play breakpoint sound
  const soundReward = currentActivity.soundRewards?.[currentMetaIndex];
  if (soundReward) {
    playSound(normalizeSoundPath(soundReward));
  } else if (soundPath) {
    playSound(normalizeSoundPath(soundPath));
  }

  // VB6: MDraw.ShowInvisible = True — make ALL regions visible before reward (instant, no animation)
  if (svgEl) {
    svgEl.querySelectorAll('[data-mdcr-region]').forEach(el => {
      el.style.visibility = 'visible';
      el.style.transform = '';
      el.style.opacity = '';
      el.classList.add('region-reveal');
    });
    springCompletionGlow(svgEl);
  }

  // Use reward style: prefer activities.json override, then WMF's own style
  const jsonReward = currentActivity.rewards?.[currentMetaIndex] || 0;
  const rewardStyle = jsonReward > 0 ? jsonReward : wmfRewardStyle;
  const showDelay = 100;
  setTimeout(() => {
    clearCompletionGlow(); // clear before reward animation to prevent trails
    playReward(rewardStyle, () => {
      setTimeout(() => {
        busy = false;
        currentMetaIndex++;
        loadCurrentMeta();
      }, 600);
    });
  }, showDelay);
}

function revealNextRegion() {
  const regionNum = regionNumbers[currentBreakpoint];
  currentBreakpoint++;

  const svgEl = gamePic.querySelector('svg');
  if (!svgEl) { busy = false; return; }

  const regions = svgEl.querySelectorAll(`[data-mdcr-region="${regionNum}"]`);
  let soundPath = null;

  const revealEls = [];
  regions.forEach(el => {
    revealEls.push(el);
    const sound = el.getAttribute('data-mdcr-sound');
    if (sound && !soundPath) soundPath = sound;
  });

  // Fallback: if WMF had no embedded sound, use rotating press-sound pool
  if (!soundPath && PRESS_SOUNDS.length > 0) {
    soundPath = PRESS_SOUNDS[pressSoundIdx % PRESS_SOUNDS.length];
    pressSoundIdx++;
  }

  // Spring-driven reveal animation
  springRevealElements(revealEls);

  // Sparkle burst at click point
  spawnClickBurst(lastClickX, lastClickY);

  if (currentBreakpoint >= maxBreakpoint) {
    triggerReward(soundPath);
  } else {
    // Not the last breakpoint — play breakpoint sound, allow next press quickly
    if (soundPath) playSound(normalizeSoundPath(soundPath));
    setTimeout(() => { busy = false; updateIndicators(); }, 150);
  }
}

// ---- Sound playback ----

function normalizeSoundPath(p) {
  if (!p) return null;
  p = p.split('|')[0].trim();
  if (p === '-' || p.length < 3) return null;
  // Replace all backslashes with forward slashes (handles both single and double)
  p = p.replace(/\\/g, '/');
  // Check for category-specific Resources (e.g. "Patterns 5/Resources/mid14.mid")
  const catMatch = p.match(/(Patterns(?: \d+)?\/Resources\/)/);
  if (catMatch) {
    return p.substring(p.indexOf(catMatch[1]));
  }
  const idx = p.indexOf('Resources/');
  if (idx >= 0) {
    p = p.substring(idx);
    // Sound files live in Resources/Wav/ or Resources/Midi/ only.
    // WMF paths like Resources/Babies/fart.wav need redirecting to Resources/Wav/
    if (!p.startsWith('Resources/Wav/') && !p.startsWith('Resources/Midi/')) {
      const fname = p.substring(p.lastIndexOf('/') + 1);
      p = 'Resources/Wav/' + fname;
    }
  } else {
    // Handle absolute Windows paths like "C:/Sensory/wav/arrp.wav"
    // or bare filenames — map to Resources/Wav/<filename>
    const wavMatch = p.match(/\/wav\/([^/]+)$/i);
    if (wavMatch) p = 'Resources/Wav/' + wavMatch[1];
    else if (p.match(/\.(wav|mp3|mid)$/i)) p = 'Resources/Wav/' + p.substring(p.lastIndexOf('/') + 1);
  }
  return p;
}

let currentSound = null;

async function playSound(url) {
  if (!url) return;
  // Stop any currently playing sound
  if (currentSound) {
    try { currentSound.pause(); } catch (e) {}
    currentSound = null;
  }
  // Audio files are stored as MP3 — convert any .mid or .wav references
  url = url.replace(/\.(mid|wav)$/i, '.mp3');
  try {
    const audio = new Audio(url);
    currentSound = audio;
    audio.onended = () => { if (currentSound === audio) currentSound = null; };
    await audio.play();
  } catch (e) {
    // Silent fail — unsupported format or not found
  }
}

// ---- Reward animations ----

function playReward(style, onDone) {
  if (style === 0) {
    setTimeout(onDone, 1200);
    return;
  }

  const svgEl = gamePic.querySelector('svg');
  if (!svgEl) {
    setTimeout(onDone, 500);
    return;
  }

  // VB6: only animate=1 objects get the reward animation.
  // If no animate=1 objects exist, RewardStyle is forced to 0 (no animation).
  const animEls = Array.from(svgEl.querySelectorAll('[data-mdcr-animate="1"]'));
  if (animEls.length === 0) {
    setTimeout(onDone, 1200);
    return;
  }
  // Blend-mode SVGs: CSS transforms and DOM reordering break mix-blend-mode
  // compositing by creating isolation. Instead, cycle the SVG blend-bg rect's
  // fill colour — the blend effect produces a shifting colour pattern as a reward.
  // (Must animate the SVG rect, not CSS background, because mix-blend-mode
  // composites within the SVG rendering context, not against the HTML backdrop.)
  if (animEls.some(el => el.querySelector('[style*="mix-blend"]'))) {
    const blendBgRect = svgEl.querySelector('[data-blend-bg]');
    const blendDur = 2000;
    const blendStart = performance.now();
    function blendReward(now) {
      const bt = (now - blendStart) / blendDur;
      if (bt >= 1) {
        // Restore original blend-bg and CSS background
        if (blendBgRect) {
          blendBgRect.setAttribute('fill', currentActivity?.backPic ? 'transparent' : (currentActivity?.background || '#000'));
        }
        gamePic.style.background = currentActivity ? currentActivity.background : '#000';
        if (currentActivity && currentActivity.backPic) {
          gamePic.style.background = currentActivity.background + ' url(' + JSON.stringify(currentActivity.backPic) + ') center/cover no-repeat';
        }
        setTimeout(onDone, 400);
        return;
      }
      const hue = (bt * 360 * 6) % 360;
      if (blendBgRect) blendBgRect.setAttribute('fill', `hsl(${hue}, 80%, 50%)`);
      requestAnimationFrame(blendReward);
    }
    requestAnimationFrame(blendReward);
    return;
  }
  const rewardGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  rewardGroup.setAttribute('data-reward-group', '1');
  // VB6 rotates around the geometric centre of the bounding box.
  // SVG elements default to transform-origin 0 0 (viewport origin),
  // so we must set fill-box + center to match VB6 behaviour.
  rewardGroup.style.transformBox = 'fill-box';
  rewardGroup.style.transformOrigin = 'center';
  animEls[0].parentNode.insertBefore(rewardGroup, animEls[0]);
  animEls.forEach(el => rewardGroup.appendChild(el));
  const targets = [rewardGroup];

  // CSS translate values on SVG <g> elements are in SVG user coordinates,
  // not CSS pixels. We must use viewBox dimensions for off-screen movement.
  const vbParts = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number) || [0, 0, 1000, 1000];
  const vbW = vbParts[2];
  const vbH = vbParts[3];

  const duration = 2000;
  const start = performance.now();

  function animate(now) {
    const t = (now - start) / duration;
    if (t >= 1) {
      // Apply final frame at t=1 and leave it — don't reset styles
      targets.forEach(el => applyRewardFrame(el, style, 1, vbW, vbH));
      gamePic.style.background = currentActivity ? currentActivity.background : '#000';
      // Restore background image if activity has one
      if (currentActivity && currentActivity.backPic) {
        gamePic.style.background = currentActivity.background + ' url(' + JSON.stringify(currentActivity.backPic) + ') center/cover no-repeat';
      }

      setTimeout(onDone, 400);
      return;
    }
    targets.forEach(el => applyRewardFrame(el, style, t, vbW, vbH));
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function applyRewardFrame(svg, style, t, vbW, vbH) {
  // Spring-damped oscillation for bouncy styles
  const st = springEase(t, 0.4, 4);
  const decay = 1 - st; // decays toward 0 as spring settles
  const phase = Math.sin(t * Math.PI * 4) * (1 - t); // damped oscillation
  const easeOut = 1 - (1 - t) * (1 - t); // ease-out for linear movements
  // VB6 cases 4-7: step = PuckDim/5..8, sleep 100ms → ~600-1000ms total.
  // Use a 2x time multiplier → completes in ~1000ms within the 2s duration.
  const mt = Math.min(t * 2, 1);  // fast-move progress (4-7)
  const bgEl = gamePic;
  // Movement distance in SVG user units (1.1× viewBox = fully off-screen, matching VB6)
  const moveW = (vbW || 1000) * 1.1;
  const moveH = (vbH || 1000) * 1.1;
  // Jitter amplitude in SVG units (VB6: ±10px on 640×480 ≈ 1.5-2% of display)
  const jitterW = (vbW || 1000) * 0.02;
  const jitterH = (vbH || 1000) * 0.02;

  switch (style) {
    case 1:
      svg.style.transform = `translate(${phase * 6}px, ${Math.cos(t * 12) * 4 * (1 - t)}px)`;
      break;
    case 2:
      svg.style.transform = `translate(${phase * 5}px, ${Math.sin(t * 10) * 4 * (1 - t)}px)`;
      break;
    case 3:
      svg.style.transform = `scale(${1 + phase * 0.04})`;
      break;
    case 4:
      svg.style.transform = `translateX(${-mt * moveW}px)`;
      break;
    case 5:
      svg.style.transform = `translateX(${mt * moveW}px)`;
      break;
    case 6:
      svg.style.transform = `translateY(${-mt * moveH}px)`;
      break;
    case 7:
      svg.style.transform = `translateY(${mt * moveH}px)`;
      break;
    case 8:
      svg.style.opacity = phase > 0 ? '1' : '0.3';
      break;
    case 9:
      svg.style.transform = `rotate(${t * 720}deg)`;
      break;
    case 10:
      svg.style.transform = `scale(${1 - t * 0.7})`;
      break;
    case 11:
      svg.style.transform = `scaleY(${1 - st * 0.3}) scaleX(${1 + st * 0.15})`;
      break;
    case 12:
      svg.style.transform = `scaleX(${1 - st * 0.3}) scaleY(${1 + st * 0.15})`;
      break;
    case 13:
      svg.style.transform = `scale(${1 + st * 0.25})`;
      break;
    case 14:
      svg.style.transform = `scaleX(${Math.cos(t * Math.PI * 4)})`;
      break;
    case 15:
      svg.style.transform = `scaleY(${Math.cos(t * Math.PI * 4)})`;
      break;
    // VB6 cases 16-19: step = fixed 25-50px, sleep 200ms → ~2-5s total.
    // They wobble off screen with random ±10px cross-axis jitter, much slower
    // than cases 4-7.  Use the full 2s duration with linear t.
    case 16: {
      const jitter = (Math.sin(t * 47.1) + Math.sin(t * 23.7) * 0.6) * jitterH * (1 - t * 0.5);
      svg.style.transform = `translateX(${-t * moveW}px) translateY(${jitter}px)`;
      break;
    }
    case 17: {
      const jitter = (Math.sin(t * 47.1) + Math.sin(t * 23.7) * 0.6) * jitterH * (1 - t * 0.5);
      svg.style.transform = `translateX(${t * moveW}px) translateY(${jitter}px)`;
      break;
    }
    case 18: {
      const jitter = (Math.sin(t * 47.1) + Math.sin(t * 23.7) * 0.6) * jitterW * (1 - t * 0.5);
      svg.style.transform = `translateY(${-t * moveH}px) translateX(${jitter}px)`;
      break;
    }
    case 19: {
      const jitter = (Math.sin(t * 47.1) + Math.sin(t * 23.7) * 0.6) * jitterW * (1 - t * 0.5);
      svg.style.transform = `translateY(${t * moveH}px) translateX(${jitter}px)`;
      break;
    }
    case 20: case 21: {
      const speed = style === 20 ? 8 : 3;
      const hue = (t * 360 * speed) % 360;
      bgEl.style.background = `hsl(${hue}, 80%, 50%)`;
      break;
    }
    case 22: case 23: {
      const speed = style === 22 ? 8 : 3;
      const hue = (t * 360 * speed) % 360;
      svg.style.filter = `hue-rotate(${hue}deg)`;
      break;
    }
    case 24: {
      const hue = (t * 360 * 5) % 360;
      bgEl.style.background = `hsl(${hue}, 80%, 50%)`;
      svg.style.filter = `hue-rotate(${hue + 180}deg)`;
      break;
    }
    case 25: svg.style.transform = `rotate(${t * 180}deg)`; break;
    case 26: svg.style.transform = `rotate(${t * 360}deg)`; break;
    case 27: svg.style.transform = `rotate(${t * 540}deg)`; break;
    case 28: svg.style.transform = `rotate(${-t * 540}deg)`; break;
    case 29: svg.style.transform = `scaleX(${Math.cos(t * Math.PI * 3)})`; break;
    case 30: svg.style.transform = `scaleY(${Math.cos(t * Math.PI * 3)})`; break;
    case 31: svg.style.transform = `rotate(${t * 270}deg)`; break;
    default:
      svg.style.transform = `scale(${1 + phase * 0.04})`;
      break;
  }
}

// ---- Switch mode logic ----

function handleSwitchPress(switchNum) {
  if (switchMode === 0) {
    handlePress();
    return;
  }
  if (switchMode === 3) {
    // Cooperative: both switches must be held simultaneously
    if (switchNum === 1) switch1Down = true;
    else switch2Down = true;
    updateIndicators();
    if (switch1Down && switch2Down && !coopFired) {
      coopFired = true;
      handlePress();
    }
    return;
  }
  // Mode 1 (alternating) or 2 (random): check correct switch
  if (switchNum !== expectedSwitch) return;
  const wasBusy = busy;
  handlePress();
  if (!wasBusy && busy) {
    if (switchMode === 1) {
      expectedSwitch = expectedSwitch === 1 ? 2 : 1;
    } else {
      expectedSwitch = Math.random() < 0.5 ? 1 : 2;
    }
    updateIndicators();
  }
}

function handleSwitchRelease(switchNum) {
  if (switchMode !== 3) return;
  if (switchNum === 1) switch1Down = false;
  else switch2Down = false;
  if (!switch1Down && !switch2Down) coopFired = false;
  updateIndicators();
}

function updateIndicators() {
  const gameVisible = gameScreen.classList.contains('active') || gameScreen.classList.contains('transitioning');
  const ready = !busy && gameVisible;

  if (switchMode === 0) {
    // "Any switch" mode: show red indicator (bottom-left) when ready
    switchIndLeft.classList.toggle('hidden', !ready);
    switchIndLeft.classList.remove('dimmed');
    switchIndRight.classList.add('hidden');
    switchIndRight.classList.remove('dimmed');
  } else if (switchMode === 3) {
    // Cooperative: show both, dim switches already held down
    if (!ready) {
      switchIndLeft.classList.add('hidden');
      switchIndRight.classList.add('hidden');
      switchIndLeft.classList.remove('dimmed');
      switchIndRight.classList.remove('dimmed');
    } else {
      switchIndLeft.classList.remove('hidden');
      switchIndRight.classList.remove('hidden');
      switchIndLeft.classList.toggle('dimmed', switch1Down);
      switchIndRight.classList.toggle('dimmed', switch2Down);
    }
  } else {
    // Alternating / random: show both indicators when ready, dim the non-expected one
    if (!ready) {
      switchIndLeft.classList.add('hidden');
      switchIndRight.classList.add('hidden');
      switchIndLeft.classList.remove('dimmed');
      switchIndRight.classList.remove('dimmed');
    } else {
      switchIndLeft.classList.remove('hidden');
      switchIndRight.classList.remove('hidden');
      switchIndLeft.classList.toggle('dimmed', expectedSwitch !== 1);
      switchIndRight.classList.toggle('dimmed', expectedSwitch !== 2);
    }
  }
}

// Settings panel toggle
btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('hidden');
});

// Mode option selection
settingsPanel.querySelectorAll('.switch-mode-option').forEach(opt => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = parseInt(opt.dataset.mode);
    switchMode = mode;
    switch1Down = false; switch2Down = false; coopFired = false; pointerSwitchMap = {};
    localStorage.setItem('switchMode', mode);
    settingsPanel.querySelectorAll('.switch-mode-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    expectedSwitch = switchMode === 2 ? (Math.random() < 0.5 ? 1 : 2) : 1;
    updateIndicators();
    settingsPanel.classList.add('hidden');
  });
});

// Close settings panel on outside click
document.addEventListener('pointerdown', (e) => {
  if (!settingsPanel.classList.contains('hidden') && !e.target.closest('#settings-panel') && !e.target.closest('#btn-settings')) {
    settingsPanel.classList.add('hidden');
  }
});

// Initialize indicators and panel selection on load
settingsPanel.querySelectorAll('.switch-mode-option').forEach(opt => {
  opt.classList.toggle('selected', parseInt(opt.dataset.mode) === switchMode);
});
updateIndicators();

// ---- Event handlers ----

// Use pointerdown for immediate response (no 300ms click delay on mobile)
gamePic.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#btn-back')) return;
  e.preventDefault();
  // Capture click position relative to fx canvas for sparkle effects
  const rect = fxCanvas.getBoundingClientRect();
  lastClickX = (e.clientX - rect.left) * (fxCanvas.width / rect.width);
  lastClickY = (e.clientY - rect.top) * (fxCanvas.height / rect.height);
  // Init audio context on first user gesture (required by iOS)
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  // Determine switch from click position: left half = switch 1, right half = switch 2
  const midX = rect.left + rect.width / 2;
  const switchNum = e.clientX < midX ? 1 : 2;
  pointerSwitchMap[e.pointerId] = switchNum;
  handleSwitchPress(switchNum);
});

gamePic.addEventListener('pointerup', (e) => {
  const switchNum = pointerSwitchMap[e.pointerId];
  delete pointerSwitchMap[e.pointerId];
  if (switchNum) handleSwitchRelease(switchNum);
});

gamePic.addEventListener('pointercancel', (e) => {
  const switchNum = pointerSwitchMap[e.pointerId];
  delete pointerSwitchMap[e.pointerId];
  if (switchNum) handleSwitchRelease(switchNum);
});

document.addEventListener('keydown', (e) => {
  if (!gameScreen.classList.contains('active')) return;

  if (e.key === ' ' || e.key === '1') {
    e.preventDefault();
    handleSwitchPress(1);
  } else if (e.key === 'Enter' || e.key === '2') {
    e.preventDefault();
    handleSwitchPress(2);
  } else if (e.key === 'Escape') {
    busy = false;
    switch1Down = false; switch2Down = false; coopFired = false; pointerSwitchMap = {};
    stopBgMusic();
    if (currentSound) { try { currentSound.pause(); } catch (e2) {} currentSound = null; }
    clearCompletionGlow();
    stopGameFxLoop();
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    showScreen(selectScreen);
  }
});

document.addEventListener('keyup', (e) => {
  if (!gameScreen.classList.contains('active')) return;
  if (e.key === ' ' || e.key === '1') handleSwitchRelease(1);
  else if (e.key === 'Enter' || e.key === '2') handleSwitchRelease(2);
});

document.getElementById('btn-back').addEventListener('click', () => {
  busy = false;
  switch1Down = false; switch2Down = false; coopFired = false; pointerSwitchMap = {};
  stopBgMusic();
  if (currentSound) { try { currentSound.pause(); } catch (e) {} currentSound = null; }
  clearCompletionGlow();
  stopGameFxLoop();
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  showScreen(selectScreen);
});

window.addEventListener('resize', resizeFxCanvas);

// ---- Gamepad support ----

let gpPolling = false;
let gpPrevButtons = [false, false];

function startGamepadPoll() {
  if (gpPolling) return;
  gpPolling = true;
  requestAnimationFrame(pollGamepad);
}

function pollGamepad() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  let anyConnected = false;
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (!gp) continue;
    anyConnected = true;
    if (gameScreen.classList.contains('active')) {
      // A=0, X=2 → switch 1;  B=1, Y=3 → switch 2
      const sw1Now = gp.buttons[0]?.pressed || gp.buttons[2]?.pressed;
      const sw2Now = gp.buttons[1]?.pressed || gp.buttons[3]?.pressed;
      if (sw1Now && !gpPrevButtons[0]) {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        handleSwitchPress(1);
      }
      if (sw2Now && !gpPrevButtons[1]) {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        handleSwitchPress(2);
      }
      if (!sw1Now && gpPrevButtons[0]) handleSwitchRelease(1);
      if (!sw2Now && gpPrevButtons[1]) handleSwitchRelease(2);
      gpPrevButtons[0] = sw1Now;
      gpPrevButtons[1] = sw2Now;
    }
    break;
  }
  if (anyConnected) {
    requestAnimationFrame(pollGamepad);
  } else {
    gpPolling = false;
  }
}

window.addEventListener('gamepadconnected', startGamepadPoll);

// ---- Start ----

init();
