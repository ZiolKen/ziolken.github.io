window.scrollTo(0, 0);

let socket = null;
let heartbeat = null;
let connectionFailures = 0;
let reconnectTimer = null;
let offlineTimeout = null;

const CONFIG = {
  discordId: "951037699320602674",
};

const PLACEHOLDER_IMG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiB2aWV3Qm94PSIwIDAgMjU2IDI1NiIgZmlsbD0ibm9uZSI+CiAgPHBhdGggZD0iTTIyNCAyMDIuNjY3VjUzLjMzMzNDMjI0IDQxLjIxMDcgMjE0LjEyMyAzMiAyMDIgMzJINTRDNDEuODc3MyAzMiAzMiA0MS4yMTA3IDMyIDUzLjMzMzNWMjAyLjY2N0MzMiAyMTQuNzg5IDQxLjg3NzMgMjI0IDU0IDIyNEgyMDJDMjE0LjEyMyAyMjQgMjI0IDIxNC43ODkgMjI0IDIwMi42NjdaIgogICAgICAgIHN0cm9rZT0iIzhiOTQ5ZSIgc3Ryb2tlLXdpZHRoPSIyMS4zMzMzIiBzdHJva2Utd2lkdGg9IjIxLjMzMzMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=";

function escapeHTML(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>'"]/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return ch;
    }
  });
}

function cleanupSocket() {
  if (socket) {
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    } catch {}
    socket = null;
  }
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function updateStatusDisconnected() {
  const banner = document.getElementById("profile-banner");

  const loader = document.getElementById("profile-loader");
  if (loader) {
    loader.classList.remove("hidden");
    loader.classList.add("error");
    const span = loader.querySelector("span");
    if (span) span.textContent = "You are offline";
  }
}

function triggerUpdateAnimation(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.classList.remove("updated");
    void el.offsetWidth;
    el.classList.add("updated");
    el.addEventListener("animationend", () => el.classList.remove("updated"), { once: true });
  });
}

function applyDisplayNameScroll() {
  const wrap = document.getElementById("display-name");
  const inner = wrap?.querySelector(".display-name-inner");
  if (!wrap || !inner) return;

  wrap.classList.remove("scrolling");
  inner.style.removeProperty("--scroll-distance");
  inner.style.transform = "translateX(0)";

  requestAnimationFrame(() => {
    const w = wrap.clientWidth;
    const sw = inner.scrollWidth;
    if (sw > w) {
      inner.style.setProperty("--scroll-distance", `${w - sw}px`);
      wrap.classList.add("scrolling");
    }
  });
}

