(() => {
  const cfg = window.KAWAII_CONFIG || {};
  const API = (cfg.API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
  const CLOUD = (cfg.CLOUD_URL || "").replace(/\/$/, "");
  const KEY = "kawaii.web.session";

  const params = new URLSearchParams(location.search);
  const deviceCode = params.get("device") || "";
  let mode = (params.get("mode") || "login").toLowerCase();
  if (mode !== "register") mode = "login";

  const $ = (id) => document.getElementById(id);
  const gate = $("gate");
  const home = $("home");

  function status(el, text, ok) {
    el.textContent = text || "";
    el.classList.toggle("error", ok === false);
    el.classList.toggle("ok", ok === true);
  }

  function saveSession(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(KEY);
  }

  async function post(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {
      /* empty */
    }
    if (!res.ok) {
      const msg = json.detail || json.message || ("HTTP " + res.status);
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return json;
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function applyMode() {
    const reg = mode === "register";
    $("gateTitle").textContent = reg ? "Регистрация" : "Вход";
    $("gateSubmit").textContent = reg ? "Создать аккаунт" : "Войти";
    $("switchText").textContent = reg ? "Уже есть аккаунт?" : "Нету аккаунта?";
    $("switchMode").textContent = reg ? "Войти" : "Создать";
    if (deviceCode) {
      $("deviceHint").hidden = false;
      $("deviceHint").textContent =
        "Клиент ждёт подтверждение. После " +
        (reg ? "регистрации" : "входа") +
        " Minecraft войдёт сам.";
    }
  }

  async function completeDevice(session) {
    if (!deviceCode) return false;
    try {
      await post("/auth/device/complete", {
        device_code: deviceCode,
        login: session.login,
        token: session.token,
      });
      return true;
    } catch (err) {
      const banner = $("deviceBanner");
      if (banner) {
        banner.hidden = false;
        banner.textContent = err.message || "device complete failed";
        banner.classList.remove("ok");
        banner.classList.add("error");
      }
      return false;
    }
  }

  function setHwidUi(hwid) {
    const el = $("hwidValue");
    if (!el) return;
    const v = (hwid || "").trim();
    if (v) {
      el.textContent = v;
      el.classList.remove("empty");
    } else {
      el.textContent = "не привязан";
      el.classList.add("empty");
    }
  }

  async function refreshMe(session) {
    try {
      const data = await post("/auth/me", { login: session.login, token: session.token });
      session.displayName = data.displayName || session.displayName;
      session.avatarUrl = data.avatarUrl || session.avatarUrl;
      session.role = data.role || session.role;
      session.uid = data.uid || session.uid;
      session.hwid = data.hwid || "";
      saveSession(session);
      setHwidUi(session.hwid);
      return session;
    } catch (err) {
      // token invalid → force re-login
      if (String(err.message || "").toLowerCase().includes("unauthorized") || String(err.message || "").includes("401")) {
        clearSession();
        throw err;
      }
      setHwidUi(session.hwid || "");
      return session;
    }
  }

  function showHome(session, deviceMsg) {
    gate.classList.add("hidden");
    home.classList.remove("hidden");
    home.classList.remove("enter");
    void home.offsetWidth;
    home.classList.add("enter");
    $("loginUser").value = "";
    $("loginPass").value = "";
    status($("loginStatus"), "");
    $("displayName").textContent = session.displayName || session.login;
    $("metaLine").textContent = `ID ${session.uid || "—"} · ${session.role || "Player"}`;
    $("profDisplay").value = session.displayName || session.login || "";
    setHwidUi(session.hwid || "");
    const banner = $("deviceBanner");
    if (banner) {
      if (deviceMsg) {
        banner.hidden = false;
        banner.textContent = deviceMsg;
        banner.classList.add("ok");
      } else {
        banner.hidden = true;
        banner.textContent = "";
      }
    }
    const img = $("avatar");
    if (session.avatarUrl) {
      img.src = session.avatarUrl + (session.avatarUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
      img.style.display = "block";
      img.onerror = () => {
        img.style.display = "none";
      };
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
    const isDev = String(session.role || "").toUpperCase() === "DEVELOPER";
    $("adminPanel").classList.toggle("hidden", !isDev);
    if (isDev) loadAccounts(session);
    refreshCloud();
    refreshMe(session)
      .then((s) => {
        $("displayName").textContent = s.displayName || s.login;
        $("metaLine").textContent = `ID ${s.uid || "—"} · ${s.role || "Player"}`;
        const isDev2 = String(s.role || "").toUpperCase() === "DEVELOPER";
        $("adminPanel").classList.toggle("hidden", !isDev2);
      })
      .catch(() => {
        showGate();
      });
  }

  function showGate() {
    home.classList.add("hidden");
    gate.classList.remove("hidden");
    const banner = $("deviceBanner");
    if (banner) {
      banner.hidden = true;
      banner.textContent = "";
    }
  }

  async function refreshCloud() {
    try {
      if (!CLOUD) return;
      const presence = await getJson(CLOUD + "/presence.json");
      $("onlineCount").textContent = String(presence.count || (presence.online || []).length || 0);
      const news = await getJson(CLOUD + "/news.json");
      const items = news.items || [];
      $("newsCount").textContent = String(items.length);
      const list = $("newsList");
      list.innerHTML = "";
      items.slice(0, 8).forEach((it) => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${escapeHtml(it.title || "News")}</strong><span>${escapeHtml(it.body || "")}</span>`;
        list.appendChild(li);
      });
    } catch {
      /* optional */
    }
  }

  async function loadAccounts(session) {
    try {
      const q = new URLSearchParams({ login: session.login, token: session.token });
      const data = await getJson(API + "/auth/admin/accounts?" + q.toString());
      const list = $("accountsList");
      list.innerHTML = "";
      (data.accounts || []).forEach((a) => {
        const li = document.createElement("li");
        li.textContent = `${a.login} · ${a.role} · ID ${a.uid || "—"}`;
        list.appendChild(li);
      });
    } catch (err) {
      status($("adminStatus"), err.message || "accounts error", false);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  $("switchMode").addEventListener("click", () => {
    mode = mode === "register" ? "login" : "register";
    applyMode();
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = $("loginUser").value.trim();
    const password = $("loginPass").value;
    const reg = mode === "register";
    status($("loginStatus"), reg ? "Регистрация…" : "Вход…");
    try {
      const path = reg ? "/auth/register" : "/auth/login";
      const data = await post(path, { login, password, hwid: "" });
      const session = {
        login,
        token: data.token,
        displayName: data.displayName || login,
        avatarUrl: data.avatarUrl || "",
        role: data.role || "Player",
        uid: data.uid || 0,
        hwid: data.hwid || "",
      };
      saveSession(session);
      let deviceMsg = "";
      if (deviceCode) {
        const ok = await completeDevice(session);
        deviceMsg = ok ? "Minecraft подключён — можно вернуться в игру" : "";
      }
      showHome(session, deviceMsg);
    } catch (err) {
      status($("loginStatus"), err.message || "Ошибка", false);
    }
  });

  $("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = loadSession();
    if (!session) return;
    status($("profStatus"), "Сохранение…");
    try {
      const displayName = $("profDisplay").value.trim();
      const fileInput = $("profAvatarFile");
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (file) {
        const fd = new FormData();
        fd.append("login", session.login);
        fd.append("token", session.token);
        fd.append("file", file);
        const res = await fetch(API + "/auth/avatar/upload", { method: "POST", body: fd });
        let json = {};
        try {
          json = await res.json();
        } catch {
          /* empty */
        }
        if (!res.ok) {
          throw new Error(json.detail || json.message || ("HTTP " + res.status));
        }
        session.avatarUrl = json.avatarUrl || session.avatarUrl;
        session.role = json.role || session.role;
      }
      const data = await post("/auth/profile", {
        login: session.login,
        token: session.token,
        displayName,
        avatarUrl: session.avatarUrl || "",
      });
      session.displayName = data.displayName || displayName || session.displayName;
      session.avatarUrl = data.avatarUrl || session.avatarUrl || "";
      session.role = data.role || session.role;
      session.uid = data.uid || session.uid;
      saveSession(session);
      if (fileInput) fileInput.value = "";
      const nameEl = $("profAvatarName");
      if (nameEl) nameEl.textContent = "Выберите файл";
      const pick = $("profAvatarPick");
      if (pick) pick.classList.remove("has-file");
      status($("profStatus"), "Сохранено — в клиенте обновится через пару секунд", true);
      showHome(session);
    } catch (err) {
      status($("profStatus"), err.message || "Ошибка", false);
    }
  });

  $("adminSetRole").addEventListener("click", async () => {
    const session = loadSession();
    if (!session) return;
    const target = $("adminLoginTarget").value.trim();
    const role = $("adminRole").value;
    if (!target) {
      status($("adminStatus"), "Укажи логин", false);
      return;
    }
    status($("adminStatus"), "…");
    try {
      await post("/auth/admin/setrole", {
        adminLogin: session.login,
        adminToken: session.token,
        login: target,
        role,
      });
      status($("adminStatus"), `Роль ${target} → ${role}`, true);
      loadAccounts(session);
    } catch (err) {
      status($("adminStatus"), err.message || "Ошибка", false);
    }
  });

  $("hwidReset").addEventListener("click", async () => {
    const session = loadSession();
    if (!session) return;
    if (!confirm("Сбросить HWID? После этого можно войти с другого ПК.")) return;
    status($("hwidStatus"), "Сброс…");
    try {
      const data = await post("/auth/hwid/reset", {
        login: session.login,
        token: session.token,
      });
      session.hwid = data.hwid || "";
      saveSession(session);
      setHwidUi(session.hwid);
      status($("hwidStatus"), "HWID сброшен", true);
    } catch (err) {
      status($("hwidStatus"), err.message || "Ошибка", false);
    }
  });

  $("logoutBtn").addEventListener("click", () => {
    clearSession();
    showGate();
  });

  const fileInput = $("profAvatarFile");
  const filePick = $("profAvatarPick");
  const fileName = $("profAvatarName");
  if (filePick && fileInput) {
    filePick.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) {
        fileName.textContent = f.name;
        filePick.classList.add("has-file");
      } else {
        fileName.textContent = "Выберите файл";
        filePick.classList.remove("has-file");
      }
    });
  }

  applyMode();

  (async () => {
    const existing = loadSession();
    if (!(existing && existing.token)) {
      showGate();
      return;
    }
    // Already logged in on site → open settings (hide login).
    // If opened from Minecraft (?device=), auto-complete without asking password again.
    try {
      await refreshMe(existing);
    } catch {
      showGate();
      return;
    }
    let deviceMsg = "";
    if (deviceCode) {
      const ok = await completeDevice(existing);
      deviceMsg = ok
        ? "Уже вошёл на сайте — Minecraft подключён автоматически"
        : "Не удалось подтвердить вход Minecraft";
      // Drop device from URL so refresh won't re-complete
      try {
        const u = new URL(location.href);
        u.searchParams.delete("device");
        history.replaceState({}, "", u.pathname + u.search + u.hash);
      } catch {
        /* ignore */
      }
    }
    showHome(existing, deviceMsg);
    if (CLOUD && existing.login) {
      getJson(CLOUD + "/profiles.json")
        .then((root) => {
          const profiles = root.profiles || root;
          const p = profiles[existing.login.toLowerCase()];
          if (!p) return;
          existing.displayName = p.displayName || existing.displayName;
          existing.avatarUrl = p.avatarUrl || existing.avatarUrl;
          existing.role = p.role || existing.role;
          existing.uid = p.uid || existing.uid;
          saveSession(existing);
          showHome(existing, deviceMsg);
        })
        .catch(() => {});
    }
  })();
})();
