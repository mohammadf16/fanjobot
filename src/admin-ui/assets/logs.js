(function () {
  var autoTimer = null;
  var autoEnabled = false;
  var logsCache = [];

  function el(id) {
    return document.getElementById(id);
  }

  function buildQuery() {
    var query = new URLSearchParams();
    var level = String((el("logsLevelInput") || {}).value || "").trim();
    var search = String((el("logsSearchInput") || {}).value || "").trim();
    var limit = String((el("logsLimitInput") || {}).value || "300").trim();
    if (level) query.set("level", level);
    if (search) query.set("search", search);
    query.set("limit", limit || "300");
    return query.toString();
  }

  function renderSummary(items) {
    var counts = { info: 0, warn: 0, error: 0, other: 0 };
    (items || []).forEach(function (item) {
      var level = String(item.level || "").toLowerCase();
      if (level === "info") counts.info += 1;
      else if (level === "warn") counts.warn += 1;
      else if (level === "error") counts.error += 1;
      else counts.other += 1;
    });

    el("logsSummaryChips").innerHTML = [
      '<span class="chip">Visible logs: ' + Number((items || []).length).toLocaleString("en-US") + "</span>",
      '<span class="chip">Info: ' + Number(counts.info).toLocaleString("en-US") + "</span>",
      '<span class="chip warn">Warn: ' + Number(counts.warn).toLocaleString("en-US") + "</span>",
      '<span class="chip bad">Error: ' + Number(counts.error).toLocaleString("en-US") + "</span>"
    ].join("");
  }

  function renderLogs(items, total) {
    logsCache = (items || []).slice();
    renderSummary(logsCache);
    el("logsMetaBox").textContent =
      "Matched: " + Number(total || 0).toLocaleString("en-US") + " | Showing: " + Number(logsCache.length);

    el("logsListBox").innerHTML =
      logsCache
        .map(function (item) {
          var level = String(item.level || "").toLowerCase();
          var klass = "list-item";
          if (level === "warn") klass += " warn";
          if (level === "error") klass += " error";
          var meta = item.meta ? AdminCore.toPretty(item.meta) : "";
          return (
            '<article class="' +
            klass +
            '"><div class="title">' +
            AdminCore.esc(item.level || "-") +
            " | " +
            AdminCore.esc(item.createdAt || "") +
            "</div><div class='meta'>" +
            AdminCore.esc(item.message || "-") +
            "</div>" +
            (meta ? "<pre class='codebox compact'>" + AdminCore.esc(meta) + "</pre>" : "") +
            "</article>"
          );
        })
        .join("") || "<div class='meta-text'>No logs found.</div>";
  }

  async function loadLogs() {
    var data = await AdminCore.api("/api/admin/logs?" + buildQuery());
    renderLogs(data.items || [], data.total || 0);
  }

  function setAutoState(enabled) {
    autoEnabled = enabled;
    var btn = el("logsAutoBtn");
    if (btn) btn.textContent = "Auto: " + (enabled ? "ON" : "OFF");

    if (!enabled) {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
      return;
    }

    var interval = Number((el("logsAutoIntervalInput") || {}).value || 0);
    if (!Number.isFinite(interval) || interval <= 0) {
      interval = 5000;
    }

    loadLogs().catch(function () {});
    autoTimer = setInterval(function () {
      loadLogs().catch(function () {});
    }, interval);
  }

  function exportLogs() {
    AdminCore.downloadJson("logs-export.json", logsCache);
  }

  function bindActions() {
    el("logsLoadBtn").addEventListener("click", function () {
      loadLogs()
        .then(function () {
          AdminCore.setStatus("Logs loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load logs.", "bad");
        });
    });

    el("logsAutoBtn").addEventListener("click", function () {
      setAutoState(!autoEnabled);
    });

    el("logsAutoIntervalInput").addEventListener("change", function () {
      if (autoEnabled) {
        setAutoState(false);
        setAutoState(true);
      }
    });

    el("logsExportBtn").addEventListener("click", function () {
      exportLogs();
      AdminCore.toast("Logs JSON exported.", "ok");
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadLogs().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load logs.", "bad");
    });
  });
})();
