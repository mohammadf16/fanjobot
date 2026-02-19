(function () {
  var state = {
    adminId: "",
    adminKey: "",
    connected: false,
    lastVerifiedAt: null
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

  function toIsoNow() {
    return new Date().toISOString();
  }

  function getDefaultAdminId() {
    var fromBody = document.body.getAttribute("data-default-admin-id");
    return String(fromBody || "").trim();
  }

  function setConnectionChip(isConnected) {
    var chip = el("globalConnChip");
    if (!chip) return;
    chip.className = isConnected ? "chip ok" : "chip bad";
    chip.textContent = isConnected ? "Connected" : "Offline";
  }

  function setSyncChip(isoDate) {
    var chip = el("globalSyncChip");
    if (!chip) return;
    if (!isoDate) {
      chip.className = "chip";
      chip.textContent = "Last sync: -";
      return;
    }
    var date = new Date(isoDate);
    var text = Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString();
    chip.className = "chip";
    chip.textContent = "Last sync: " + text;
  }

  function setStatus(message, type) {
    var box = el("globalStatusBox");
    if (!box) return;
    var statusType = String(type || "info").toLowerCase();
    if (!["info", "ok", "warn", "bad"].includes(statusType)) statusType = "info";
    box.className = "status-box " + statusType;
    box.textContent = message;
  }

  function toast(message, type, timeoutMs) {
    var host = el("globalToastHost");
    if (!host) return;
    var item = document.createElement("div");
    var toastType = String(type || "info").toLowerCase();
    item.className = "toast " + (["ok", "warn", "bad", "info"].includes(toastType) ? toastType : "info");
    item.textContent = String(message || "");
    host.appendChild(item);

    window.setTimeout(function () {
      item.classList.add("fade");
      window.setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 220);
    }, Number(timeoutMs || 2600));
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
    var navSelect = el("globalNavSelect");
    if (idInput) idInput.value = state.adminId || "";
    if (keyInput) keyInput.value = state.adminKey || "";
    if (navSelect && !navSelect.value) navSelect.selectedIndex = 0;
  }

  function saveState() {
    localStorage.setItem("adminId", state.adminId || "");
    localStorage.setItem("adminKey", state.adminKey || "");
  }

  function statusPill(status) {
    var normalized = String(status || "").toLowerCase();
    var klass = "pill";
    if (["approved", "open", "accepted", "resolved", "published", "completed", "ok", "true"].includes(normalized)) {
      klass += " ok";
    } else if (["pending", "submitted", "viewed", "interview", "draft", "todo", "in_progress", "doing"].includes(normalized)) {
      klass += " warn";
    } else if (["rejected", "closed", "unpublished", "cancelled", "error", "false"].includes(normalized)) {
      klass += " bad";
    }
    return '<span class="' + klass + '">' + esc(status || "-") + "</span>";
  }

  function debounce(fn, waitMs) {
    var timer = null;
    return function () {
      var args = arguments;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        timer = null;
        fn.apply(null, args);
      }, Number(waitMs || 250));
    };
  }

  function copyText(text) {
    var value = String(text || "");
    if (!value) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () {
        return true;
      });
    }
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "absolute";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        var copied = document.execCommand("copy");
        document.body.removeChild(area);
        if (copied) resolve(true);
        else reject(new Error("Clipboard copy failed"));
      } catch (error) {
        reject(error);
      }
    });
  }

  function toCsvValue(value) {
    if (value == null) return "";
    var raw = typeof value === "object" ? JSON.stringify(value) : String(value);
    return '"' + raw.replace(/"/g, '""') + '"';
  }

  function downloadBlob(filename, mimeType, text) {
    var blob = new Blob([text], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function downloadJson(filename, value) {
    var file = String(filename || "export.json");
    downloadBlob(file, "application/json;charset=utf-8", toPretty(value));
  }

  function downloadCsv(filename, columns, rows) {
    var header = (columns || []).map(function (col) {
      return toCsvValue(col.label || col.key || "");
    });
    var lines = [header.join(",")];
    (rows || []).forEach(function (row) {
      var line = (columns || []).map(function (col) {
        return toCsvValue(row[col.key]);
      });
      lines.push(line.join(","));
    });
    downloadBlob(String(filename || "export.csv"), "text/csv;charset=utf-8", lines.join("\n"));
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

    state.lastVerifiedAt = toIsoNow();
    setSyncChip(state.lastVerifiedAt);
    return data;
  }

  async function verifyConnection(options) {
    var opts = options || {};
    if (!state.adminKey) {
      state.connected = false;
      setConnectionChip(false);
      if (!opts.silent) setStatus("Enter ADMIN_API_KEY to continue.", "warn");
      return false;
    }

    try {
      await api("/api/admin/dashboard/overview");
      state.connected = true;
      setConnectionChip(true);
      if (!opts.silent) setStatus("Connected. Admin APIs are available.", "ok");
      window.dispatchEvent(new CustomEvent("admin:auth-ready"));
      window.dispatchEvent(new CustomEvent("admin:auth-state-changed", { detail: { connected: true } }));
      return true;
    } catch (error) {
      state.connected = false;
      setConnectionChip(false);
      setStatus(error.message || "Admin authentication failed.", "bad");
      window.dispatchEvent(new CustomEvent("admin:auth-state-changed", { detail: { connected: false } }));
      return false;
    }
  }

  async function connectFromInputs() {
    state.adminId = String((el("globalAdminIdInput") || {}).value || "").trim();
    state.adminKey = String((el("globalAdminKeyInput") || {}).value || "").trim();
    saveState();
    syncInputs();
    var ok = await verifyConnection({ silent: false });
    toast(ok ? "Connected successfully." : "Connection failed.", ok ? "ok" : "bad");
  }

  function clearAuth() {
    state.adminId = getDefaultAdminId();
    state.adminKey = "";
    state.connected = false;
    state.lastVerifiedAt = null;
    saveState();
    syncInputs();
    setConnectionChip(false);
    setSyncChip(null);
    setStatus("Credentials cleared.", "info");
    toast("Credentials cleared.", "info");
  }

  function bindQuickActions() {
    var goBtn = el("globalGoBtn");
    var navSelect = el("globalNavSelect");
    var reloadBtn = el("globalRefreshPageBtn");
    var reconnectBtn = el("globalReconnectBtn");
    var copyHeadersBtn = el("globalCopyHeadersBtn");

    if (goBtn && navSelect) {
      goBtn.addEventListener("click", function () {
        var target = String(navSelect.value || "").trim();
        if (!target) return;
        window.location.assign(target);
      });
    }

    if (navSelect) {
      navSelect.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          var target = String(navSelect.value || "").trim();
          if (target) window.location.assign(target);
        }
      });
    }

    if (reloadBtn) {
      reloadBtn.addEventListener("click", function () {
        window.location.reload();
      });
    }

    if (reconnectBtn) {
      reconnectBtn.addEventListener("click", function () {
        verifyConnection({ silent: false }).then(function (ok) {
          toast(ok ? "Connection verified." : "Connection check failed.", ok ? "ok" : "bad");
        });
      });
    }

    if (copyHeadersBtn) {
      copyHeadersBtn.addEventListener("click", function () {
        var lines = [
          "x-admin-id: " + (state.adminId || ""),
          "x-admin-key: " + (state.adminKey || "")
        ];
        copyText(lines.join("\n"))
          .then(function () {
            setStatus("Header values copied to clipboard.", "ok");
            toast("Headers copied.", "ok");
          })
          .catch(function () {
            setStatus("Clipboard copy failed in this browser.", "warn");
          });
      });
    }
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
    bindQuickActions();
    setConnectionChip(false);
    setSyncChip(null);

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
    toast: toast,
    debounce: debounce,
    copyText: copyText,
    downloadJson: downloadJson,
    downloadCsv: downloadCsv,
    setSyncChip: setSyncChip,
    api: api,
    verifyConnection: verifyConnection
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