function updateStatus(p) {
  if (!p) {
    updateStatusDisconnected();
    return;
  }

  const banner = document.getElementById("profile-banner");

  const avatar = document.getElementById("avatar");
  const deco = document.getElementById("avatar-decoration");
  const displayName = document.getElementById("display-name");
  const atUsername = document.getElementById("at-username");
  const statusIcon = document.getElementById("status-icon");
  const devices = document.getElementById("devices");
  const customStatus = document.getElementById("custom-status");

  const guildBadge = document.getElementById("guild-badge");
  const guildIcon = document.getElementById("guild-badge-icon");
  const guildTag = document.getElementById("guild-badge-tag");

  if (p.discord_user) {
    const u = p.discord_user;
    const name = u.global_name || u.username;

    const inner = displayName?.querySelector(".display-name-inner");
    if (inner && inner.textContent.trim() !== name) {
      inner.textContent = name;
      applyDisplayNameScroll();
      triggerUpdateAnimation(displayName);
    }

    const handle = `@${u.username}`;
    if (atUsername && atUsername.textContent !== handle) {
      atUsername.textContent = handle;
      triggerUpdateAnimation(atUsername);
    }

    const avatarUrl = u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : PLACEHOLDER_IMG;

    if (avatar && avatar.src !== avatarUrl) {
      avatar.src = avatarUrl;
      triggerUpdateAnimation(avatar);
    }

    const decoUrl = u.avatar_decoration_data
      ? `https://cdn.discordapp.com/avatar-decoration-presets/${u.avatar_decoration_data.asset}.png?size=96`
      : "";

    if (deco) {
      deco.src = decoUrl;
      deco.style.display = decoUrl ? "block" : "none";
    }

    const discordLink = document.getElementById("discord-link");
    if (discordLink && !discordLink.href.includes("discord.com")) {
      discordLink.href = `https://discord.com/users/${u.id}`;
    }

    if (u.primary_guild && u.primary_guild.identity_enabled) {
      const g = u.primary_guild;
      const badgeUrl = `https://cdn.discordapp.com/clan-badges/${g.identity_guild_id}/${g.badge}.png?size=32`;
      if (guildIcon && guildIcon.src !== badgeUrl) guildIcon.src = badgeUrl;
      if (guildTag && guildTag.textContent !== g.tag) guildTag.textContent = g.tag;
      if (guildBadge) guildBadge.style.display = "inline-flex";
    } else {
      if (guildBadge) guildBadge.style.display = "none";
    }
  }

  const map = {
    online: "res/online.png",
    idle: "res/idle.png",
    dnd: "res/dnd.png",
    offline: "res/offline.png",
  };

  const icon = map[p.discord_status] || map.offline;
  if (statusIcon && !statusIcon.src.endsWith(icon)) {
    statusIcon.src = icon;
    triggerUpdateAnimation(statusIcon);
  }

  if (devices) {
    const active =
      (p.active_on_discord_web ? "w" : "") +
      (p.active_on_discord_desktop ? "d" : "") +
      (p.active_on_discord_mobile ? "m" : "");

    if (devices.dataset.active !== active) {
      devices.dataset.active = active;
      devices.innerHTML = "";

      if (p.active_on_discord_web) {
        devices.innerHTML +=
          '<svg class="device-icon" aria-label="Web" height="20" width="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39Z"></path></svg>';
      }

      if (p.active_on_discord_desktop) {
        devices.innerHTML +=
          '<svg class="device-icon" aria-label="Desktop" height="20" width="20" viewBox="0 0 24 24"><path d="M4 2.5c-1.103 0-2 .897-2 2v11c0 1.104.897 2 2 2h7v2H7v2h10v-2h-4v-2h7c1.103 0 2-.896 2-2v-11c0-1.103-.897-2-2-2H4Zm16 2v9H4v-9h16Z"></path></svg>';
      }

      if (p.active_on_discord_mobile) {
        devices.innerHTML +=
          '<svg class="device-icon" aria-label="Mobile" height="20" width="20" viewBox="0 0 1000 1500"><path d="M 187 0 L 813 0 C 916.277 0 1000 83.723 1000 187 L 1000 1313 C 1000 1416.277 916.277 1500 813 1500 L 187 1500 C 83.723 1500 0 1416.277 0 1313 L 0 187 C 0 83.723 83.723 0 187 0 Z M 125 1000 L 875 1000 L 875 250 L 125 250 Z M 500 1125 C 430.964 1125 375 1180.964 375 1250 C 375 1319.036 430.964 1375 500 1375 C 569.036 1375 625 1319.036 625 1250 C 625 1180.964 569.036 1125 500 1125 Z"></path></svg>';
      }
    }
  }

  if (customStatus && Array.isArray(p.activities)) {
    const act = p.activities.find((a) => a.type === 4);
    let html = "";
    let hasEmoji = false;
    let hasText = false;

    if (act) {
      if (act.emoji) {
        if (act.emoji.id) {
          const url = `https://cdn.discordapp.com/emojis/${act.emoji.id}.${act.emoji.animated ? "gif" : "png"}?size=96`;
          html += `<img src="${url}" class="custom-status-emoji" draggable="false">`;
          hasEmoji = true;
        } else if (act.emoji.name) {
          html += `<span>${escapeHTML(act.emoji.name)}</span>`;
          hasEmoji = true;
        }
      }

      if (act.state) {
        html += `<span>${escapeHTML(act.state)}</span>`;
        hasText = true;
      }
    }

    if (customStatus.innerHTML !== html) {
      customStatus.innerHTML = html;
      customStatus.style.display = hasEmoji || hasText ? "block" : "none";
      if (hasEmoji && !hasText) customStatus.classList.add("only-emoji");
      else customStatus.classList.remove("only-emoji");
      if (hasEmoji || hasText) triggerUpdateAnimation(customStatus);
    }
  }
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  cleanupSocket();
  socket = new WebSocket("wss://api.lanyard.rest/socket");

  socket.onopen = () => {
    connectionFailures = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onmessage = (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.op === 1) {
      const interval = msg.d?.heartbeat_interval || 30000;
      socket.send(JSON.stringify({ op: 2, d: { subscribe_to_ids: [CONFIG.discordId] } }));
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ op: 3 }));
          } catch {}
        }
      }, interval);
      return;
    }

    if (msg.op === 0 && (msg.t === "INIT_STATE" || msg.t === "PRESENCE_UPDATE")) {
      if (offlineTimeout) {
        clearTimeout(offlineTimeout);
        offlineTimeout = null;
      }
      const loader = document.getElementById("profile-loader");
      if (loader) loader.classList.add("hidden");
      const payload = msg.t === "INIT_STATE" ? msg.d?.[CONFIG.discordId] : msg.d;
      updateStatus(payload);
    }
  };

  socket.onerror = () => {
    try {
      socket?.close();
    } catch {}
  };

  socket.onclose = () => {
    cleanupSocket();
    connectionFailures++;

    if (!offlineTimeout) {
      offlineTimeout = setTimeout(() => {
        updateStatusDisconnected();
        offlineTimeout = null;
      }, 3000);
    }

    const base = 30000;
    let wait = Math.min(base, 1000 * Math.pow(2, connectionFailures - 1));
    if (connectionFailures < 2) wait = 500;

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, wait);
  };
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "numeric",
  hour12: false,
});

