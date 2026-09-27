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
    if (!deviceCode) return;
    try {
      await post("/auth/device/complete", {
        device_code: deviceCode,
        login: session.login,
        token: session.token,
      });
      status($("loginStatus"), "Готово — вернись в Minecraft", true);
    } catch (err) {
      status($("loginStatus"), err.message || "device complete failed", false);
    }
  }

  function showHome(session) {
    gate.classList.add("hidden");
    home.classList.remove("hidden");
    $("displayName").textContent = session.displayName || session.login;
    $("metaLine").textContent = `ID ${session.uid || "—"} · ${session.role || "Player"}`;
    $("profDisplay").value = session.displayName || session.login || "";
    $("profAvatar").value = session.avatarUrl || "";
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
  }

  function showGate() {
    home.classList.add("hidden");
    gate.classList.remove("hidden");
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
      };
      saveSession(session);
      await completeDevice(session);
      status($("loginStatus"), reg ? "Аккаунт создан" : "Ок", true);
      showHome(session);
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
      const data = await post("/auth/profile", {
        login: session.login,
        token: session.token,
        displayName: $("profDisplay").value.trim(),
        avatarUrl: $("profAvatar").value.trim(),
      });
      session.displayName = data.displayName || session.displayName;
      session.avatarUrl = data.avatarUrl || "";
      session.role = data.role || session.role;
      session.uid = data.uid || session.uid;
      saveSession(session);
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

  $("logoutBtn").addEventListener("click", () => {
    clearSession();
    showGate();
  });

  applyMode();

  const existing = loadSession();
  if (existing && existing.token) {
    showHome(existing);
    if (deviceCode) completeDevice(existing);
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
          showHome(existing);
        })
        .catch(() => {});
    }
  }
})();
