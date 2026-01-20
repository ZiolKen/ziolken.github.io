(() => {
  const EMOJI = "❄️";
  const SPAWN_INTERVAL_MS = 100;
  const MAX_ON_SCREEN = 100;
  const BOTTOM_FADE_ZONE = 100;
  const Z_INDEX = 999999;

  let lastSpawn = 0;
  const active = new Set();

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: String(Z_INDEX),
  });
  document.documentElement.appendChild(layer);

  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function spawnSnowflake(x, y) {
    if (active.size >= MAX_ON_SCREEN) {
      const it = active.values().next().value;
      if (it) {
        it.el.remove();
        active.delete(it);
      }
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

    setTimeout(() => {
      if (!item.dead) kill(item);
    }, Math.ceil(item.lifetimeCap * 1000) + 800);
  }

  function kill(item) {
    item.dead = true;
    item.el.remove();
    active.delete(item);
  }

  function animate(now) {
    const vh = window.innerHeight;

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

  function onMove(e) {
    const now = performance.now();
    if (now - lastSpawn < SPAWN_INTERVAL_MS) return;
    lastSpawn = now;
    spawnSnowflake(e.clientX, e.clientY);
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  requestAnimationFrame(animate);

  window.__snowMouse = {
    stop() {
      window.removeEventListener("mousemove", onMove);
      for (const item of [...active]) kill(item);
    },
    start() {
      window.addEventListener("mousemove", onMove, { passive: true });
    },
  };
})();