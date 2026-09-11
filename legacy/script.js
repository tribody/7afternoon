/* ============================================
   七夕纪念网页 — 交互逻辑
   锁定式全屏场景导航 + Pointer Events 触摸
   ============================================ */

(function() {
  'use strict';

  // ---- 全局状态 ----
  const state = {
    currentScene: 0,
    totalScenes: 13, // 场景 0-12
    musicPlaying: false,
    audioCtx: null,
    melodyTimer: null,
    celebrationActive: false,
  };

  // ---- 互动状态 ----
  var interactionState = {
    completed: {} // {1: true, 2: true, ...}
  };

  // ---- DOM 引用 ----
  const loader = document.getElementById('loader');
  const musicToggle = document.getElementById('music-toggle');
  const floatLayer = document.getElementById('float-layer');
  const progressDots = document.getElementById('progress-dots');
  const confessionBtn = document.getElementById('confession-btn');
  const confessionArea = document.querySelector('.confession-area');
  const confessionResponse = document.getElementById('confession-response');
  const celebrationLayer = document.getElementById('celebration-layer');
  const celebrationCanvas = document.getElementById('celebration-canvas');

  /* ============================================
     1. 加载屏 — 预加载所有图片，进度条 + 神秘文案
     ============================================ */
  function initLoader() {
    var progressEl = document.getElementById('loader-progress');
    var textEl = document.getElementById('loader-text');
    var loadedCount = 0;

    // 收集所有场景背景图
    var allImages = [];
    for (var i = 0; i < state.totalScenes; i++) {
      var sEl = document.querySelector('.scene[data-scene="' + i + '"]');
      var bg = sEl ? sEl.querySelector('.scene-bg') : null;
      if (bg && bg.src) {
        allImages.push({ src: bg.src, scene: i });
      }
    }

    var totalImages = allImages.length;
    var loadingMessages = [
      '收到一封神秘来信...',
      '正在拆开信封...',
      '一页页翻开回忆...',
      '故事正在浮现...',
      '马上就好啦...'
    ];

    function updateProgress() {
      loadedCount++;
      var pct = Math.round(loadedCount / totalImages * 100);
      if (progressEl) progressEl.style.width = pct + '%';
      var msgIdx = Math.min(Math.floor(loadedCount / totalImages * loadingMessages.length), loadingMessages.length - 1);
      if (textEl) textEl.textContent = loadingMessages[msgIdx];
    }

    function finishLoading() {
      if (textEl) textEl.textContent = '准备好了 ♥';
      setTimeout(function() {
        loader.classList.add('hidden');
        var firstScene = document.querySelector('.scene-opening');
        if (firstScene) firstScene.classList.add('active');
        state.currentScene = 0;
        updateProgressDots();
        startFloatDecorations();
        onSceneChange(0);
      }, 500);
    }

    function startLoad() {
      if (totalImages === 0) {
        finishLoading();
        return;
      }
      var finishedCount = 0;
      allImages.forEach(function(item) {
        preloadImage(item.src).then(function() {
          finishedCount++;
          updateProgress();
          if (finishedCount >= totalImages) {
            finishLoading();
          }
        });
      });
    }

    // 等字体加载完再开始（如果支持 FontFace API）
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        startLoad();
      });
    } else {
      startLoad();
    }

    // 安全兜底：8秒后强制显示
    setTimeout(function() {
      if (!loader.classList.contains('hidden')) {
        if (progressEl) progressEl.style.width = '100%';
        if (textEl) textEl.textContent = '准备好了 ♥';
        setTimeout(function() {
          loader.classList.add('hidden');
          var firstScene = document.querySelector('.scene-opening');
          if (firstScene) firstScene.classList.add('active');
          state.currentScene = 0;
          updateProgressDots();
          startFloatDecorations();
          onSceneChange(0);
        }, 300);
      }
    }, 8000);
  }

  /* ============================================
     2. 进度指示器
     ============================================ */
  function initProgressDots() {
    if (!progressDots) return;
    progressDots.innerHTML = '';
    for (var i = 0; i < state.totalScenes; i++) {
      var dot = document.createElement('div');
      dot.className = 'progress-dot';
      dot.dataset.scene = i;
      progressDots.appendChild(dot);
    }
  }

  function updateProgressDots() {
    var dots = progressDots ? progressDots.querySelectorAll('.progress-dot') : [];
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.remove('active', 'completed');
      if (i < state.currentScene) {
        dots[i].classList.add('completed');
      } else if (i === state.currentScene) {
        dots[i].classList.add('active');
      }
    }
  }

  /* ============================================
     3. 场景导航 — 锁定式全屏切换（互动完成才可前进）
     ============================================ */
  // 图片预加载缓存
  var imageCache = {};

  function preloadImage(src) {
    return new Promise(function(resolve) {
      if (imageCache[src]) {
        resolve(imageCache[src]);
        return;
      }
      var img = new Image();
      img.onload = function() {
        imageCache[src] = img;
        resolve(img);
      };
      img.onerror = function() {
        resolve(null); // 失败也继续，不阻塞流程
      };
      img.src = src;
    });
  }

  function preloadNextScene(index) {
    if (index < 0 || index >= state.totalScenes) return;
    var sceneEl = document.querySelector('.scene[data-scene="' + index + '"]');
    if (!sceneEl) return;
    var bgImg = sceneEl.querySelector('.scene-bg');
    if (bgImg && bgImg.src) {
      preloadImage(bgImg.src);
    }
  }

  function goToScene(index) {
    if (index < 0 || index >= state.totalScenes) return;

    // 锁定检查：前进时必须完成当前场景的互动
    if (index > state.currentScene) {
      var currentSceneEl = document.querySelector('.scene[data-scene="' + state.currentScene + '"]');
      if (currentSceneEl && currentSceneEl.hasAttribute('data-interaction')) {
        if (!interactionState.completed[state.currentScene]) {
          // 未完成互动，提示并阻止前进
          showHint('请先完成当前互动 ♡', 2000);
          return;
        }
      }
    }

    // 预加载目标场景的背景图
    var targetSceneEl = document.querySelector('.scene[data-scene="' + index + '"]');
    var targetBg = targetSceneEl ? targetSceneEl.querySelector('.scene-bg') : null;
    var targetSrc = targetBg ? targetBg.src : null;

    if (targetSrc && !imageCache[targetSrc]) {
      // 显示加载提示
      showHint('正在加载下一幕...', 3000);

      preloadImage(targetSrc).then(function() {
        doSceneTransition(index);
      });
    } else {
      // 图片已缓存，直接切换
      doSceneTransition(index);
    }
  }

  function doSceneTransition(index) {
    // 移除所有场景的 active
    var allScenes = document.querySelectorAll('.scene');
    for (var i = 0; i < allScenes.length; i++) {
      allScenes[i].classList.remove('active');
    }

    // 激活目标场景
    var nextEl = document.querySelector('.scene[data-scene="' + index + '"]');
    if (nextEl) {
      nextEl.classList.add('active');
    }

    state.currentScene = index;
    updateProgressDots();
    onSceneChange(index);

    // 预加载下一场景的图片
    preloadNextScene(index + 1);
  }

  // 暴露到全局用于调试
  window._goToScene = goToScene;

  function onSceneChange(index) {
    var sceneEl = document.querySelector('[data-scene="' + index + '"]');
    applyDelays(sceneEl);
    switch(index) {
      case 1: spawnHearts(3); break;
      case 2: spawnSparkles(3); break;
      case 3: spawnHearts(4); break;
      case 4: spawnHearts(6); spawnPetals(3); break;
      case 5: spawnSparkles(4); break;
      case 6: spawnPetals(5); spawnSparkles(3); break;
      case 7: spawnSparkles(2); break;
      case 8: spawnSparkles(4); break;
      case 9: break;
      case 10: spawnHearts(6); break;
      case 11: spawnHearts(3); break;
      case 12: spawnHearts(8); break;
    }
  }

  function applyDelays(sceneEl) {
    if (!sceneEl) return;
    var delayed = sceneEl.querySelectorAll('[data-delay]');
    for (var i = 0; i < delayed.length; i++) {
      var el = delayed[i];
      var delay = parseInt(el.dataset.delay, 10);
      if (delay) {
        el.style.transitionDelay = delay + 'ms';
        el.style.animationDelay = delay + 'ms';
      }
    }
  }

  /* ============================================
     4. 开场按钮 & 继续按钮
     ============================================ */
  function initStartButton() {
    var startBtn = document.getElementById('start-btn');
    if (!startBtn) return;
    startBtn.addEventListener('click', function(e) {
      e.preventDefault();
      // 首次交互时初始化音频上下文
      try {
        if (!state.audioCtx) {
          state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
          state.audioCtx.resume();
        }
      } catch(err) {}
      goToScene(1);
    });
  }

  function initNextSceneButtons() {
    var buttons = document.querySelectorAll('.next-scene-btn');
    for (var i = 0; i < buttons.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var nextScene = parseInt(btn.dataset.nextScene, 10);
          if (!isNaN(nextScene)) {
            goToScene(nextScene);
          }
        });
      })(buttons[i]);
    }
  }

  /* ============================================
     5. 漂浮装饰元素
     ============================================ */
  function startFloatDecorations() {
    setInterval(function() {
      if (state.currentScene >= 1 && state.currentScene <= 11 && state.currentScene !== 9) {
        if (Math.random() > 0.5) spawnHearts(1);
        if (Math.random() > 0.7) spawnSparkles(1);
      }
    }, 3000);
  }

  function spawnHearts(count) {
    for (var i = 0; i < count; i++) {
      var heart = document.createElement('div');
      heart.className = 'float-heart';
      heart.textContent = '\u2665';
      heart.style.left = Math.random() * 100 + '%';
      heart.style.bottom = '-20px';
      heart.style.fontSize = (10 + Math.random() * 14) + 'px';
      heart.style.color = Math.random() > 0.5 ? 'var(--coral)' : 'var(--coral-light)';
      heart.style.animationDuration = (4 + Math.random() * 4) + 's';
      heart.style.animationDelay = (Math.random() * 2) + 's';
      floatLayer.appendChild(heart);
      setTimeout(function() { heart.remove(); }, 10000);
    }
  }

  function spawnSparkles(count) {
    for (var i = 0; i < count; i++) {
      var sparkle = document.createElement('div');
      sparkle.className = 'float-sparkle';
      sparkle.style.left = Math.random() * 100 + '%';
      sparkle.style.top = Math.random() * 100 + '%';
      sparkle.style.animationDelay = (Math.random() * 2) + 's';
      floatLayer.appendChild(sparkle);
      setTimeout(function() { sparkle.remove(); }, 4000);
    }
  }

  function spawnPetals(count) {
    for (var i = 0; i < count; i++) {
      var petal = document.createElement('div');
      petal.className = 'float-petal';
      petal.style.left = Math.random() * 100 + '%';
      petal.style.top = '-20px';
      petal.style.animationDuration = (6 + Math.random() * 4) + 's';
      petal.style.animationDelay = (Math.random() * 3) + 's';
      floatLayer.appendChild(petal);
      setTimeout(function() { petal.remove(); }, 12000);
    }
  }

  /* ============================================
     6. 背景音乐 — Web Audio API 钢琴旋律
     ============================================ */
  function initMusic() {
    musicToggle.addEventListener('click', function(e) {
      e.preventDefault();
      if (state.musicPlaying) {
        stopMusic();
      } else {
        startMusic();
      }
    });
  }

  function startMusic() {
    if (!state.audioCtx) {
      try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        return;
      }
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    state.musicPlaying = true;
    musicToggle.classList.remove('music-off');
    musicToggle.classList.add('music-on');
    playMelody();
  }

  function stopMusic() {
    state.musicPlaying = false;
    musicToggle.classList.remove('music-on');
    musicToggle.classList.add('music-off');
    if (state.melodyTimer) {
      clearTimeout(state.melodyTimer);
      state.melodyTimer = null;
    }
  }

  /* ============================================
     6. 背景音乐 — 杨乃文《推开世界的门》钢琴旋律
     C调 4/4 69BPM 和弦进行: C → G/B → Am → F → G → C
     ============================================ */
  // 音高定义 (C调)
  var N = {
    C3:130.81, D3:146.83, E3:164.81, F3:174.61, G3:196.00, A3:220.00, B3:246.94,
    C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, B4:493.88,
    C5:523.25, D5:587.33, E5:659.25, F5:698.46, G5:783.99, A5:880.00,
    R: 0 // rest
  };

  // 《推开世界的门》主旋律 — 每个音符 [频率, 拍数]
  // 1拍 = 0.87s (69BPM)
  var b = 0.87; // 一拍时长

  var MELODY = [
    // ---- 主歌 ----
    // C: 推开世界的门
    [N.E4, 0.5], [N.G4, 0.5], [N.C5, 1.0], [N.G4, 0.5], [N.E4, 0.5], [N.R, 0.5],
    // G/B: 你是站在门外
    [N.D4, 0.5], [N.B3, 0.5], [N.D4, 1.0], [N.B3, 0.5], [N.D4, 0.5], [N.R, 0.5],
    // Am: 怕迟到的人
    [N.C4, 0.5], [N.A3, 0.5], [N.C4, 1.0], [N.E4, 0.5], [N.C4, 0.5], [N.R, 0.5],
    // F: 捧着一颗不懂
    [N.A3, 0.5], [N.F3, 0.5], [N.A3, 1.0], [N.C4, 0.5], [N.A3, 0.5], [N.R, 0.5],
    // G: 计较的认真
    [N.B3, 0.5], [N.D4, 0.5], [N.G4, 1.0], [N.D4, 0.5], [N.B3, 0.5], [N.R, 0.5],
    // C: 吻过你的眼睛
    [N.C4, 0.5], [N.E4, 0.5], [N.G4, 1.0], [N.E4, 0.5], [N.C4, 0.5], [N.R, 0.5],
    // ---- 间奏 (和弦琶音) ----
    [N.C4, 0.5], [N.E4, 0.5], [N.G4, 0.5], [N.C5, 0.5], [N.R, 1.0],
    [N.B3, 0.5], [N.D4, 0.5], [N.G4, 0.5], [N.B4, 0.5], [N.R, 1.0],
    // ---- 副歌 ----
    // C: 左手的泥呀
    [N.G4, 0.5], [N.C5, 0.5], [N.E5, 1.0], [N.C5, 0.5], [N.G4, 0.5], [N.R, 0.5],
    // G/B: 右手的泥呀
    [N.B4, 0.5], [N.D5, 0.5], [N.G5, 1.0], [N.D5, 0.5], [N.B4, 0.5], [N.R, 0.5],
    // Am: 知己的花衣裳
    [N.A4, 0.5], [N.C5, 0.5], [N.E5, 1.0], [N.C5, 0.5], [N.A4, 0.5], [N.R, 0.5],
    // F: 世界本该是
    [N.F4, 0.5], [N.A4, 0.5], [N.C5, 1.0], [N.A4, 0.5], [N.F4, 0.5], [N.R, 0.5],
    // G: 你醒来的模样
    [N.G4, 0.5], [N.B4, 0.5], [N.D5, 1.0], [N.B4, 0.5], [N.G4, 0.5], [N.R, 0.5],
    // C: (延长)
    [N.C5, 1.0], [N.E5, 1.0], [N.G5, 2.0], [N.R, 1.0],
    // ---- 副歌第二次 ----
    // C: 左眼的悲伤
    [N.G4, 0.5], [N.C5, 0.5], [N.E5, 1.0], [N.C5, 0.5], [N.G4, 0.5], [N.R, 0.5],
    // G/B: 右眼的倔强
    [N.B4, 0.5], [N.D5, 0.5], [N.G5, 1.0], [N.D5, 0.5], [N.B4, 0.5], [N.R, 0.5],
    // Am: 看起来都一样
    [N.A4, 0.5], [N.C5, 0.5], [N.E5, 1.0], [N.C5, 0.5], [N.A4, 0.5], [N.R, 0.5],
    // F: 原来你就是我
    [N.F4, 0.5], [N.A4, 0.5], [N.C5, 1.0], [N.A4, 0.5], [N.F4, 0.5], [N.R, 0.5],
    // G: 自负的胆量
    [N.G4, 0.5], [N.B4, 0.5], [N.D5, 1.0], [N.B4, 0.5], [N.G4, 0.5], [N.R, 0.5],
    // C: (延长结束)
    [N.C5, 1.0], [N.E5, 1.0], [N.G5, 3.0], [N.R, 1.0],
  ];

  // 低音 (和弦根音)
  var BASS_LINE = [
    N.C3, N.G3, N.A3, N.F3, N.G3, N.C3,  // 主歌
    N.C3, N.G3,                          // 间奏
    N.C3, N.G3, N.A3, N.F3, N.G3, N.C3,  // 副歌1
    N.C3, N.G3, N.A3, N.F3, N.G3, N.C3,  // 副歌2
  ];

  function playMelody() {
    if (!state.musicPlaying || !state.audioCtx) return;

    var timeOffset = 0;
    var bassIndex = 0;

    MELODY.forEach(function(item, index) {
      var freq = item[0];
      var beats = item[1];
      var dur = beats * b; // 拍数 × 每拍秒数

      if (freq > 0) {
        state.melodyTimer = setTimeout(function() {
          if (!state.musicPlaying) return;
          playPianoNote(freq, dur * 0.85, 0.12);
        }, timeOffset * 1000);
      }

      // 低音：每组和弦开始时弹一次
      if (index % 6 === 0 || (index >= 12 && index % 5 === 0)) {
        var bassFreq = BASS_LINE[bassIndex % BASS_LINE.length];
        if (bassFreq) {
          state.melodyTimer = setTimeout(function() {
            if (!state.musicPlaying) return;
            playPianoNote(bassFreq, b * 2.5, 0.06);
          }, timeOffset * 1000);
        }
        bassIndex++;
      }

      timeOffset += dur;
    });

    state.melodyTimer = setTimeout(function() {
      playMelody();
    }, timeOffset * 1000 + 800);
  }

  function playPianoNote(freq, duration, volume) {
    var ctx = state.audioCtx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    var osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq * 2;

    var gain = ctx.createGain();
    var gain2 = ctx.createGain();

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(volume * 0.3, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(ctx.destination);
    gain2.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);
  }

  /* ============================================
     7. 结尾互动告白
     ============================================ */
  function initConfession() {
    if (!confessionBtn) return;
    confessionBtn.addEventListener('click', function(e) {
      e.preventDefault();
      confessionArea.classList.add('hidden');

      setTimeout(function() {
        confessionResponse.classList.add('show');
      }, 800);

      setTimeout(function() {
        startCelebration();
      }, 1200);

      spawnHearts(20);

      if (!state.musicPlaying) {
        startMusic();
      }
    });
  }

  /* ============================================
     8. 庆祝粒子系统 (Canvas)
     ============================================ */
  function startCelebration() {
    if (state.celebrationActive) return;
    state.celebrationActive = true;

    celebrationLayer.classList.add('active');

    var canvas = celebrationCanvas;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    var W = function() { return window.innerWidth; };
    var H = function() { return window.innerHeight; };

    var particles = [];
    var colors = ['#FF8B7B', '#FFC857', '#FFD4B8', '#FFB5A0', '#E8A87C', '#FFFDF9'];

    function createHeart(x, y, isFirework) {
      return {
        x: x, y: y,
        vx: (Math.random() - 0.5) * (isFirework ? 8 : 2),
        vy: isFirework ? -(Math.random() * 8 + 4) : -(Math.random() * 3 + 1),
        size: Math.random() * 10 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: isFirework ? 0.012 : 0.006,
        type: 'heart',
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
      };
    }

    function createStar(x, y, isFirework) {
      return {
        x: x, y: y,
        vx: (Math.random() - 0.5) * (isFirework ? 10 : 3),
        vy: isFirework ? -(Math.random() * 10 + 5) : -(Math.random() * 4 + 1),
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: isFirework ? 0.015 : 0.008,
        type: 'star',
      };
    }

    function createPetal(x, y) {
      return {
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 3 + 1),
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.007,
        type: 'petal',
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.08,
      };
    }

    function createFirework() {
      var x = Math.random() * W();
      var y = H() * 0.3 + Math.random() * H() * 0.3;
      var count = 15 + Math.floor(Math.random() * 15);
      for (var i = 0; i < count; i++) {
        var angle = (Math.PI * 2 * i) / count;
        var speed = Math.random() * 5 + 3;
        particles.push({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 6 + 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          decay: 0.02,
          type: 'spark',
          gravity: 0.1,
        });
      }
    }

    function drawHeart(ctx, x, y, size, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 20, size / 20);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.bezierCurveTo(-10, -5, -10, -15, 0, -10);
      ctx.bezierCurveTo(10, -15, 10, -5, 0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawStar(ctx, x, y, size, color, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 2;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPetal(ctx, x, y, size, color, alpha, rotation) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, size / 2, size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSpark(ctx, x, y, size, color, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 3;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var frameCount = 0;
    var animationId;

    function animate() {
      ctx.clearRect(0, 0, W(), H());

      if (frameCount % 40 === 0 && frameCount < 400) {
        createFirework();
      }

      if (frameCount % 5 === 0 && frameCount < 600) {
        for (var i = 0; i < 3; i++) {
          particles.push(createHeart(Math.random() * W(), H(), false));
        }
      }
      if (frameCount % 8 === 0 && frameCount < 600) {
        particles.push(createStar(Math.random() * W(), H(), false));
      }
      if (frameCount % 6 === 0 && frameCount < 500) {
        particles.push(createPetal(Math.random() * W(), H()));
      }

      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity || 0.05;
        p.life -= p.decay;

        if (p.rotation !== undefined) {
          p.rotation += p.rotSpeed;
        }

        if (p.life <= 0 || p.y > H() + 50) {
          particles.splice(i, 1);
          continue;
        }

        var alpha = Math.max(0, p.life);

        if (p.type === 'heart') {
          drawHeart(ctx, p.x, p.y, p.size, p.color, alpha);
        } else if (p.type === 'star') {
          drawStar(ctx, p.x, p.y, p.size, p.color, alpha);
        } else if (p.type === 'petal') {
          drawPetal(ctx, p.x, p.y, p.size, p.color, alpha, p.rotation);
        } else if (p.type === 'spark') {
          drawSpark(ctx, p.x, p.y, p.size, p.color, alpha);
        }
      }

      frameCount++;

      if (particles.length > 0 || frameCount < 800) {
        animationId = requestAnimationFrame(animate);
      } else {
        celebrationLayer.classList.remove('active');
        state.celebrationActive = false;
      }
    }

    createFirework();
    setTimeout(function() { createFirework(); }, 300);
    setTimeout(function() { createFirework(); }, 600);

    for (var i = 0; i < 15; i++) {
      particles.push(createHeart(Math.random() * W(), H(), false));
    }

    animate();
  }

  /* ============================================
     9. 触摸优化
     ============================================ */
  function initTouchOptimization() {
    // CSS touch-action: manipulation 已处理双击缩放
    // 首次触摸自动激活音频上下文
    // 全局禁用长按弹窗（上下文菜单）
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });
    var firstTouch = true;
    document.addEventListener('pointerdown', function() {
      if (firstTouch) {
        firstTouch = false;
        if (!state.audioCtx) {
          try {
            state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          } catch(e) {}
        }
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
          state.audioCtx.resume();
        }
      }
    }, { once: true });
  }

  /* ============================================
     互动系统
     ============================================ */

  // 显示全局提示
  function showHint(text, duration) {
    var hint = document.getElementById('interaction-hint');
    if (!hint) return;
    hint.textContent = text;
    hint.classList.remove('hint-hidden');
    hint.classList.add('hint-visible');
    clearTimeout(hint._timer);
    hint._timer = setTimeout(function() {
      hint.classList.remove('hint-visible');
      hint.classList.add('hint-hidden');
    }, duration || 1500);
  }

  // 标记互动完成 — 解锁文字 + 自动过渡到下一场景
  function completeInteraction(sceneNum) {
    if (interactionState.completed[sceneNum]) return;
    interactionState.completed[sceneNum] = true;

    var layer = document.querySelector('[data-interaction-id="' + sceneNum + '"]');
    var scene = document.querySelector('[data-scene="' + sceneNum + '"]');
    if (!layer || !scene) return;

    // 隐藏互动层
    layer.classList.add('completed');

    // 解锁文字
    var caption = scene.querySelector('.scene-caption');
    if (caption) {
      caption.classList.remove('locked');
      caption.classList.add('unlocked');
    }

    // 显示继续按钮（作为视觉提示）
    var nextBtn = scene.querySelector('.next-scene-btn');
    if (nextBtn) {
      nextBtn.classList.add('visible');
    }

    // 更新进度指示器
    updateProgressDots();

    // 轻微震动反馈
    if (navigator.vibrate) navigator.vibrate(50);

    // 触发装饰效果
    setTimeout(function() {
      onSceneChange(sceneNum);
    }, 400);

    // 自动过渡到下一场景（2秒后，让用户看到解锁的文字和动画）
    var nextSceneNum = sceneNum + 1;
    if (nextSceneNum < state.totalScenes) {
      setTimeout(function() {
        goToScene(nextSceneNum);
      }, 2000);
    }
  }

  /* ---- 场景1: 推开门 (Pointer Events + document 监听) ---- */
  function initDoorOpen() {
    var overlay = document.querySelector('[data-interaction-id="1"] .door-overlay');
    if (!overlay) return;
    var startX = 0, isDragging = false;

    overlay.addEventListener('pointerdown', function(e) {
      isDragging = true;
      startX = e.clientX;
      try { overlay.setPointerCapture(e.pointerId); } catch(err) {}
    });

    document.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      if (dx < -30) {
        overlay.classList.add('opening');
        isDragging = false;
        try { overlay.releasePointerCapture(e.pointerId); } catch(err) {}
        // 门开后生成光线粒子
        var doorLight = overlay.querySelector('.door-light');
        if (doorLight) {
          for (var i = 0; i < 8; i++) {
            (function(idx) {
              setTimeout(function() {
                var particle = document.createElement('div');
                particle.className = 'door-light-particle';
                particle.style.position = 'absolute';
                particle.style.left = (15 + Math.random() * 20) + '%';
                particle.style.top = (20 + Math.random() * 60) + '%';
                particle.style.width = '3px';
                particle.style.height = '3px';
                particle.style.background = 'rgba(255, 220, 150, 0.9)';
                particle.style.borderRadius = '50%';
                particle.style.boxShadow = '0 0 8px rgba(255, 220, 150, 0.6)';
                particle.style.opacity = '0';
                particle.style.transition = 'all 1s ease-out';
                particle.style.zIndex = '5';
                overlay.appendChild(particle);
                setTimeout(function() {
                  particle.style.opacity = '1';
                  particle.style.transform = 'translate(' + 
                    (Math.random() * 40 + 20) + 'px, ' + 
                    ((Math.random() - 0.5) * 30) + 'px) scale(2)';
                }, 10);
                setTimeout(function() { particle.remove(); }, 1200);
              }, idx * 80);
            })(i);
          }
        }
        setTimeout(function() { completeInteraction(1); }, 1500);
      }
    });

    document.addEventListener('pointerup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      try { overlay.releasePointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointercancel', function(e) {
      if (!isDragging) return;
      isDragging = false;
      try { overlay.releasePointerCapture(e.pointerId); } catch(err) {}
    });
  }

  /* ---- 场景2: 翻开角色卡 ---- */
  function initCardFlip() {
    var card = document.getElementById('game-card');
    if (!card) return;
    card.addEventListener('click', function(e) {
      e.preventDefault();
      if (card.classList.contains('flipped')) return;
      card.classList.add('flipped');
      // 翻牌后生成星光效果
      var cardOverlay = document.querySelector('[data-interaction-id="2"] .card-overlay');
      if (cardOverlay) {
        setTimeout(function() {
          for (var i = 0; i < 8; i++) {
            (function(idx) {
              setTimeout(function() {
                var sparkle = document.createElement('div');
                sparkle.className = 'card-sparkle';
                sparkle.style.left = '50%';
                sparkle.style.top = '50%';
                sparkle.style.transform = 'translate(-50%, -50%)';
                sparkle.style.position = 'absolute';
                sparkle.style.width = '4px';
                sparkle.style.height = '4px';
                sparkle.style.background = Math.random() > 0.5 ? 'var(--honey)' : 'var(--coral)';
                sparkle.style.borderRadius = '50%';
                sparkle.style.opacity = '0';
                sparkle.style.transition = 'all 0.8s ease-out';
                sparkle.style.boxShadow = '0 0 6px currentColor';
                sparkle.style.zIndex = '10';
                cardOverlay.appendChild(sparkle);
                setTimeout(function() {
                  sparkle.style.opacity = '1';
                  var angle = (idx / 8) * Math.PI * 2;
                  sparkle.style.transform = 'translate(-50%, -50%) translate(' + 
                    (Math.cos(angle) * 60) + 'px, ' + 
                    (Math.sin(angle) * 60) + 'px) scale(1.5)';
                }, 10);
                setTimeout(function() { sparkle.remove(); }, 1000);
              }, idx * 50);
            })(i);
          }
        }, 600);
      }
      setTimeout(function() { completeInteraction(2); }, 1500);
    });
  }

  /* ---- 场景3: 长按回复 (Pointer Events) ---- */
  function initLongPressReply() {
    var input = document.getElementById('chat-input');
    if (!input) return;
    var progressFillEl = input.querySelector('.chat-progress-fill');
    var holdTimer = null;
    var progress = 0;

    function startHold(e) {
      try { input.setPointerCapture(e.pointerId); } catch(err) {}
      input.classList.add('pressing');
      progress = 0;
      holdTimer = setInterval(function() {
        progress += 3;
        if (progressFillEl) progressFillEl.style.width = progress + '%';
        if (progress >= 100) {
          clearInterval(holdTimer);
          holdTimer = null;
          input.classList.remove('pressing');
          input.classList.add('sent');
          try { input.releasePointerCapture(e.pointerId); } catch(err) {}
          // 显示回复气泡
          var phoneScreen = document.querySelector('[data-interaction-id="3"] .phone-screen');
          if (phoneScreen) {
            setTimeout(function() {
              var reply = document.createElement('div');
              reply.className = 'chat-bubble-outgoing';
              reply.textContent = '没有，但我想有你 ♥';
              reply.style.opacity = '0';
              reply.style.transform = 'translateX(20px)';
              phoneScreen.appendChild(reply);
              setTimeout(function() {
                reply.style.opacity = '1';
                reply.style.transform = 'translateX(0)';
              }, 50);
            }, 400);
          }
          setTimeout(function() { completeInteraction(3); }, 1200);
        }
      }, 50);
    }

    function stopHold(e) {
      if (holdTimer) {
        clearInterval(holdTimer);
        holdTimer = null;
        input.classList.remove('pressing');
        if (progress < 100 && progressFillEl) {
          progress = 0;
          progressFillEl.style.width = '0%';
        }
        if (e && e.pointerId !== undefined) {
          try { input.releasePointerCapture(e.pointerId); } catch(err) {}
        }
      }
    }

    input.addEventListener('pointerdown', startHold);
    input.addEventListener('pointerleave', stopHold);
    document.addEventListener('pointerup', stopHold);
    document.addEventListener('pointercancel', stopHold);
  }

  /* ---- 场景4: 牵起手 (Pointer Events) ---- */
  function initHoldHands() {
    var handLeft = document.getElementById('hand-left');
    var handRight = document.getElementById('hand-right');
    var connection = document.querySelector('[data-interaction-id="4"] .hands-connection');
    if (!handLeft || !handRight) return;
    var movedLeft = false, movedRight = false;

    function makeDraggable(el, callback) {
      var isDragging = false, startX = 0;
      el.addEventListener('pointerdown', function(e) {
        isDragging = true;
        startX = e.clientX;
        try { el.setPointerCapture(e.pointerId); } catch(err) {}
      });
      document.addEventListener('pointermove', function(e) {
        if (!isDragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 40) {
          callback();
          isDragging = false;
          try { el.releasePointerCapture(e.pointerId); } catch(err) {}
        }
      });
      document.addEventListener('pointerup', function(e) {
        if (!isDragging) return;
        isDragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
      });
      document.addEventListener('pointercancel', function(e) {
        if (!isDragging) return;
        isDragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
      });
    }

    makeDraggable(handLeft, function() {
      movedLeft = true;
      handLeft.style.transform = 'translateX(80px)';
      checkConnection();
    });
    makeDraggable(handRight, function() {
      movedRight = true;
      handRight.style.transform = 'translateX(-80px)';
      checkConnection();
    });

    function checkConnection() {
      if (movedLeft && movedRight) {
        if (connection) connection.classList.add('connected');
        // 在两只手中间生成爱心爆发
        var handsOverlay = document.querySelector('[data-interaction-id="4"] .hands-overlay');
        if (handsOverlay) {
          for (var i = 0; i < 6; i++) {
            (function(idx) {
              setTimeout(function() {
                var heart = document.createElement('div');
                heart.className = 'connection-heart';
                heart.textContent = '\u2665';
                heart.style.color = Math.random() > 0.5 ? 'var(--coral)' : 'var(--honey)';
                heart.style.fontSize = (10 + Math.random() * 10) + 'px';
                heart.style.left = '50%';
                heart.style.top = '50%';
                heart.style.transform = 'translate(-50%, -50%)';
                heart.style.position = 'absolute';
                heart.style.opacity = '0';
                heart.style.transition = 'all 0.8s ease-out';
                handsOverlay.appendChild(heart);
                setTimeout(function() {
                  heart.style.opacity = '1';
                  heart.style.transform = 'translate(-50%, -50%) translate(' + 
                    ((Math.random() - 0.5) * 80) + 'px, ' + 
                    (-(Math.random() * 60 + 20)) + 'px) scale(1.5)';
                }, 10);
                setTimeout(function() { heart.remove(); }, 1000);
              }, idx * 100);
            })(i);
          }
        }
        setTimeout(function() { completeInteraction(4); }, 1000);
      }
    }
  }

  /* ---- 场景5: 抚摸小猫 (Pointer Events) ---- */
  function initPetCat() {
    var catArea = document.getElementById('cat-pet-area');
    var countNum = document.getElementById('pet-count-num');
    var feedback = catArea ? catArea.querySelector('.pet-stroke-feedback') : null;
    if (!catArea) return;
    var petCount = 0;
    var isStroking = false;

    function triggerFeedback() {
      if (feedback) {
        feedback.classList.remove('active');
        void feedback.offsetWidth;
        feedback.classList.add('active');
      }
    }

    function endStroke() {
      if (!isStroking) return;
      isStroking = false;
      petCount++;
      if (countNum) countNum.textContent = petCount;
      catArea.classList.add('petted');
      setTimeout(function() { catArea.classList.remove('petted'); }, 300);
      if (petCount >= 3) {
        setTimeout(function() { completeInteraction(5); }, 500);
      }
    }

    catArea.addEventListener('pointerdown', function(e) {
      isStroking = true;
      try { catArea.setPointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointermove', function(e) {
      if (!isStroking) return;
      triggerFeedback();
    });
    document.addEventListener('pointerup', function(e) {
      if (!isStroking) return;
      try { catArea.releasePointerCapture(e.pointerId); } catch(err) {}
      endStroke();
    });
    document.addEventListener('pointercancel', function(e) {
      if (!isStroking) return;
      try { catArea.releasePointerCapture(e.pointerId); } catch(err) {}
      endStroke();
    });
  }

  /* ---- 场景6: 双人避浪 (Pointer Events) ---- */
  function initSurfDodge() {
    var board = document.getElementById('surf-board');
    var countEl = document.getElementById('surf-count');
    if (!board) return;
    var successCount = 0;
    var isLocked = false;

    function handleTilt(direction) {
      if (isLocked) return;
      isLocked = true;
      if (direction === 'left') {
        board.classList.add('tilt-left');
      } else {
        board.classList.add('tilt-right');
      }
      setTimeout(function() {
        board.classList.remove('tilt-left', 'tilt-right');
        board.classList.add('balanced');
        successCount++;
        if (countEl) countEl.textContent = successCount;

        // 水花飞溅效果
        var surfOverlay = document.querySelector('[data-interaction-id="6"] .surf-overlay');
        if (surfOverlay) {
          for (var i = 0; i < 4; i++) {
            (function(idx) {
              setTimeout(function() {
                var splash = document.createElement('div');
                splash.className = 'surf-splash';
                splash.style.left = (40 + Math.random() * 20) + '%';
                splash.style.bottom = '30%';
                splash.style.setProperty('--splash-x', (Math.random() - 0.5) * 60 + 'px');
                surfOverlay.appendChild(splash);
                setTimeout(function() { splash.remove(); }, 800);
              }, idx * 60);
            })(i);
          }
        }

        if (successCount >= 3) {
          setTimeout(function() { completeInteraction(6); }, 500);
        }
        isLocked = false;
      }, 600);
    }

    var overlay = document.querySelector('[data-interaction-id="6"] .surf-overlay');
    if (!overlay) return;
    var startX = 0, isSliding = false;

    overlay.addEventListener('pointerdown', function(e) {
      isSliding = true;
      startX = e.clientX;
      try { overlay.setPointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointerup', function(e) {
      if (!isSliding) return;
      isSliding = false;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 30) {
        handleTilt(dx < 0 ? 'left' : 'right');
      }
      try { overlay.releasePointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointercancel', function(e) {
      if (!isSliding) return;
      isSliding = false;
      try { overlay.releasePointerCapture(e.pointerId); } catch(err) {}
    });
  }

  /* ---- 场景7: 给她拥抱 (Pointer Events) ---- */
  function initEmbrace() {
    var figure = document.getElementById('embrace-figure');
    if (!figure) return;
    var isDragging = false, startX = 0;

    figure.addEventListener('pointerdown', function(e) {
      isDragging = true;
      startX = e.clientX;
      try { figure.setPointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      if (e.clientX - startX > 40) {
        figure.classList.add('hugging');
        isDragging = false;
        try { figure.releasePointerCapture(e.pointerId); } catch(err) {}
        // 生成暖光爱心效果
        var embraceOverlay = document.querySelector('[data-interaction-id="7"] .embrace-overlay');
        if (embraceOverlay) {
          for (var i = 0; i < 6; i++) {
            (function(idx) {
              setTimeout(function() {
                var heart = document.createElement('div');
                heart.className = 'connection-heart';
                heart.textContent = '\u2665';
                heart.style.color = 'rgba(255, 200, 87, ' + (0.6 + Math.random() * 0.4) + ')';
                heart.style.fontSize = (12 + Math.random() * 10) + 'px';
                heart.style.left = '50%';
                heart.style.top = '50%';
                heart.style.transform = 'translate(-50%, -50%)';
                heart.style.position = 'absolute';
                heart.style.opacity = '0';
                heart.style.transition = 'all 1s ease-out';
                embraceOverlay.appendChild(heart);
                setTimeout(function() {
                  heart.style.opacity = '0.8';
                  heart.style.transform = 'translate(-50%, -50%) translate(' + 
                    ((Math.random() - 0.5) * 100) + 'px, ' + 
                    (-(Math.random() * 70 + 30)) + 'px) scale(1.5)';
                }, 10);
                setTimeout(function() { heart.remove(); }, 1200);
              }, idx * 100);
            })(i);
          }
        }
        setTimeout(function() { completeInteraction(7); }, 1200);
      }
    });
    document.addEventListener('pointerup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      try { figure.releasePointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointercancel', function(e) {
      if (!isDragging) return;
      isDragging = false;
      try { figure.releasePointerCapture(e.pointerId); } catch(err) {}
    });
  }

  /* ---- 场景8: 点亮环形灯 ---- */
  function initLightUp() {
    var ring = document.getElementById('ring-light');
    var countEl = document.getElementById('light-count');
    if (!ring) return;
    var tapCount = 0;

    ring.addEventListener('click', function(e) {
      e.preventDefault();
      tapCount++;
      if (countEl) countEl.textContent = tapCount;
      if (tapCount === 1) {
        ring.style.borderColor = 'rgba(255, 200, 87, 0.4)';
        ring.style.boxShadow = '0 0 10px rgba(255, 200, 87, 0.2)';
      } else if (tapCount === 2) {
        ring.style.borderColor = 'rgba(255, 200, 87, 0.6)';
        ring.style.boxShadow = '0 0 15px rgba(255, 200, 87, 0.3)';
      } else if (tapCount >= 3) {
        ring.classList.add('lit');
        // 点亮后生成光芒爆发
        var lightOverlay = document.querySelector('[data-interaction-id="8"] .light-overlay');
        if (lightOverlay) {
          for (var i = 0; i < 6; i++) {
            (function(idx) {
              setTimeout(function() {
                var spark = document.createElement('div');
                spark.className = 'light-spark';
                spark.style.position = 'absolute';
                spark.style.left = '50%';
                spark.style.top = '50%';
                spark.style.width = '3px';
                spark.style.height = '3px';
                spark.style.background = 'var(--honey)';
                spark.style.borderRadius = '50%';
                spark.style.boxShadow = '0 0 8px var(--honey)';
                spark.style.opacity = '0';
                spark.style.transition = 'all 0.8s ease-out';
                spark.style.zIndex = '10';
                lightOverlay.appendChild(spark);
                setTimeout(function() {
                  spark.style.opacity = '1';
                  var angle = (idx / 6) * Math.PI * 2;
                  spark.style.transform = 'translate(-50%, -50%) translate(' + 
                    (Math.cos(angle) * 50) + 'px, ' + 
                    (Math.sin(angle) * 50) + 'px) scale(2)';
                }, 10);
                setTimeout(function() { spark.remove(); }, 1000);
              }, idx * 60);
            })(i);
          }
        }
        setTimeout(function() { completeInteraction(8); }, 1000);
      }
    });
  }

  /* ---- 场景9: 修补裂痕 (Pointer Events + 金缮效果) ---- */
  function initMendCrack() {
    var crackSvg = document.getElementById('crack-svg');
    var crackPath = document.getElementById('crack-path');
    var kintsugiPath = document.getElementById('kintsugi-path');
    var goldDust = document.getElementById('gold-dust');
    var feedback = document.getElementById('crack-feedback');
    if (!crackSvg || !crackPath) return;
    var mendProgress = 0;
    var lastX = 0, lastY = 0;
    var isDragging = false;

    function getEventPos(e) {
      var rect = crackSvg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width * 300,
        y: (e.clientY - rect.top) / rect.height * 400
      };
    }

    function updateKintsugi(progress) {
      if (!kintsugiPath || !goldDust) return;
      if (progress > 200) {
        kintsugiPath.setAttribute('stroke-width', '1.5');
        kintsugiPath.setAttribute('opacity', '0.5');
        goldDust.setAttribute('stroke-width', '2');
        goldDust.setAttribute('opacity', '0.4');
      }
      if (progress > 500) {
        kintsugiPath.setAttribute('stroke-width', '2.5');
        kintsugiPath.setAttribute('opacity', '0.8');
        goldDust.setAttribute('stroke-width', '3');
        goldDust.setAttribute('opacity', '0.6');
      }
    }

    crackSvg.addEventListener('pointerdown', function(e) {
      var pos = getEventPos(e);
      lastX = pos.x; lastY = pos.y;
      isDragging = true;
      try { crackSvg.setPointerCapture(e.pointerId); } catch(err) {}
    });

    document.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      var pos = getEventPos(e);
      if (Math.abs(pos.x - 150) < 50) {
        if (feedback) feedback.classList.add('glowing');
        if (lastX !== 0 || lastY !== 0) {
          var dist = Math.sqrt(Math.pow(pos.x - lastX, 2) + Math.pow(pos.y - lastY, 2));
          mendProgress += dist;
        }
        lastX = pos.x;
        lastY = pos.y;
        updateKintsugi(mendProgress);
        if (mendProgress > 200) {
          crackPath.setAttribute('stroke-width', '1.5');
          crackPath.setAttribute('opacity', '0.5');
        }
        if (mendProgress > 500) {
          crackPath.setAttribute('stroke-width', '1');
          crackPath.setAttribute('opacity', '0.3');
          crackPath.classList.add('mended');
        }
        if (mendProgress > 700) {
          isDragging = false;
          if (kintsugiPath) {
            kintsugiPath.setAttribute('stroke-width', '3.5');
            kintsugiPath.setAttribute('opacity', '1');
          }
          if (goldDust) {
            goldDust.setAttribute('stroke-width', '4');
            goldDust.setAttribute('opacity', '0.8');
          }
          try { crackSvg.releasePointerCapture(e.pointerId); } catch(err) {}
          setTimeout(function() { completeInteraction(9); }, 500);
          return;
        }
      } else {
        if (feedback) feedback.classList.remove('glowing');
      }
    });

    document.addEventListener('pointerup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      if (feedback) feedback.classList.remove('glowing');
      try { crackSvg.releasePointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointercancel', function(e) {
      if (!isDragging) return;
      isDragging = false;
      if (feedback) feedback.classList.remove('glowing');
      try { crackSvg.releasePointerCapture(e.pointerId); } catch(err) {}
    });
  }

  /* ---- 场景10: 重新牵手 (Pointer Events) ---- */
  function initReunite() {
    var left = document.getElementById('reunite-left');
    var right = document.getElementById('reunite-right');
    if (!left || !right) return;
    var turnedLeft = false, turnedRight = false;

    function makeTurnable(el, callback) {
      var isDragging = false, startX = 0;
      el.addEventListener('pointerdown', function(e) {
        isDragging = true;
        startX = e.clientX;
        try { el.setPointerCapture(e.pointerId); } catch(err) {}
      });
      document.addEventListener('pointermove', function(e) {
        if (!isDragging) return;
        if (Math.abs(e.clientX - startX) > 30) {
          callback();
          isDragging = false;
          try { el.releasePointerCapture(e.pointerId); } catch(err) {}
        }
      });
      document.addEventListener('pointerup', function(e) {
        if (!isDragging) return;
        isDragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
      });
      document.addEventListener('pointercancel', function(e) {
        if (!isDragging) return;
        isDragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
      });
    }

    makeTurnable(left, function() {
      turnedLeft = true;
      left.classList.add('turned');
      checkReunite();
    });
    makeTurnable(right, function() {
      turnedRight = true;
      right.classList.add('turned');
      checkReunite();
    });

    function checkReunite() {
      if (turnedLeft && turnedRight) {
        // 在两人中间生成爱心爆发
        var reuniteOverlay = document.querySelector('[data-interaction-id="10"] .reunite-overlay');
        if (reuniteOverlay) {
          for (var i = 0; i < 8; i++) {
            (function(idx) {
              setTimeout(function() {
                var heart = document.createElement('div');
                heart.className = 'connection-heart';
                heart.textContent = '\u2665';
                heart.style.color = idx % 2 === 0 ? 'var(--coral)' : 'var(--honey)';
                heart.style.fontSize = (12 + Math.random() * 12) + 'px';
                heart.style.left = '50%';
                heart.style.top = '40%';
                heart.style.transform = 'translate(-50%, -50%)';
                heart.style.position = 'absolute';
                heart.style.opacity = '0';
                heart.style.transition = 'all 1s ease-out';
                heart.style.zIndex = '10';
                heart.style.textShadow = '0 0 10px rgba(255, 139, 123, 0.5)';
                reuniteOverlay.appendChild(heart);
                setTimeout(function() {
                  heart.style.opacity = '1';
                  heart.style.transform = 'translate(-50%, -50%) translate(' + 
                    ((Math.random() - 0.5) * 100) + 'px, ' + 
                    (-(Math.random() * 80 + 30)) + 'px) scale(1.8)';
                }, 10);
                setTimeout(function() { heart.remove(); }, 1200);
              }, idx * 80);
            })(i);
          }
        }
        setTimeout(function() { completeInteraction(10); }, 1200);
      }
    }
  }

  /* ---- 场景11: 转动钥匙开门 (Pointer Events) ---- */
  function initKeyTurn() {
    var keyHole = document.getElementById('key-hole');
    if (!keyHole) return;
    var angle = 0;
    var isDragging = false;

    function getAngle(cx, cy, x, y) {
      return Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    }

    keyHole.addEventListener('pointerdown', function(e) {
      var rect = keyHole.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      angle = getAngle(cx, cy, e.clientX, e.clientY);
      isDragging = true;
      try { keyHole.setPointerCapture(e.pointerId); } catch(err) {}
    });

    document.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      var rect = keyHole.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var newAngle = getAngle(cx, cy, e.clientX, e.clientY);
      var delta = newAngle - angle;
      keyHole._totalRotation = (keyHole._totalRotation || 0) + delta;
      keyHole.style.transform = 'rotate(' + keyHole._totalRotation + 'deg)';
      if (Math.abs(keyHole._totalRotation) >= 180) {
        isDragging = false;
        keyHole.classList.add('open');
        try { keyHole.releasePointerCapture(e.pointerId); } catch(err) {}
        // 开锁后生成暖光效果
        var keyOverlay = document.querySelector('[data-interaction-id="11"] .key-overlay');
        if (keyOverlay) {
          for (var i = 0; i < 6; i++) {
            (function(idx) {
              setTimeout(function() {
                var spark = document.createElement('div');
                spark.className = 'key-light-spark';
                spark.style.position = 'absolute';
                spark.style.left = '50%';
                spark.style.top = '50%';
                spark.style.width = '4px';
                spark.style.height = '4px';
                spark.style.background = 'var(--honey)';
                spark.style.borderRadius = '50%';
                spark.style.boxShadow = '0 0 10px var(--honey)';
                spark.style.opacity = '0';
                spark.style.transition = 'all 1s ease-out';
                spark.style.zIndex = '10';
                keyOverlay.appendChild(spark);
                setTimeout(function() {
                  spark.style.opacity = '0.9';
                  var angle = (idx / 6) * Math.PI * 2;
                  spark.style.transform = 'translate(-50%, -50%) translate(' + 
                    (Math.cos(angle) * 60) + 'px, ' + 
                    (Math.sin(angle) * 60) + 'px) scale(2)';
                }, 10);
                setTimeout(function() { spark.remove(); }, 1200);
              }, idx * 80);
            })(i);
          }
        }
        setTimeout(function() { completeInteraction(11); }, 1200);
      }
      angle = newAngle;
    });

    document.addEventListener('pointerup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      try { keyHole.releasePointerCapture(e.pointerId); } catch(err) {}
    });
    document.addEventListener('pointercancel', function(e) {
      if (!isDragging) return;
      isDragging = false;
      try { keyHole.releasePointerCapture(e.pointerId); } catch(err) {}
    });
  }

  /* ---- 初始化所有互动 ---- */
  function initInteractions() {
    initDoorOpen();
    initCardFlip();
    initLongPressReply();
    initHoldHands();
    initPetCat();
    initSurfDodge();
    initEmbrace();
    initLightUp();
    initMendCrack();
    initReunite();
    initKeyTurn();
  }

  /* ============================================
     初始化
     ============================================ */
  function init() {
    initProgressDots();
    initLoader();
    initStartButton();
    initNextSceneButtons();
    initMusic();
    initConfession();
    initTouchOptimization();
    initInteractions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
