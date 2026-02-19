(function () {
  var autoTimer = null;
  var autoEnabled = false;

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

  function renderLogs(items, total) {
    el("logsMetaBox").textContent =
      "Matched: " + Number(total || 0).toLocaleString("en-US") + " | Showing: " + Number((items || []).length);

    el("logsListBox").innerHTML =
      (items || [])
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

    loadLogs().catch(function () {});
    autoTimer = setInterval(function () {
      loadLogs().catch(function () {});
    }, 4000);
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
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadLogs().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load logs.", "bad");
    });
  });
})();
