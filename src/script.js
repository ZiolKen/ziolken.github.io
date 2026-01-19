(() => {
  "use strict";

  const TITLES = ["@ziolken ~ portfolio", "root@ziolken $ about", ">_ print('Hello World')"];
  const CURSOR = "▌";
  const BLANK = "\u00A0";

  const randInt = (min, max) => (Math.random() * (max - min + 1) + min) | 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let lastIdx = -1;
  const pickRandomTitle = () => {
    let idx = 0;
    do idx = randInt(0, TITLES.length - 1);
    while (TITLES.length > 1 && idx === lastIdx);
    lastIdx = idx;
    return TITLES[idx];
  };

  const titleState = { text: "", cursorOn: true };
  const renderTitle = () => {
    document.title = (titleState.text && titleState.text.length ? titleState.text : BLANK) + (titleState.cursorOn ? CURSOR : "");
  };

  setInterval(() => {
    titleState.cursorOn = !titleState.cursorOn;
    renderTitle();
  }, 450);

  const typeIn = async (text) => {
    for (let i = 0; i <= text.length; i++) {
      titleState.text = text.slice(0, i);
      renderTitle();
      await sleep(randInt(60, 140));
    }
  };

  const deleteOut = async (current) => {
    for (let i = current.length; i >= 0; i--) {
      titleState.text = current.slice(0, i);
      renderTitle();
      await sleep(randInt(40, 90));
    }
  };

  (async () => {
    let current = "";
    while (true) {
      const next = pickRandomTitle();
      if (current) {
        await deleteOut(current);
        await sleep(200);
      }
      await typeIn(next);
      current = next;
      await sleep(1200);
    }
  })().catch(() => {});

  const injectRuntimeCss = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const style = document.createElement("style");
      style.id = "ziolken-runtime-css";
      style.textContent = `
        #projects-grid.projects-marquee{
          overflow-x:auto!important;
          overflow-y:hidden!important;
          -webkit-overflow-scrolling:touch;
          overscroll-behavior-x:contain;
          touch-action:pan-x;
          scrollbar-width:none;
        }
        #projects-grid.projects-marquee::-webkit-scrollbar{display:none}
        .projects-track{
          display:flex;
          flex-wrap:nowrap;
          align-items:stretch;
          width:max-content;
        }
        .projects-track>.project-card{flex:0 0 auto}
      `.trim();
      document.head.appendChild(style);
    };
  })();

  const $ = (s, r = document) => r.querySelector(s);
  const projectsGrid = $("#projects-grid");

  const FeaturedProjects = (() => {
    if (!projectsGrid) return null;

    injectRuntimeCss();

    const owner = "ZiolKen";
    const apiUrl = `https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`;
    const cacheKey = `gh_deployed_${owner}_v2`;
    const cacheTtlMs = 10 * 60 * 1000;

    let destroyMarquee = null;
    let clickBound = false;
    let inflight = null;
    let renderAbort = null;

    const safeStorage = (() => {
      try {
        const k = "__t__";
        localStorage.setItem(k, "1");
        localStorage.removeItem(k);
        return localStorage;
      } catch {
        return null;
      }
    })();

    const escapeHtml = (s) =>
      String(s ?? "").replace(/[&<>"']/g, (c) => {
        if (c === "&") return "&amp;";
        if (c === "<") return "&lt;";
        if (c === ">") return "&gt;";
        if (c === '"') return "&quot;";
        return "&#39;";
      });

    const formatNum = (n) => {
      const x = Number(n) || 0;
      if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x % 1_000_000 === 0 ? 0 : 1)}M`;
      if (x >= 1_000) return `${(x / 1_000).toFixed(x % 1_000 === 0 ? 0 : 1)}K`;
      return `${x}`;
    };

    const readCache = () => {
      if (!safeStorage) return null;
      try {
        const raw = safeStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.data)) return null;
        const ts = Number(parsed.ts) || 0;
        const etag = typeof parsed.etag === "string" ? parsed.etag : "";
        return { ts, etag, data: parsed.data };
      } catch {
        return null;
      }
    };

    const writeCache = (payload) => {
      if (!safeStorage) return;
      try {
        safeStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch {}
    };

    const isDeployed = (r) => {
      const home = (r.homepage || "").trim();
      return Boolean(home) || Boolean(r.has_pages);
    };

    const liveUrlOf = (r) => {
      const home = (r.homepage || "").trim();
      if (home) return home;
      if (r.has_pages) return `https://${owner.toLowerCase()}.github.io/${r.name}/`;
      return "";
    };

    const setLoading = () => {
      projectsGrid.innerHTML = `
        <div class="project-card skeleton" style="width:250px; height:170px;"></div>
        <div class="project-card skeleton" style="width:250px; height:170px;"></div>
        <div class="project-card skeleton" style="width:250px; height:170px;"></div>
      `;
    };

    const setError = (msg) => {
      projectsGrid.innerHTML = `
        <div class="project-card error" style="width:420px;">
          <div class="project-name">Failed to load projects</div>
          <div class="project-desc">${escapeHtml(msg || "GitHub API rate limit or network error.")}</div>
        </div>
      `;
    };

    const cardHtml = (r) => {
      const name = escapeHtml(r.name);
      const desc = escapeHtml(r.description || "No description");
      const lang = escapeHtml(r.language || "");
      const url = escapeHtml(r.html_url || "#");
      const stars = formatNum(r.stargazers_count);
      const live = escapeHtml(liveUrlOf(r));

      return `
        <a class="project-card" href="${url}" target="_blank" rel="noreferrer">
          <div class="project-card-head">
            <div class="project-left">
              <img class="project-icon" src="res/default.png" alt="Icon" loading="lazy" onerror="this.onerror=null;this.src='res/default.png';" />
              <div class="project-name">${name}</div>
            </div>
            <div class="project-metrics">
              <span class="metric" title="Stars">★ ${stars}</span>
              <span class="metric github" title="GitHub" aria-label="GitHub">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                  0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52
                  -.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2
                  -3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82
                  .64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
                  .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
                  0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                </svg>
              </span>
            </div>
          </div>

          <div class="project-desc">${desc}</div>

          <div class="project-foot">
            ${lang ? `<span class="chip">${lang}</span>` : `<span></span>`}
            ${live ? `<span class="chip link" data-live="${live}">Live</span>` : ``}
          </div>
        </a>
      `;
    };

    const enableMarquee = (container, { speed = 32, idleMs = 900, copies = 3 } = {}) => {
      if (!container) return () => {};
      container.classList.add("projects-marquee");
    
      const cards = Array.from(container.querySelectorAll(".project-card"));
      if (cards.length <= 1) return () => {};
    
      const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const autoSpeed = reduceMotion ? 0 : Math.max(0, Number(speed) || 0);
    
      const track = document.createElement("div");
      track.className = "projects-track";
    
      const frag = document.createDocumentFragment();
      const c = Math.max(3, copies | 0);
      for (let i = 0; i < c; i++) for (const card of cards) frag.appendChild(card.cloneNode(true));
      track.appendChild(frag);
    
      container.replaceChildren(track);
    
      let raf = 0;
      let ro = null;
      let io = null;
    
      let segment = 0;
      let pos = 0;
      let last = performance.now();
    
      let userHolding = false;
      let lastUser = 0;
    
      let ioActive = true;
    
      let scrollRaf = 0;
      let lastProgrammatic = 0;
    
      const setPos = (p) => {
        if (!segment) return;
    
        if (p >= segment * 2) p -= segment;
        else if (p < segment) p += segment;
    
        pos = p;
    
        const base = Math.floor(pos);
        const frac = pos - base;
    
        lastProgrammatic = performance.now();
        container.scrollLeft = base;
    
        if (frac) track.style.transform = `translate3d(${-frac}px,0,0)`;
        else track.style.transform = "translate3d(0,0,0)";
      };
    
      const measure = () => {
        const total = track.scrollWidth;
        const next = total / c;
        if (!Number.isFinite(next) || next <= 1) return;
        segment = next;
        if (!pos) {
          pos = segment;
          setPos(pos);
        } else {
          setPos(pos);
        }
      };
    
      const onUser = () => {
        lastUser = performance.now();
        if (track.style.transform) track.style.transform = "translate3d(0,0,0)";
        pos = container.scrollLeft;
      };
    
      const onScroll = () => {
        const now = performance.now();
        if (now - lastProgrammatic < 40) return;
    
        onUser();
    
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => {
          if (!segment) measure();
          if (!segment) return;
          setPos(container.scrollLeft);
        });
      };
    
      const onDown = () => {
        userHolding = true;
        onUser();
      };
    
      const onUp = () => {
        userHolding = false;
        onUser();
        last = performance.now();
      };
    
      const onVis = () => {
        last = performance.now();
        onUser();
        if (!document.hidden) {
          measure();
          if (segment) setPos(pos || segment);
        }
      };
    
      const tick = (now) => {
        const dt = Math.min(50, now - last);
        last = now;
    
        if (!segment) measure();
    
        const idle = now - lastUser > idleMs;
        const autoAllowed = ioActive && !userHolding && idle && autoSpeed > 0 && segment > 1;
    
        if (autoAllowed) setPos(pos + (autoSpeed * dt) / 1000);
    
        raf = requestAnimationFrame(tick);
      };
    
      container.addEventListener("scroll", onScroll, { passive: true });
      container.addEventListener("wheel", onUser, { passive: true });
      container.addEventListener("touchstart", onDown, { passive: true });
      container.addEventListener("touchend", onUp, { passive: true });
      container.addEventListener("touchcancel", onUp, { passive: true });
      container.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
      container.addEventListener("mouseenter", onDown, { passive: true });
      container.addEventListener("mouseleave", onUp, { passive: true });
      container.addEventListener("focusin", onDown, { passive: true });
      container.addEventListener("focusout", onUp, { passive: true });
      document.addEventListener("visibilitychange", onVis);
    
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => {
          measure();
          if (segment) setPos(pos || segment);
        });
        ro.observe(track);
      }
    
      if (window.IntersectionObserver) {
        io = new IntersectionObserver(
          (entries) => {
            const e = entries && entries[0];
            ioActive = !!(e && e.isIntersecting);
            last = performance.now();
            if (ioActive) {
              measure();
              if (segment) setPos(pos || segment);
            }
          },
          { threshold: 0.01 }
        );
        io.observe(container);
      }
    
      requestAnimationFrame(() => {
        measure();
        if (segment) setPos(segment);
        last = performance.now();
        raf = requestAnimationFrame(tick);
      });
    
      return () => {
        cancelAnimationFrame(raf);
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        ro && ro.disconnect();
        io && io.disconnect();
    
        container.removeEventListener("scroll", onScroll);
        container.removeEventListener("wheel", onUser);
        container.removeEventListener("touchstart", onDown);
        container.removeEventListener("touchend", onUp);
        container.removeEventListener("touchcancel", onUp);
        container.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        container.removeEventListener("mouseenter", onDown);
        container.removeEventListener("mouseleave", onUp);
        container.removeEventListener("focusin", onDown);
        container.removeEventListener("focusout", onUp);
        document.removeEventListener("visibilitychange", onVis);
      };
    };

    const fetchRepos = async ({ force = false, signal } = {}) => {
      const cached = readCache();

      if (!force && cached && Date.now() - cached.ts <= cacheTtlMs) return cached.data;

      if (!force && inflight) return inflight;

      const task = (async () => {
        const headers = { Accept: "application/vnd.github+json" };
        if (cached && cached.etag) headers["If-None-Match"] = cached.etag;

        try {
          const res = await fetch(apiUrl, { headers, cache: "no-store", signal });

          if (res.status === 304 && cached && Array.isArray(cached.data)) return cached.data;

          if (!res.ok) {
            const remaining = res.headers.get("x-ratelimit-remaining");
            if ((res.status === 403 || res.status === 429) && remaining === "0" && cached && Array.isArray(cached.data)) return cached.data;
            throw new Error(`GitHub API error (${res.status})`);
          }

          const data = await res.json();
          const etag = res.headers.get("etag") || "";
          writeCache({ ts: Date.now(), etag, data });
          return data;
        } catch (e) {
          if (cached && Array.isArray(cached.data)) return cached.data;
          throw e;
        }
      })();

      inflight = task.finally(() => {
        inflight = null;
      });

      return inflight;
    };

    const getDeployedRepos = async (opts = {}) => {
      const repos = await fetchRepos(opts);
      return repos
        .filter((r) => !r.fork && !r.archived)
        .filter(isDeployed)
        .sort((a, b) => new Date(b.pushed_at || b.updated_at || 0) - new Date(a.pushed_at || a.updated_at || 0));
    };

    const render = async ({ force = false } = {}) => {
      renderAbort && renderAbort.abort();
      renderAbort = new AbortController();

      setLoading();

      try {
        const repos = await fetchRepos({ force, signal: renderAbort.signal });
        const list = repos
          .filter((r) => !r.fork && !r.archived)
          .filter(isDeployed)
          .sort((a, b) => new Date(b.pushed_at || b.updated_at || 0) - new Date(a.pushed_at || a.updated_at || 0))
          .slice(0, 5);

        projectsGrid.innerHTML = list.map(cardHtml).join("");

        if (!clickBound) {
          clickBound = true;
          projectsGrid.addEventListener(
            "click",
            (e) => {
              const chip = e.target && e.target.closest && e.target.closest(".chip.link[data-live]");
              if (!chip) return;
              const live = chip.getAttribute("data-live");
              if (!live) return;
              e.preventDefault();
              window.open(live, "_blank", "noopener,noreferrer");
            },
            { passive: false }
          );
        }

        destroyMarquee && destroyMarquee();
        destroyMarquee = enableMarquee(projectsGrid, { speed: 30, idleMs: 900, copies: 3 });
      } catch (e) {
        setError(e && e.message ? e.message : "");
      }
    };

    render();

    return { owner, fetchRepos, getDeployedRepos, render, liveUrlOf };
  })();

  window.__ziolken = window.__ziolken || {};
  window.__ziolken.FeaturedProjects = FeaturedProjects;
})();