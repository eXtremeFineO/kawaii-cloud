(() => {
  const cfg = window.KAWAII_CONFIG || {};
  const API = (cfg.API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
  const CLOUD = (cfg.CLOUD_URL || "").replace(/\/$/, "");
  const KEY = "kawaii.web.session";

  const $ = (id) => document.getElementById(id);
  const gate = $("gate");
  const home = $("home");
  const registerSection = $("registerSection");

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

  function showHome(session) {
    gate.classList.add("hidden");
    registerSection.classList.add("hidden");
    home.classList.remove("hidden");
    $("displayName").textContent = session.displayName || session.login;
    $("metaLine").textContent = `ID ${session.uid || "—"} · ${session.role || "Player"}`;
    const img = $("avatar");
    if (session.avatarUrl) {
      img.src = session.avatarUrl;
      img.style.display = "block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
    refreshCloud();
  }

  function showGate() {
    home.classList.add("hidden");
    gate.classList.remove("hidden");
    registerSection.classList.remove("hidden");
  }

  async function refreshCloud() {
    try {
      if (CLOUD) {
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
      }
    } catch {
      /* cloud optional while offline */
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = $("loginUser").value.trim();
    const password = $("loginPass").value;
    status($("loginStatus"), "Вход…");
    try {
      const data = await post("/auth/login", { login, password, hwid: "" });
      const session = {
        login,
        token: data.token,
        displayName: data.displayName || login,
        avatarUrl: data.avatarUrl || "",
        role: data.role || "Player",
        uid: data.uid || 0,
      };
      saveSession(session);
      status($("loginStatus"), "Ок", true);
      showHome(session);
    } catch (err) {
      status($("loginStatus"), err.message || "Ошибка входа", false);
    }
  });

  $("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = $("regUser").value.trim();
    const password = $("regPass").value;
    status($("regStatus"), "Регистрация…");
    try {
      const data = await post("/auth/register", { login, password, hwid: "" });
      const session = {
        login,
        token: data.token,
        displayName: data.displayName || login,
        avatarUrl: data.avatarUrl || "",
        role: data.role || "Player",
        uid: data.uid || 0,
      };
      saveSession(session);
      status($("regStatus"), "Аккаунт создан", true);
      showHome(session);
    } catch (err) {
      status($("regStatus"), err.message || "Ошибка регистрации", false);
    }
  });

  $("logoutBtn").addEventListener("click", () => {
    clearSession();
    showGate();
  });

  const existing = loadSession();
  if (existing && existing.token) {
    showHome(existing);
    // soft refresh from cloud profiles
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
