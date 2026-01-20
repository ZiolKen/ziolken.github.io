(() => {
  const EMOJI = "❄️";
  const SPAWN_INTERVAL_MS = 500;
  const MAX_ON_SCREEN = 50;
  const BOTTOM_FADE_ZONE = 50;
  const Z_INDEX = 999999;

  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vp = () => {
    const vv = window.visualViewport;
    return {
      w: Math.floor(vv?.width ?? window.innerWidth),
      h: Math.floor(vv?.height ?? window.innerHeight),
    };
  };

  const layer = document.getElementById("snow-screen") || document.createElement("div");
  layer.id = "snow-screen";
  layer.setAttribute("aria-hidden", "true");
  document.documentElement.appendChild(layer);

  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    width: "100dvw",
    height: "100dvh",
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: String(Z_INDEX),
    isolation: "isolate",
  });

  const active = new Set();
  let running = true;
  let lastSpawn = performance.now();

  function kill(item) {
    if (item.dead) return;
    item.dead = true;
    item.el.remove();
    active.delete(item);
  }

  function spawnSnowflake(x, y) {
    if (active.size >= MAX_ON_SCREEN) {
      const it = active.values().next().value;
      if (it) kill(it);
    }

    const el = document.createElement("span");
    el.textContent = EMOJI;

    const size = rand(5, 15);
    const opacity = rand(0.75, 1);
    const spinDir = Math.random() < 0.5 ? -1 : 1;
    const spinSpeed = rand(90, 360) * spinDir;

    const startX = x + rand(-2, 2);
    const startY = y + rand(-2, 2);

    const fallSpeed = rand(50, 150);
    const driftAmplitude = rand(1, 5);
    const driftFreq = rand(0.3, 1.7);
    const wind = rand(-1, 1);

    const lifetimeCap = rand(5.0, 7.5);

    Object.assign(el.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      transform: `translate(${startX}px, ${startY}px) rotate(${rand(0, 360)}deg)`,
      fontSize: `${size}px`,
      lineHeight: "1",
      opacity: String(opacity),
      willChange: "transform, opacity",
      userSelect: "none",
    });

    layer.appendChild(el);

    const item = {
      el,
      t0: performance.now(),
      startX,
      startY,
      fallSpeed,
      driftAmplitude,
      driftFreq,
      wind,
      spinSpeed,
      baseRot: rand(0, 360),
      baseOpacity: opacity,
      dead: false,
      lifetimeCap,
    };

    active.add(item);

    const { h } = vp();
    const timeToBottom = (h + 60 - startY) / fallSpeed;
    const ttl = Math.max(lifetimeCap, timeToBottom);

    setTimeout(() => kill(item), Math.ceil(ttl * 1000) + 800);
  }

  function animate(now) {
    const { w: vw, h: vh } = vp();

    if (running) {
      const delta = now - lastSpawn;
      if (delta >= SPAWN_INTERVAL_MS) {
        const n = Math.min(120, Math.floor(delta / SPAWN_INTERVAL_MS));
        for (let i = 0; i < n; i++) spawnSnowflake(rand(0, vw), -20);
        lastSpawn += n * SPAWN_INTERVAL_MS;
      }
    } else {
      lastSpawn = now;
    }

    for (const item of active) {
      const t = (now - item.t0) / 1000;

      const y = item.startY + item.fallSpeed * t;

      const drift =
        Math.sin(t * Math.PI * 1 * item.driftFreq) * item.driftAmplitude +
        item.wind * t;

      const x = item.startX + drift;
      const rot = item.baseRot + item.spinSpeed * t;

      const fadeStart = vh - BOTTOM_FADE_ZONE;
      let op = item.baseOpacity;
      if (y >= fadeStart) {
        const k = clamp((vh - y) / BOTTOM_FADE_ZONE, 0, 1);
        op = item.baseOpacity * k;
      }

      item.el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      item.el.style.opacity = String(op);

      if (y > vh + 40 || op <= 0.02) kill(item);
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  window.__snowScreen = {
    start() { running = true; },
    stop() { running = false; },
    clear() { for (const item of [...active]) kill(item); },
    destroy() {
      running = false;
      for (const item of [...active]) kill(item);
      layer.remove();
      delete window.__snowScreen;
    },
  };
})();