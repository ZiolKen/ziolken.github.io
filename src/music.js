(() => {
  const $ = (id) => document.getElementById(id);

  const elCard = $("music-card");
  if (!elCard) return;

  const elAudio = $("music-audio");
  const elCover = $("music-cover-img");
  const elTitle = $("music-title");
  const elArtist = $("music-artist");
  const elPrev = $("music-prev");
  const elNext = $("music-next");
  const elPlay = $("music-play");
  const elMute = $("music-mute");
  const elProgress = $("music-progress");
  const elFill = $("music-progress-fill");
  const elKnob = $("music-progress-knob");

  if (
    !elAudio ||
    !elCover ||
    !elTitle ||
    !elArtist ||
    !elPrev ||
    !elNext ||
    !elPlay ||
    !elMute ||
    !elProgress ||
    !elFill ||
    !elKnob
  ) {
    return;
  }

  const bars = Array.from(elMute.querySelectorAll(".mvb"));

  const tracks = [
    { title: "Bloody Moon", artist: "Unknown", src: "assets/bloody_moon.mp3", cover: "res/music.png" },
  ];

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  const state = {
    idx: 0,
    dragging: false,
    dragRatio: 0,
    pendingSeekRatio: null,
    ctx: null,
    analyser: null,
    data: null,
    wired: false,
    vizRaf: 0,
  };

  elAudio.preload = "metadata";
  elAudio.playsInline = true;
  elAudio.setAttribute("playsinline", "");
  if (!elAudio.crossOrigin) elAudio.crossOrigin = "anonymous";

  if (!elProgress.style.touchAction) elProgress.style.touchAction = "none";
  if (!elProgress.hasAttribute("tabindex")) elProgress.tabIndex = 0;

  const getDuration = () => {
    const d = elAudio.duration;
    if (Number.isFinite(d) && d > 0) return d;

    const s = elAudio.seekable;
    if (s && s.length) {
      const end = s.end(s.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
    return 0;
  };

  const renderProgress = (ratio) => {
    const pct = clamp01(ratio) * 100;
    elFill.style.width = `${pct}%`;
    elKnob.style.left = `${pct}%`;
  };

  const ratioFromPointer = (e) => {
    const rect = elProgress.getBoundingClientRect();
    const w = rect.width || 1;
    const x = (e.clientX ?? 0) - rect.left;
    return clamp01(x / w);
  };

  const ensureAudioGraph = () => {
    if (state.wired) return;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      state.wired = true;
      return;
    }

    try {
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(elAudio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      state.ctx = ctx;
      state.analyser = analyser;
      state.data = new Uint8Array(analyser.frequencyBinCount);

      src.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      state.ctx = null;
      state.analyser = null;
      state.data = null;
    } finally {
      state.wired = true;
    }
  };

  const unlockAudio = () => {
    ensureAudioGraph();
    if (state.ctx && state.ctx.state === "suspended") {
      state.ctx.resume().catch(() => {});
    }
  };

  const play = () => {
    unlockAudio();

    const p = elAudio.play();
    if (p && typeof p.catch === "function") return p.catch(() => {});
    return Promise.resolve();
  };

  const pause = () => {
    try {
      elAudio.pause();
    } catch {}
  };

  const toggle = () => (elAudio.paused ? play() : (pause(), Promise.resolve()));

  const stopViz = () => {
    if (state.vizRaf) cancelAnimationFrame(state.vizRaf);
    state.vizRaf = 0;
    for (const b of bars) b.style.height = "10px";
  };

  const stepViz = () => {
    const analyser = state.analyser;
    const data = state.data;
    if (!analyser || !data || !bars.length) return;

    analyser.getByteFrequencyData(data);

    const n = data.length;
    const picks = [0.05, 0.12, 0.2, 0.32, 0.5, 0.72].map((p) => Math.min(n - 1, Math.floor(n * p)));
    const maxH = 28;
    const minH = 8;

    for (let i = 0; i < bars.length; i++) {
      const v = data[picks[i % picks.length]] / 255;
      const h = Math.round(minH + v * (maxH - minH));
      bars[i].style.height = `${h}px`;
    }

    state.vizRaf = requestAnimationFrame(stepViz);
  };

  const startViz = () => {
    stopViz();
    if (!state.analyser || !state.data || !bars.length) return;
    state.vizRaf = requestAnimationFrame(stepViz);
  };

  const syncProgressFromAudio = () => {
    if (state.dragging) return;
    const dur = getDuration();
    const cur = elAudio.currentTime || 0;
    renderProgress(dur > 0 ? cur / dur : 0);
  };

  const commitSeek = (ratio) => {
    const dur = getDuration();
    if (!dur) {
      state.pendingSeekRatio = ratio;
      return;
    }

    state.pendingSeekRatio = null;
    const t = clamp01(ratio) * dur;

    try {
      elAudio.currentTime = t;
    } catch {}
  };

  const load = (i) => {
    state.idx = (i + tracks.length) % tracks.length;
    const t = tracks[state.idx] || {};

    elTitle.textContent = t.title || "Unknown";
    elArtist.textContent = t.artist || "Unknown";
    elCover.src = t.cover || "";
    elAudio.src = t.src || "";

    renderProgress(0);

    try {
      elAudio.load();
    } catch {}
  };

  const playIndex = (i) => {
    if (Number.isFinite(i)) load(i);
    return play();
  };

  const onDragStart = (e) => {
    if (e.button != null && e.button !== 0) return;

    unlockAudio();
    state.dragging = true;
    state.dragRatio = ratioFromPointer(e);
    renderProgress(state.dragRatio);

    if (typeof elProgress.setPointerCapture === "function") {
      try {
        elProgress.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const onDragMove = (e) => {
    if (!state.dragging) return;
    state.dragRatio = ratioFromPointer(e);
    renderProgress(state.dragRatio);
  };

  const onDragEnd = (e) => {
    if (!state.dragging) return;

    state.dragging = false;

    if (typeof elProgress.releasePointerCapture === "function") {
      try {
        elProgress.releasePointerCapture(e.pointerId);
      } catch {}
    }

    commitSeek(state.dragRatio);
    syncProgressFromAudio();
  };

  elPrev.addEventListener("click", () => {
    const wasPlaying = !elAudio.paused;
    load(state.idx - 1);
    if (wasPlaying) void play();
  });

  elNext.addEventListener("click", () => {
    const wasPlaying = !elAudio.paused;
    load(state.idx + 1);
    if (wasPlaying) void play();
  });

  elPlay.addEventListener("click", () => {
    void toggle();
  });

  elMute.addEventListener("click", () => {
    elAudio.muted = !elAudio.muted;
    elCard.classList.toggle("is-muted", elAudio.muted);
  });

  elProgress.addEventListener("pointerdown", onDragStart);
  elProgress.addEventListener("pointermove", onDragMove);
  elProgress.addEventListener("pointerup", onDragEnd);
  elProgress.addEventListener("pointercancel", onDragEnd);
  elProgress.addEventListener("lostpointercapture", onDragEnd);

  elProgress.addEventListener("keydown", (e) => {
    const dur = getDuration();
    if (!dur) return;

    if (e.key === "ArrowLeft") elAudio.currentTime = Math.max(0, (elAudio.currentTime || 0) - 5);
    if (e.key === "ArrowRight") elAudio.currentTime = Math.min(dur, (elAudio.currentTime || 0) + 5);
  });

  elAudio.addEventListener("loadedmetadata", () => {
    if (state.pendingSeekRatio != null) commitSeek(state.pendingSeekRatio);
    syncProgressFromAudio();
  });

  elAudio.addEventListener("durationchange", syncProgressFromAudio);
  elAudio.addEventListener("timeupdate", syncProgressFromAudio);
  elAudio.addEventListener("seeked", syncProgressFromAudio);

  elAudio.addEventListener("play", () => {
    elCard.classList.add("is-playing");
    startViz();
  });

  elAudio.addEventListener("pause", () => {
    elCard.classList.remove("is-playing");
    stopViz();
  });

  elAudio.addEventListener("ended", () => {
    load(state.idx + 1);
    void play();
  });

  load(0);

  window.__ziolkenMusic = {
    tracks,
    getIndex: () => state.idx,
    setIndex: (i) => load(i),
    play: (i) => playIndex(i),
    pause: () => pause(),
    toggle: () => toggle(),
    audio: elAudio,
  };

  window.setActiveTrack = (i) => load(i);
})();