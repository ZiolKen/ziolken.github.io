(() => {
  const $ = (s, root = document) => root.querySelector(s);

  function tokenize(input) {
    const s = (input ?? "").trim();
    if (!s) return [];
    const tokens = [];
    let cur = "";
    let quote = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === "\\" && i + 1 < s.length) {
          cur += s[++i];
          continue;
        }
        if (ch === quote) {
          quote = null;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === "\\" && i + 1 < s.length) {
        cur += s[++i];
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        continue;
      }
      if (/\s/.test(ch)) {
        if (cur) tokens.push(cur), (cur = "");
        continue;
      }
      cur += ch;
    }
    if (cur) tokens.push(cur);
    return tokens;
  }

  function splitCommands(input) {
    const s = (input ?? "").trim();
    if (!s) return [];
    const out = [];
    let cur = "";
    let quote = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === "\\" && i + 1 < s.length) {
          cur += ch + s[++i];
          continue;
        }
        if (ch === quote) {
          quote = null;
          cur += ch;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === ";") {
        const t = cur.trim();
        if (t) out.push(t);
        cur = "";
        continue;
      }
      cur += ch;
    }
    const t = cur.trim();
    if (t) out.push(t);
    return out;
  }

  function isNearBottom(el, threshold = 24) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  function safeText(node, text) {
    node.textContent = text == null ? "" : String(text);
  }

  function makeSafeLink(href, label) {
    try {
      const u = new URL(href, location.href);
      const ok = ["http:", "https:", "mailto:"].includes(u.protocol);
      if (!ok) return null;
      const a = document.createElement("a");
      a.href = u.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "term-link";
      a.textContent = label ?? u.href;
      return a;
    } catch {
      return null;
    }
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function wmoDesc(code) {
    const c = Number(code);
    const map = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      48: "Depositing rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      56: "Light freezing drizzle",
      57: "Dense freezing drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      66: "Light freezing rain",
      67: "Heavy freezing rain",
      71: "Slight snow fall",
      73: "Moderate snow fall",
      75: "Heavy snow fall",
      77: "Snow grains",
      80: "Slight rain showers",
      81: "Moderate rain showers",
      82: "Violent rain showers",
      85: "Slight snow showers",
      86: "Heavy snow showers",
      95: "Thunderstorm",
      96: "Thunderstorm with slight hail",
      99: "Thunderstorm with heavy hail",
    };
    return map[c] ?? `Weather code ${c}`;
  }

  function getMusicApi() {
    return window.__ziolkenMusic || null;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(t);
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          },
          { once: true }
        );
      }
    });
  }

  function mergeSignal(ctxSignal, timeoutMs) {
    const controller = new AbortController();
    if (ctxSignal) {
      if (ctxSignal.aborted) controller.abort();
      else ctxSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    let to = 0;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      to = setTimeout(() => controller.abort(), timeoutMs);
      controller.signal.addEventListener(
        "abort",
        () => {
          if (to) clearTimeout(to);
        },
        { once: true }
      );
    }
    return controller.signal;
  }

  function toHex(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  function b64Bytes(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function unb64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function b64urlToB64(s) {
    const t = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = t.length % 4 ? 4 - (t.length % 4) : 0;
    return t + "=".repeat(pad);
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  class WebTerminal {
    constructor(opts) {
      this.out = opts.out;
      this.input = opts.input;
      this.clearBtn = opts.clearBtn ?? null;
      this.promptEl = opts.promptEl ?? null;
      this.root = opts.root ?? this.out.closest("#terminal") ?? this.out.parentElement ?? document.body;
      this.maxLines = opts.maxLines ?? 700;
      this.persistKey = opts.persistKey ?? "webterm.history";
      this.getPrompt = opts.getPrompt ?? (() => this.promptEl?.textContent || "user@site:~$");
      this.onCommand = opts.onCommand ?? (async () => {});
      this.history = this._loadHistory();
      this.hIndex = this.history.length;
      this.completions = opts.completions ?? (() => []);
      this._tabCycle = { base: "", list: [], idx: 0 };
      this._running = false;
      this._abortCtl = null;
      this._bind();
    }

    _bind() {
      this.input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = this.input.value;
          this.input.value = "";
          await this.run(v);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this._historyUp();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this._historyDown();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          this._autocomplete();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
          e.preventDefault();
          this.clear();
          return;
        }
        if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
          const hasSelection = this.input.selectionStart !== this.input.selectionEnd;
          if (hasSelection) return;
          if (this._running && this._abortCtl) {
            e.preventDefault();
            this._abortCtl.abort();
            this.println("^C", "term-bad");
          }
          return;
        }
      });

      this.out.addEventListener("mousedown", () => this.focus());
      this.out.addEventListener(
        "wheel",
        (e) => {
          const el = this.out;
          const canScroll = el.scrollHeight > el.clientHeight + 1;
          if (!canScroll) return;

          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          const up = e.deltaY < 0;

          if ((up && !atTop) || (!up && !atBottom)) {
            e.stopPropagation();
            e.preventDefault();
            el.scrollTop += e.deltaY;
          }
        },
        { passive: false }
      );
      this.clearBtn?.addEventListener("click", () => this.clear());
      setTimeout(() => this.focus(), 150);
    }

    focus() {
      this.input?.focus();
    }

    clear() {
      this.out.innerHTML = "";
    }

    println(text = "", cls) {
      const shouldStick = isNearBottom(this.out);
      const div = document.createElement("div");
      if (cls) div.className = cls;
      safeText(div, text);
      this.out.appendChild(div);
      this._trimLines();
      if (shouldStick) this.out.scrollTop = this.out.scrollHeight;
    }

    printNode(node, cls) {
      const shouldStick = isNearBottom(this.out);
      const div = document.createElement("div");
      if (cls) div.className = cls;
      div.appendChild(node);
      this.out.appendChild(div);
      this._trimLines();
      if (shouldStick) this.out.scrollTop = this.out.scrollHeight;
    }

    printParts(parts, cls) {
      const span = document.createElement("span");
      for (const p of parts) {
        if (p == null) continue;
        if (typeof p === "string") span.appendChild(document.createTextNode(p));
        else span.appendChild(p);
      }
      this.printNode(span, cls);
    }

    echoCommand(cmd) {
      this.println(`${this.getPrompt()} ${cmd}`);
    }

    _trimLines() {
      const extra = this.out.childNodes.length - this.maxLines;
      if (extra > 0) {
        for (let i = 0; i < extra; i++) this.out.removeChild(this.out.firstChild);
      }
    }

    _saveHistory() {
      try {
        localStorage.setItem(this.persistKey, JSON.stringify(this.history.slice(-400)));
      } catch {}
    }

    _loadHistory() {
      try {
        const raw = localStorage.getItem(this.persistKey);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
      } catch {
        return [];
      }
    }

    _pushHistory(cmd) {
      const t = cmd.trim();
      if (!t) return;
      if (this.history[this.history.length - 1] !== t) this.history.push(t);
      this.hIndex = this.history.length;
      this._saveHistory();
    }

    _historyUp() {
      if (!this.history.length) return;
      this.hIndex = clamp(this.hIndex - 1, 0, this.history.length);
      this.input.value = this.history[this.hIndex] ?? "";
      queueMicrotask(() => this.input.setSelectionRange(this.input.value.length, this.input.value.length));
    }

    _historyDown() {
      if (!this.history.length) return;
      this.hIndex = clamp(this.hIndex + 1, 0, this.history.length);
      this.input.value = this.hIndex === this.history.length ? "" : (this.history[this.hIndex] ?? "");
      queueMicrotask(() => this.input.setSelectionRange(this.input.value.length, this.input.value.length));
    }

    _autocomplete() {
      const v = this.input.value;
      const trimmedLeft = v.replace(/^\s+/, "");
      const parts = tokenize(trimmedLeft);
      const current = parts.length ? parts[0] : "";
      const all = this.completions();

      if (this._tabCycle.base !== current) {
        const list = all.filter((c) => c.startsWith(current));
        this._tabCycle = { base: current, list, idx: 0 };
      }

      const { list } = this._tabCycle;
      if (!list.length) return;

      const pick = list[this._tabCycle.idx % list.length];
      this._tabCycle.idx++;

      const rest = parts.slice(1).join(" ");
      this.input.value = rest ? `${pick} ${rest}` : pick;
      queueMicrotask(() => this.input.setSelectionRange(this.input.value.length, this.input.value.length));
    }

    async run(raw) {
      const s = (raw ?? "").trim();
      if (!s) return;
      const cmds = splitCommands(s);
      if (!cmds.length) return;
      for (const cmd of cmds) await this._runOne(cmd);
    }

    async _runOne(cmd) {
      const trimmed = (cmd ?? "").trim();
      if (!trimmed) return;
      this.echoCommand(trimmed);
      this._pushHistory(trimmed);

      this._running = true;
      this._abortCtl?.abort();
      this._abortCtl = new AbortController();

      try {
        await this.onCommand(trimmed, { signal: this._abortCtl.signal });
      } catch (err) {
        if (err?.name === "AbortError") this.println("Aborted.", "term-bad");
        else this.println(`Error: ${err?.message ?? String(err)}`, "term-bad");
      } finally {
        this._running = false;
      }
    }
  }

  function initTerminal() {
    const out = $("#terminal-out");
    const input = $("#terminal-in");
    const clearBtn = $("#term-clear");
    if (!out || !input) return;

    const promptEl = $("#terminal-prompt");
    const root = $("#terminal") ?? out.closest("[data-terminal]") ?? out.parentElement ?? document.body;

    const term = new WebTerminal({
      out,
      input,
      clearBtn,
      promptEl,
      root,
      maxLines: 900,
      persistKey: "portfolio.terminal.history",
      completions: () => (window.__termCommands ? window.__termCommands() : []),
    });

    const commands = new Map();
    const register = (name, meta) => commands.set(name, { name, ...meta });
    const listCommands = () => [...commands.keys()].sort();
    window.__termCommands = () => listCommands();

    const themeKey = "portfolio.terminal.theme";
    const weatherKey = "portfolio.terminal.weather.location";
    const themes = ["default", "matrix", "amber", "ice", "mono"];

    function getTheme() {
      try {
        return localStorage.getItem(themeKey) || "default";
      } catch {
        return "default";
      }
    }

    function setTheme(name) {
      const t = themes.includes(name) ? name : "default";
      themes.forEach((x) => term.root.classList.remove(`term-theme-${x}`));
      term.root.classList.add(`term-theme-${t}`);
      try {
        localStorage.setItem(themeKey, t);
      } catch {}
      return t;
    }

    function getDefaultLocation() {
      try {
        return localStorage.getItem(weatherKey) || "Asia";
      } catch {
        return "Asia";
      }
    }

    function setDefaultLocation(loc) {
      try {
        localStorage.setItem(weatherKey, loc);
      } catch {}
    }

    async function fetchWeatherByName(name, signal) {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        name
      )}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl, { cache: "no-store", signal });
      if (!geoRes.ok) throw new Error("Geocoding failed");
      const geo = await geoRes.json();
      const r = geo?.results?.[0];
      if (!r?.latitude || !r?.longitude) throw new Error("Location not found");
      const lat = r.latitude;
      const lon = r.longitude;
      const place = [r.name, r.admin1, r.country].filter(Boolean).join(", ");

      const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
        lat
      )}&longitude=${encodeURIComponent(
        lon
      )}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
      const wxRes = await fetch(wxUrl, { cache: "no-store", signal });
      if (!wxRes.ok) throw new Error("Weather fetch failed");
      const wx = await wxRes.json();
      const cur = wx?.current;
      if (!cur) throw new Error("Weather data unavailable");
      return {
        place,
        time: cur.time,
        temp: cur.temperature_2m,
        humid: cur.relative_humidity_2m,
        wind: cur.wind_speed_10m,
        code: cur.weather_code,
        unitTemp: wx?.current_units?.temperature_2m || "°C",
        unitHumid: wx?.current_units?.relative_humidity_2m || "%",
        unitWind: wx?.current_units?.wind_speed_10m || "km/h",
      };
    }

    const ghOwner = "ZiolKen";
    const ghApiUrl = `https://api.github.com/users/${ghOwner}/repos?per_page=100&sort=updated`;
    const ghCacheKey = `gh_deployed_${ghOwner}_v1`;
    const ghCacheTtlMs = 10 * 60 * 1000;
    let lastProjects = [];

    const readGhCache = () => {
      try {
        const raw = localStorage.getItem(ghCacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || !Array.isArray(parsed?.data)) return null;
        if (Date.now() - parsed.ts > ghCacheTtlMs) return null;
        return parsed.data;
      } catch {
        return null;
      }
    };

    const writeGhCache = (data) => {
      try {
        localStorage.setItem(ghCacheKey, JSON.stringify({ ts: Date.now(), data }));
      } catch {}
    };

    const isDeployed = (r) => {
      const home = (r.homepage || "").trim();
      return Boolean(home) || Boolean(r.has_pages);
    };

    const liveUrlOf = (r) => {
      const home = (r.homepage || "").trim();
      if (home) return home;
      if (r.has_pages) return `https://${ghOwner.toLowerCase()}.github.io/${r.name}/`;
      return "";
    };

    const formatNum = (n) => {
      const x = Number(n) || 0;
      if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x % 1_000_000 === 0 ? 0 : 1)}M`;
      if (x >= 1_000) return `${(x / 1_000).toFixed(x % 1_000 === 0 ? 0 : 1)}K`;
      return `${x}`;
    };

    async function fetchGhRepos({ force = false, signal } = {}) {
      if (!force) {
        const cached = readGhCache();
        if (cached) return cached;
      }
      const res = await fetch(ghApiUrl, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error("GitHub API error");
      const data = await res.json();
      writeGhCache(data);
      return data;
    }

    async function getDeployedProjects({ force = false, signal } = {}) {
      const repos = await fetchGhRepos({ force, signal });
      const list = repos
        .filter((r) => r && !r.fork && !r.archived)
        .filter(isDeployed)
        .sort((a, b) => new Date(b.pushed_at || b.updated_at || 0) - new Date(a.pushed_at || a.updated_at || 0))
        .slice(0, 10)
        .map((r) => ({
          name: r.name,
          desc: r.description || "No description",
          lang: r.language || "",
          stars: r.stargazers_count || 0,
          url: r.html_url,
          live: liveUrlOf(r),
        }));
      lastProjects = list;
      return list;
    }

    function kvList(prefix = "") {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (prefix && !k.startsWith(prefix)) continue;
          out.push(k);
        }
      } catch {}
      out.sort();
      return out;
    }

    async function httpFetch(url, opts, { signal, timeoutMs } = {}) {
      const sig = mergeSignal(signal, timeoutMs);
      const t0 = performance.now();
      const res = await fetch(url, Object.assign({ cache: "no-store" }, opts || {}, { signal: sig }));
      const ms = Math.round(performance.now() - t0);
      return { res, ms };
    }

    async function readBodyLimited(res, maxBytes) {
      const lim = clamp(Number(maxBytes || 4096) || 4096, 0, 5_000_000);
      if (lim === 0) return "";
      const ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
      if (ct.includes("application/json")) {
        const txt = await res.text();
        return txt.length > lim ? txt.slice(0, lim) + `\n… truncated (${txt.length} chars)` : txt;
      }
      const txt = await res.text();
      return txt.length > lim ? txt.slice(0, lim) + `\n… truncated (${txt.length} chars)` : txt;
    }

    register("help", {
      desc: "Show available commands",
      usage: "help [command]",
      run: async (args) => {
        const q = args[0];
        if (q) {
          const c = commands.get(q);
          if (!c) return term.println(`No help for: ${q}`, "term-bad");
          term.println(`${q} — ${c.desc ?? ""}`, "term-muted");
          if (c.usage) term.println(`Usage: ${c.usage}`, "term-muted");
          return;
        }
        term.println("Commands:", "term-muted");
        for (const name of listCommands()) {
          const c = commands.get(name);
          term.println(`- ${name}${c?.desc ? `: ${c.desc}` : ""}`, "term-muted");
        }
        term.println("Tips: ↑/↓ history, Tab autocomplete, Ctrl+L clear, Ctrl+C abort, use ';' to chain", "term-muted");
      },
    });

    register("man", { desc: "Alias for help", usage: "man [command]", run: async (args, ctx) => commands.get("help").run(args, ctx) });

    register("clear", { desc: "Clear terminal output", usage: "clear", run: async () => term.clear() });

    register("about", {
      desc: "Show about info",
      usage: "about",
      run: async () => {
        term.println("@ziolken — web terminal.", "term-muted");
        term.println("Try: curl | ping | dig | rdap | sha256 | base64 | jwt | passgen | projects | contact", "term-muted");
      },
    });

    register("history", {
      desc: "Show command history",
      usage: "history [n]",
      run: async (args) => {
        const n = clamp(Number(args[0] || 40) || 40, 1, 400);
        const h = term.history.slice(-n);
        if (!h.length) return term.println("No history.", "term-muted");
        for (let i = 0; i < h.length; i++) term.println(`${String(i + 1).padStart(3, " ")}  ${h[i]}`, "term-muted");
      },
    });

    register("now", { desc: "Show current time", usage: "now", run: async () => term.println(new Date().toString(), "term-muted") });
    register("date", { desc: "Alias for now", usage: "date", run: async (a, c) => commands.get("now").run(a, c) });

    register("whoami", {
      desc: "Show browser identity",
      usage: "whoami",
      run: async () => {
        term.println(`UA: ${navigator.userAgent}`, "term-muted");
        term.println(`Lang: ${navigator.language} • Platform: ${navigator.platform || "?"}`, "term-muted");
      },
    });

    register("uname", {
      desc: "Show system info (browser)",
      usage: "uname [-a]",
      run: async (args) => {
        const a = args.includes("-a");
        if (!a) return term.println("WebOS", "term-muted");
        term.println(`WebOS • ${navigator.platform || "?"} • ${navigator.userAgent}`, "term-muted");
      },
    });

    register("echo", { desc: "Print text", usage: "echo <text>", run: async (args) => term.println(args.join(" ")) });

    register("open", {
      desc: "Open a link in a new tab",
      usage: "open <url>",
      run: async (args) => {
        const url = args[0];
        if (!url) return term.println("Usage: open <url>", "term-bad");
        const a = makeSafeLink(url, url);
        if (!a) return term.println("Blocked: only http/https/mailto allowed.", "term-bad");
        window.open(a.href, "_blank", "noopener,noreferrer");
        term.println(`Opened: ${a.href}`, "term-good");
      },
    });

    register("clip", {
      desc: "Clipboard read/write",
      usage: "clip read | clip write <text>",
      run: async (args) => {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "read") {
          try {
            const t = await navigator.clipboard.readText();
            term.println(t || "", "term-muted");
          } catch {
            term.println("Clipboard read blocked by browser.", "term-bad");
          }
          return;
        }
        if (sub === "write") {
          const t = args.slice(1).join(" ");
          if (!t) return term.println("Usage: clip write <text>", "term-bad");
          try {
            await navigator.clipboard.writeText(t);
            term.println("Copied.", "term-good");
          } catch {
            term.println("Clipboard write blocked by browser.", "term-bad");
          }
          return;
        }
        term.println("Usage: clip read | clip write <text>", "term-bad");
      },
    });

    register("sleep", {
      desc: "Wait (useful for chaining)",
      usage: "sleep <ms>",
      run: async (args, ctx) => {
        const ms = Number(args[0]);
        if (!Number.isFinite(ms) || ms < 0) return term.println("Usage: sleep <ms>", "term-bad");
        await sleep(ms, ctx?.signal);
        term.println(`Slept ${Math.round(ms)}ms`, "term-muted");
      },
    });

    register("theme", {
      desc: "Set or list terminal themes",
      usage: "theme [name] | theme list | theme current",
      run: async (args) => {
        const a0 = (args[0] ?? "").toLowerCase();
        if (!a0 || a0 === "list") {
          term.println(`Themes: ${themes.join(", ")}`, "term-muted");
          term.println(`Current: ${getTheme()}`, "term-muted");
          return;
        }
        if (a0 === "current") return term.println(`Current: ${getTheme()}`, "term-muted");
        if (!themes.includes(a0)) {
          term.println(`Unknown theme: ${a0}`, "term-bad");
          return term.println(`Available: ${themes.join(", ")}`, "term-muted");
        }
        const t = setTheme(a0);
        term.println(`Theme set: ${t}`, "term-good");
      },
    });

    register("weather", {
      desc: "Show current weather",
      usage: 'weather [location] | weather set "location" | weather default',
      run: async (args, ctx) => {
        const sub = (args[0] ?? "").toLowerCase();
        if (sub === "default") return term.println(`Default location: ${getDefaultLocation()}`, "term-muted");
        if (sub === "set") {
          const loc = args.slice(1).join(" ").trim();
          if (!loc) return term.println('Usage: weather set "London"', "term-bad");
          setDefaultLocation(loc);
          return term.println(`Default location set: ${loc}`, "term-good");
        }
        const loc = args.join(" ").trim() || getDefaultLocation();
        term.println(`Fetching weather for: ${loc} ... (Ctrl+C to abort)`, "term-muted");
        const signal = ctx?.signal;
        try {
          const w = await fetchWeatherByName(loc, signal);
          term.println(`${w.place} @ ${w.time}`, "term-muted");
          term.println(`${wmoDesc(w.code)} • ${w.temp}${w.unitTemp} • Humidity ${w.humid}${w.unitHumid} • Wind ${w.wind}${w.unitWind}`, "term-good");
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("Weather unavailable (network or location).", "term-bad");
        }
      },
    });

    register("projects", {
      desc: "List deployed GitHub projects",
      usage: "projects | projects refresh | projects open <n> | projects live <n>",
      run: async (args, ctx) => {
        const a0 = (args[0] ?? "").toLowerCase();
        if (a0 === "open" || a0 === "live") {
          const n = Number(args[1]);
          const idx = n - 1;
          if (!Number.isFinite(idx) || idx < 0 || idx >= lastProjects.length) return term.println("Invalid index. Run: projects", "term-bad");
          const p = lastProjects[idx];
          const href = a0 === "live" ? p.live : p.url;
          if (!href) return term.println("No link available.", "term-bad");
          window.open(href, "_blank", "noopener,noreferrer");
          return term.println(`Opened: ${href}`, "term-good");
        }

        const force = a0 === "refresh";
        term.println(`Fetching projects (${ghOwner}) ... (Ctrl+C to abort)`, "term-muted");
        try {
          const list = await getDeployedProjects({ force, signal: ctx?.signal });
          if (!list.length) return term.println("No deployed projects found.", "term-muted");
          term.println("Deployed Projects:", "term-muted");
          for (let i = 0; i < list.length; i++) {
            const p = list[i];
            const gh = makeSafeLink(p.url, "GitHub");
            const live = p.live ? makeSafeLink(p.live, "Live") : null;
            const left = `${String(i + 1).padStart(2, " ")}. ${p.name}`;
            const meta = ` ★${formatNum(p.stars)}${p.lang ? ` • ${p.lang}` : ""} — ${p.desc}`;
            const parts = [left, `  ${meta}  `];
            if (gh) parts.push(gh);
            if (live) parts.push(document.createTextNode("  "), live);
            term.printParts(parts, "term-muted");
          }
          term.println("Use: projects open 1 | projects live 1 | projects refresh", "term-muted");
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("Failed to load projects (rate limit or network).", "term-bad");
        }
      },
    });

    register("contact", {
      desc: "Show contact info",
      usage: "contact",
      run: async () => {
        const tg = makeSafeLink("https://t.me/ZiolKen", "Telegram: @ZiolKen");
        const em = makeSafeLink("mailto:zknisme@gmail.com", "Email: zknisme@gmail.com");
        const dc = makeSafeLink("https://discord.com/users/951037699320602674", "Discord: @ziolken");
        term.println("Contact:", "term-muted");
        if (tg) term.printNode(tg, "term-muted"); else term.println("Telegram: @ZiolKen", "term-muted");
        if (em) term.printNode(em, "term-muted"); else term.println("Email: zknisme@gmail.com", "term-muted");
        if (dc) term.printNode(dc, "term-muted"); else term.println("Discord: @ziolken", "term-muted");
      },
    });

    register("music", {
      desc: "List tracks",
      usage: "music",
      run: async () => {
        const api = getMusicApi();
        const tracks = api?.tracks || [];
        if (!tracks.length) return term.println("No tracks.", "term-muted");
        term.println("Tracks:", "term-muted");
        for (let i = 0; i < tracks.length; i++) {
          const t = tracks[i];
          term.println(`${i + 1}. ${t?.title ?? "Unknown"} — ${t?.artist ?? "Unknown"}`, "term-muted");
        }
        term.println("Use: play 1 | pause", "term-muted");
      },
    });

    register("play", {
      desc: "Play track by index (or resume current)",
      usage: "play [n]",
      run: async (args) => {
        const api = getMusicApi();
        if (!api) return term.println("Music player not found.", "term-bad");
        const n = args[0] ? Number(args[0]) : null;
        try {
          if (n && Number.isFinite(n)) await api.play(n - 1);
          else await api.play();
          const i = api.getIndex?.() ?? 0;
          const t = (api.tracks || [])[i] || {};
          term.println(`Playing #${i + 1}: ${t.title ?? "Unknown"} — ${t.artist ?? "Unknown"}`, "term-good");
        } catch {
          term.println("Cannot autoplay. Click play on the player once.", "term-bad");
        }
      },
    });

    register("pause", {
      desc: "Pause audio",
      usage: "pause",
      run: async () => {
        const api = getMusicApi();
        if (!api) return term.println("Music player not found.", "term-bad");
        api.pause();
        term.println("Paused.", "term-good");
      },
    });

    register("ping", {
      desc: "HTTP latency check (fetch)",
      usage: "ping <url> [count] [--interval ms] [--timeout ms] [--cors|--no-cors]",
      run: async (args, ctx) => {
        const url = args[0];
        if (!url) return term.println("Usage: ping <url> [count] ...", "term-bad");
        const count = clamp(Number(args[1] || 4) || 4, 1, 50);
        const intervalIdx = args.indexOf("--interval");
        const timeoutIdx = args.indexOf("--timeout");
        const intervalMs = intervalIdx >= 0 ? Number(args[intervalIdx + 1]) : 500;
        const timeoutMs = timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : 8000;
        const forceCors = args.includes("--cors");
        const noCors = args.includes("--no-cors") || !forceCors;

        term.println(`PING ${url} x${count} (${noCors ? "no-cors" : "cors"})`, "term-muted");

        let ok = 0;
        for (let i = 0; i < count; i++) {
          const signal = mergeSignal(ctx?.signal, timeoutMs);
          const t0 = performance.now();
          try {
            const res = await fetch(url, {
              method: "GET",
              mode: noCors ? "no-cors" : "cors",
              cache: "no-store",
              signal,
            });
            const ms = Math.round(performance.now() - t0);
            ok++;
            const info = res.type === "opaque" ? "opaque" : `${res.status} ${res.statusText || ""}`.trim();
            term.println(`seq=${i + 1} time=${ms}ms ${info}`, "term-good");
          } catch (e) {
            if (e?.name === "AbortError") throw e;
            const ms = Math.round(performance.now() - t0);
            term.println(`seq=${i + 1} time=${ms}ms failed`, "term-bad");
          }
          if (i + 1 < count) await sleep(intervalMs, ctx?.signal);
        }
        term.println(`--- ${url} ---`, "term-muted");
        term.println(`sent=${count} received=${ok} loss=${Math.round(((count - ok) / count) * 100)}%`, "term-muted");
      },
    });

    register("curl", {
      desc: "HTTP request (fetch)",
      usage: 'curl <url> [-I] [-X METHOD] [-H "K: V"]... [-d data] [--json] [--max n] [--timeout ms] [--cors|--no-cors]',
      run: async (args, ctx) => {
        const url = args[0];
        if (!url) return term.println("Usage: curl <url> ...", "term-bad");

        let method = "GET";
        let headOnly = false;
        let dataStr = null;
        let asJson = false;
        let maxOut = 3000;
        let timeoutMs = 15000;
        let mode = "cors";

        const headers = new Headers();

        for (let i = 1; i < args.length; i++) {
          const a = args[i];
          if (a === "-I") headOnly = true;
          else if (a === "-X" && args[i + 1]) method = String(args[++i]).toUpperCase();
          else if (a === "-H" && args[i + 1]) {
            const h = String(args[++i]);
            const j = h.indexOf(":");
            if (j > 0) headers.set(h.slice(0, j).trim(), h.slice(j + 1).trim());
          } else if (a === "-d" && args[i + 1] != null) dataStr = String(args[++i]);
          else if (a === "--json") asJson = true;
          else if (a === "--max" && args[i + 1]) maxOut = Number(args[++i]);
          else if (a === "--timeout" && args[i + 1]) timeoutMs = Number(args[++i]);
          else if (a === "--no-cors") mode = "no-cors";
          else if (a === "--cors") mode = "cors";
        }

        if (headOnly) method = "HEAD";
        if (dataStr != null && !args.includes("-X")) method = "POST";

        let body = undefined;
        if (dataStr != null) {
          body = dataStr;
          if (asJson) {
            try {
              JSON.parse(dataStr);
              if (!headers.has("content-type")) headers.set("content-type", "application/json");
            } catch {}
          }
          if (!headers.has("content-type") && !asJson) headers.set("content-type", "text/plain;charset=UTF-8");
        }

        if (mode === "no-cors" && method === "HEAD") method = "GET";

        term.println(`curl ${url} (${method}, ${mode}) ... (Ctrl+C to abort)`, "term-muted");

        const signal = mergeSignal(ctx?.signal, timeoutMs);

        try {
          const { res, ms } = await httpFetch(
            url,
            {
              method,
              mode,
              headers,
              body,
            },
            { signal, timeoutMs: 0 }
          );

          if (res.type === "opaque") {
            term.println(`Response: opaque • time=${ms}ms`, "term-muted");
            return term.println("Tip: try --cors (if server allows CORS) to see status/headers/body.", "term-muted");
          }

          term.println(`Status: ${res.status} ${res.statusText || ""} • time=${ms}ms`, "term-good");

          const lines = [];
          res.headers.forEach((v, k) => lines.push(`${k}: ${v}`));
          if (lines.length) {
            term.println("Headers:", "term-muted");
            for (const l of lines) term.println(l, "term-muted");
          }

          if (method === "HEAD" || headOnly) return;

          const txt = await readBodyLimited(res, maxOut);
          if (txt) {
            term.println("Body:", "term-muted");
            term.println(txt, "term-muted");
          } else {
            term.println("Body: <empty>", "term-muted");
          }
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("curl failed (network/CORS/blocked).", "term-bad");
        }
      },
    });

    register("download", {
      desc: "Download a file via fetch (needs CORS)",
      usage: "download <url> [filename] [--timeout ms]",
      run: async (args, ctx) => {
        const url = args[0];
        if (!url) return term.println("Usage: download <url> [filename]", "term-bad");
        const timeoutIdx = args.indexOf("--timeout");
        const timeoutMs = timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : 20000;
        const name = args[1] && !args[1].startsWith("--") ? args[1] : "download";

        term.println(`Downloading: ${url} ... (Ctrl+C to abort)`, "term-muted");
        const signal = mergeSignal(ctx?.signal, timeoutMs);

        try {
          const res = await fetch(url, { mode: "cors", cache: "no-store", signal });
          if (!res.ok) return term.println(`HTTP ${res.status}`, "term-bad");
          const blob = await res.blob();
          const a = document.createElement("a");
          const obj = URL.createObjectURL(blob);
          a.href = obj;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(obj), 2000);
          term.println(`Saved: ${name}`, "term-good");
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("Download failed (CORS/network).", "term-bad");
        }
      },
    });

    register("dig", {
      desc: "DNS lookup via DoH (Cloudflare)",
      usage: "dig <name> [TYPE]",
      run: async (args, ctx) => {
        const name = args[0];
        const type = (args[1] || "A").toUpperCase();
        if (!name) return term.println("Usage: dig <name> [TYPE]", "term-bad");

        const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
        term.println(`dig ${name} ${type} ... (Ctrl+C to abort)`, "term-muted");

        try {
          const { res } = await httpFetch(
            url,
            { headers: { accept: "application/dns-json" }, mode: "cors" },
            { signal: ctx?.signal, timeoutMs: 12000 }
          );
          if (!res.ok) return term.println(`DoH error: HTTP ${res.status}`, "term-bad");
          const j = await res.json();
          const ans = Array.isArray(j.Answer) ? j.Answer : [];
          if (!ans.length) return term.println("No answer.", "term-muted");

          for (const a of ans) {
            const ttl = a.TTL != null ? ` TTL=${a.TTL}` : "";
            term.println(`${name} ${type}${ttl} -> ${a.data}`, "term-good");
          }
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("dig failed (network).", "term-bad");
        }
      },
    });

    register("ip", {
      desc: "Show public IP",
      usage: "ip",
      run: async (args, ctx) => {
        term.println("Fetching public IP ...", "term-muted");
        try {
          const { res } = await httpFetch("https://api.ipify.org?format=json", { mode: "cors" }, { signal: ctx?.signal, timeoutMs: 12000 });
          if (!res.ok) return term.println(`HTTP ${res.status}`, "term-bad");
          const j = await res.json();
          term.println(j.ip || "?", "term-good");
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("ip failed (network/CORS).", "term-bad");
        }
      },
    });

    register("rdap", {
      desc: "Domain/IP RDAP lookup",
      usage: "rdap <domain|ip>",
      run: async (args, ctx) => {
        const q = args[0];
        if (!q) return term.println("Usage: rdap <domain|ip>", "term-bad");

        const isIp = /^[0-9a-fA-F:.]+$/.test(q) && (q.includes(".") || q.includes(":"));
        const url = isIp ? `https://rdap.org/ip/${encodeURIComponent(q)}` : `https://rdap.org/domain/${encodeURIComponent(q)}`;

        term.println(`rdap ${q} ... (Ctrl+C to abort)`, "term-muted");

        try {
          const { res } = await httpFetch(url, { mode: "cors" }, { signal: ctx?.signal, timeoutMs: 15000 });
          if (!res.ok) return term.println(`HTTP ${res.status}`, "term-bad");
          const j = await res.json();

          const handle = j.handle || j.ldhName || j.name || "";
          const status = Array.isArray(j.status) ? j.status.join(", ") : "";
          term.println(`Handle: ${handle || "?"}`, "term-good");
          if (status) term.println(`Status: ${status}`, "term-muted");

          const events = Array.isArray(j.events) ? j.events : [];
          if (events.length) {
            term.println("Events:", "term-muted");
            for (const e of events.slice(0, 8)) term.println(`- ${e.eventAction || "event"} @ ${e.eventDate || "?"}`, "term-muted");
          }

          const ns = Array.isArray(j.nameservers) ? j.nameservers : [];
          if (ns.length) {
            term.println("Nameservers:", "term-muted");
            for (const n of ns.slice(0, 12)) term.println(`- ${n.ldhName || n.name || "?"}`, "term-muted");
          }
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          term.println("rdap failed (network/CORS).", "term-bad");
        }
      },
    });

    register("sha256", {
      desc: "SHA-256 hash (WebCrypto)",
      usage: "sha256 <text>",
      run: async (args) => {
        const t = args.join(" ");
        if (!t) return term.println("Usage: sha256 <text>", "term-bad");
        const enc = new TextEncoder().encode(t);
        const dig = await crypto.subtle.digest("SHA-256", enc);
        term.println(toHex(dig), "term-good");
      },
    });

    register("base64", {
      desc: "Base64 encode/decode (UTF-8)",
      usage: "base64 enc <text> | base64 dec <b64>",
      run: async (args) => {
        const sub = (args[0] || "").toLowerCase();
        if (sub !== "enc" && sub !== "dec") return term.println("Usage: base64 enc <text> | base64 dec <b64>", "term-bad");
        const t = args.slice(1).join(" ");
        if (!t) return term.println("Missing input.", "term-bad");
        try {
          if (sub === "enc") {
            const bytes = new TextEncoder().encode(t);
            term.println(b64Bytes(bytes), "term-good");
          } else {
            const bytes = unb64ToBytes(t);
            term.println(new TextDecoder().decode(bytes), "term-good");
          }
        } catch {
          term.println("Invalid base64.", "term-bad");
        }
      },
    });

    register("jwt", {
      desc: "Decode JWT header/payload (no verify)",
      usage: "jwt <token>",
      run: async (args) => {
        const tok = args[0];
        if (!tok) return term.println("Usage: jwt <token>", "term-bad");
        const parts = tok.split(".");
        if (parts.length < 2) return term.println("Invalid JWT.", "term-bad");
        try {
          const h = new TextDecoder().decode(unb64ToBytes(b64urlToB64(parts[0])));
          const p = new TextDecoder().decode(unb64ToBytes(b64urlToB64(parts[1])));
          const hj = safeJsonParse(h);
          const pj = safeJsonParse(p);
          term.println("Header:", "term-muted");
          term.println(hj ? JSON.stringify(hj, null, 2) : h, "term-muted");
          term.println("Payload:", "term-muted");
          term.println(pj ? JSON.stringify(pj, null, 2) : p, "term-muted");
        } catch {
          term.println("JWT decode failed.", "term-bad");
        }
      },
    });

    register("passgen", {
      desc: "Password generator (crypto)",
      usage: "passgen [len] [--symbols] [--no-ambiguous]",
      run: async (args) => {
        const len = clamp(Number(args[0] || 24) || 24, 6, 128);
        const useSymbols = args.includes("--symbols");
        const noAmb = args.includes("--no-ambiguous");

        let alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let nums = "0123456789";
        let syms = "!@#$%^&*()-_=+[]{};:,.?/";

        if (noAmb) {
          alpha = alpha.replace(/[O0Il]/g, "");
          nums = nums.replace(/[0]/g, "");
          syms = syms.replace(/[`'"\\]/g, "");
        }

        const pool = alpha + nums + (useSymbols ? syms : "");
        const rnd = new Uint32Array(len);
        crypto.getRandomValues(rnd);

        let out = "";
        for (let i = 0; i < len; i++) out += pool[rnd[i] % pool.length];
        term.println(out, "term-good");
      },
    });

    register("kset", {
      desc: "Key-value set (localStorage)",
      usage: "kset <key> <value>",
      run: async (args) => {
        const k = args[0];
        const v = args.slice(1).join(" ");
        if (!k || v === "") return term.println("Usage: kset <key> <value>", "term-bad");
        try {
          localStorage.setItem(k, v);
          term.println("OK", "term-good");
        } catch {
          term.println("localStorage blocked/full.", "term-bad");
        }
      },
    });

    register("kget", {
      desc: "Key-value get (localStorage)",
      usage: "kget <key>",
      run: async (args) => {
        const k = args[0];
        if (!k) return term.println("Usage: kget <key>", "term-bad");
        try {
          const v = localStorage.getItem(k);
          term.println(v ?? "", "term-muted");
        } catch {
          term.println("localStorage blocked.", "term-bad");
        }
      },
    });

    register("kdel", {
      desc: "Key-value delete (localStorage)",
      usage: "kdel <key>",
      run: async (args) => {
        const k = args[0];
        if (!k) return term.println("Usage: kdel <key>", "term-bad");
        try {
          localStorage.removeItem(k);
          term.println("OK", "term-good");
        } catch {
          term.println("localStorage blocked.", "term-bad");
        }
      },
    });

    register("kls", {
      desc: "List keys (localStorage)",
      usage: "kls [prefix]",
      run: async (args) => {
        const prefix = args[0] || "";
        const keys = kvList(prefix);
        if (!keys.length) return term.println("No keys.", "term-muted");
        for (const k of keys) term.println(k, "term-muted");
      },
    });

    setTheme(getTheme());

    term.println("Type 'help' to see commands.", "term-muted");

    term.onCommand = async (raw, ctx) => {
      const tokens = tokenize(raw);
      const head = tokens[0]?.toLowerCase();
      const args = tokens.slice(1);
      const cmd = commands.get(head);
      if (!cmd) return term.println("Command not found. Type 'help'.", "term-bad");
      await cmd.run(args, ctx);
    };
  }

  function init() {
    initTerminal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();