function updateLocalTime() {
  const now = new Date();

  const timeText = document.getElementById("time-text");
  if (timeText) timeText.textContent = timeFormatter.format(now);

  const diff = document.getElementById("time-diff-display");
  if (diff) {
    const localHour = now.getHours();
    const vnHour = parseInt(hourFormatter.format(now), 10);
    let r = vnHour - localHour;
    if (r > 12) r -= 24;
    if (r < -12) r += 24;

    if (r === 0) diff.textContent = "Same time as you";
    else if (r > 0) diff.textContent = `${r}h ahead of you`;
    else diff.textContent = `${Math.abs(r)}h behind you`;
  }
}

function animateCypherText(len, intervalMs) {
  const el = document.getElementById("cypher-text");
  if (!el) return;

  const chars = "¡™£¢∞§¶•ªº–≠œ∑´®†¥¨ˆøπ“‘«åß∂ƒ©˙∆˚¬…æ≈ç√∫˜µ≤≥÷/?`~";
  let last = 0;

  function tick(ts) {
    requestAnimationFrame(tick);
    const delta = ts - last;
    if (delta > intervalMs) {
      last = ts - (delta % intervalMs);
      let out = "";
      for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
      el.textContent = out;
    }
  }

  requestAnimationFrame(tick);
}

function initTooltips() {
  let container = document.getElementById("global-tooltip-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "global-tooltip-container";
    document.body.appendChild(container);
  }

  let observer = null;

  document.body.addEventListener("mouseover", (ev) => {
    const trigger = ev.target.closest(".tooltip-trigger");
    if (!trigger) return;
    const box = trigger.querySelector(".tooltip-box");
    if (!box) return;

    container.innerHTML = box.innerHTML;

    if (observer) observer.disconnect();
    observer = new MutationObserver(() => (container.innerHTML = box.innerHTML));
    observer.observe(box, { childList: true, characterData: true, subtree: true });

    const r = trigger.getBoundingClientRect();
    const b = container.getBoundingClientRect();

    let left = r.left + r.width / 2 - b.width / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - b.width - 10));

    let top = r.top - b.height;
    if (top < 10) {
      top = r.bottom + 8;
      container.classList.add("flipped");
    } else {
      container.classList.remove("flipped");
    }

    const arrowX = r.left + r.width / 2 - left;
    container.style.setProperty("--arrow-x", `${arrowX}px`);
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    container.classList.add("visible");
  });

  document.body.addEventListener("mouseout", (ev) => {
    const trigger = ev.target.closest(".tooltip-trigger");
    if (!trigger) return;
    container.classList.remove("visible");
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  window.addEventListener(
    "scroll",
    () => container.classList.contains("visible") && container.classList.remove("visible"),
    { capture: true, passive: true }
  );
}

connect();
updateLocalTime();
setInterval(updateLocalTime, 1000);
animateCypherText(7, 25);
initTooltips();

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    applyDisplayNameScroll();
  }, 100);
});