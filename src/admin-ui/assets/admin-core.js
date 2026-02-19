(function () {
  var state = {
    adminId: "",
    adminKey: ""
  };

  function el(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toPretty(value) {
    try {
      return JSON.stringify(value || {}, null, 2);
    } catch (_error) {
      return String(value || "");
    }
  }

  function getDefaultAdminId() {
    var fromBody = document.body.getAttribute("data-default-admin-id");
    return String(fromBody || "").trim();
  }

  function setStatus(message, type) {
    var box = el("globalStatusBox");
    if (!box) return;
    var statusType = String(type || "info").toLowerCase();
    if (!["info", "ok", "warn", "bad"].includes(statusType)) statusType = "info";
    box.className = "status-box " + statusType;
    box.textContent = message;
  }

  function getStateFromStorage() {
    var storedId = localStorage.getItem("adminId") || "";
    var storedKey = localStorage.getItem("adminKey") || "";
    state.adminId = storedId || getDefaultAdminId();
    state.adminKey = storedKey;
  }

  function syncInputs() {
    var idInput = el("globalAdminIdInput");
    var keyInput = el("globalAdminKeyInput");
    if (idInput) idInput.value = state.adminId || "";
    if (keyInput) keyInput.value = state.adminKey || "";
  }

  function saveState() {
    localStorage.setItem("adminId", state.adminId || "");
    localStorage.setItem("adminKey", state.adminKey || "");
  }

  function statusPill(status) {
    var normalized = String(status || "").toLowerCase();
    var klass = "pill";
    if (
      ["approved", "open", "accepted", "resolved", "published", "completed", "ok", "true"].includes(normalized)
    ) {
      klass += " ok";
    } else if (
      ["pending", "submitted", "viewed", "interview", "draft", "todo", "in_progress", "doing"].includes(normalized)
    ) {
      klass += " warn";
    } else if (
      ["rejected", "closed", "unpublished", "cancelled", "error", "false", "rejected"].includes(normalized)
    ) {
      klass += " bad";
    }
    return '<span class="' + klass + '">' + esc(status || "-") + "</span>";
  }

  async function api(path, options) {
    var request = options || {};
    var headers = request.headers ? { ...request.headers } : {};
    headers["x-admin-key"] = state.adminKey || "";
    headers["x-admin-id"] = state.adminId || "";

    var body = request.body;
    if (body !== undefined && body !== null && typeof body === "object" && !(body instanceof FormData)) {
      headers["content-type"] = headers["content-type"] || "application/json";
      body = JSON.stringify(body);
    }

    var response = await fetch(path, {
      method: request.method || "GET",
      headers: headers,
      body: body
    });

    var data;
    try {
      data = await response.json();
    } catch (_error) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || "Request failed: " + response.status);
    }

    return data;
  }

  async function verifyConnection(options) {
    var opts = options || {};
    if (!state.adminKey) {
      if (!opts.silent) setStatus("Enter ADMIN_API_KEY to continue.", "warn");
      return false;
    }

    try {
      await api("/api/admin/dashboard/overview");
      if (!opts.silent) setStatus("Connected. Admin APIs are available.", "ok");
      window.dispatchEvent(new CustomEvent("admin:auth-ready"));
      return true;
    } catch (error) {
      setStatus(error.message || "Admin authentication failed.", "bad");
      return false;
    }
  }

  async function connectFromInputs() {
    state.adminId = String((el("globalAdminIdInput") || {}).value || "").trim();
    state.adminKey = String((el("globalAdminKeyInput") || {}).value || "").trim();
    saveState();
    syncInputs();
    await verifyConnection({ silent: false });
  }

  function clearAuth() {
    state.adminId = getDefaultAdminId();
    state.adminKey = "";
    saveState();
    syncInputs();
    setStatus("Credentials cleared.", "info");
  }

  function bindAuthUi() {
    var connectBtn = el("globalConnectBtn");
    var clearBtn = el("globalClearBtn");
    var idInput = el("globalAdminIdInput");
    var keyInput = el("globalAdminKeyInput");

    if (connectBtn) {
      connectBtn.addEventListener("click", function () {
        connectFromInputs().catch(function (error) {
          setStatus(error.message || "Connection failed.", "bad");
        });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", clearAuth);
    }

    function onEnter(event) {
      if (event.key === "Enter") {
        connectFromInputs().catch(function (error) {
          setStatus(error.message || "Connection failed.", "bad");
        });
      }
    }

    if (idInput) idInput.addEventListener("keydown", onEnter);
    if (keyInput) keyInput.addEventListener("keydown", onEnter);
  }

  function boot() {
    getStateFromStorage();
    syncInputs();
    bindAuthUi();

    if (state.adminKey) {
      verifyConnection({ silent: true }).then(function (ok) {
        if (ok) {
          setStatus("Connected. Data is up to date.", "ok");
        }
      });
    } else {
      setStatus("Enter admin credentials to load data.", "info");
    }
  }

  window.AdminCore = {
    state: state,
    esc: esc,
    toPretty: toPretty,
    setStatus: setStatus,
    statusPill: statusPill,
    api: api,
    verifyConnection: verifyConnection
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
