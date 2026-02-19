(function () {
  var notificationsCache = [];
  var driveResultCache = null;

  function el(id) {
    return document.getElementById(id);
  }

  function buildNotifQuery() {
    var query = new URLSearchParams({ limit: "160" });
    var status = String((el("notifStatusInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    return query.toString();
  }

  function renderNotifications(items) {
    notificationsCache = (items || []).slice();
    el("notifTableBody").innerHTML =
      notificationsCache
        .map(function (item) {
          var resolveAction =
            item.status === "open"
              ? "<button class='btn notif-resolve' data-id='" + item.id + "'>Resolve</button>"
              : "<span class='meta-text'>-</span>";
          return (
            "<tr><td>" +
            item.id +
            "</td><td>" +
            AdminCore.esc(item.type || "-") +
            "</td><td>" +
            AdminCore.esc(item.title || "-") +
            "</td><td>" +
            AdminCore.statusPill(item.status || "-") +
            "</td><td>" +
            AdminCore.esc(item.created_at || "") +
            "</td><td><div class='toolbar'><button class='btn ghost notif-detail' data-id='" +
            item.id +
            "'>Detail</button>" +
            resolveAction +
            "</div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='6'>No notifications found.</td></tr>";
  }

  async function runDriveCheck() {
    var folderId = String((el("driveFolderInput") || {}).value || "").trim();
    var body = folderId ? { folderId: folderId } : {};
    var result = await AdminCore.api("/api/admin/integrations/drive/check", {
      method: "POST",
      body: body
    });
    driveResultCache = result;
    el("driveOutputBox").textContent = AdminCore.toPretty(result);
  }

  async function loadNotifications() {
    var data = await AdminCore.api("/api/admin/notifications?" + buildNotifQuery());
    renderNotifications(data.items || []);
  }

  async function resolveNotification(id) {
    await AdminCore.api("/api/admin/notifications/" + id, {
      method: "PATCH",
      body: { status: "resolved" }
    });
  }

  async function resolveAllOpenVisible() {
    var openRows = notificationsCache.filter(function (item) {
      return String(item.status || "").toLowerCase() === "open";
    });
    if (!openRows.length) {
      AdminCore.setStatus("No open notifications in current list.", "warn");
      return;
    }
    var results = await Promise.allSettled(
      openRows.map(function (item) {
        return resolveNotification(item.id);
      })
    );
    var okCount = results.filter(function (result) {
      return result.status === "fulfilled";
    }).length;
    var failCount = results.length - okCount;
    await loadNotifications();
    AdminCore.setStatus(
      "Resolve visible open notifications complete. Success: " + okCount + " | Failed: " + failCount,
      failCount ? "warn" : "ok"
    );
  }

  function exportNotifications() {
    AdminCore.downloadCsv(
      "notifications-export.csv",
      [
        { key: "id", label: "id" },
        { key: "type", label: "type" },
        { key: "title", label: "title" },
        { key: "message", label: "message" },
        { key: "status", label: "status" },
        { key: "created_at", label: "created_at" }
      ],
      notificationsCache
    );
  }

  function bindActions() {
    el("driveRunBtn").addEventListener("click", function () {
      el("driveOutputBox").textContent = "Running Drive read/write test...";
      runDriveCheck()
        .then(function () {
          AdminCore.setStatus("Drive check completed.", "ok");
          AdminCore.toast("Drive check completed.", "ok");
        })
        .catch(function (error) {
          el("driveOutputBox").textContent = "ERROR: " + (error.message || "Drive check failed");
          AdminCore.setStatus(error.message || "Drive check failed.", "bad");
        });
    });

    el("driveCopyResultBtn").addEventListener("click", function () {
      var text = AdminCore.toPretty(driveResultCache || {});
      AdminCore.copyText(text)
        .then(function () {
          AdminCore.toast("Drive check result copied.", "ok");
        })
        .catch(function () {
          AdminCore.setStatus("Clipboard copy failed.", "warn");
        });
    });

    el("notifLoadBtn").addEventListener("click", function () {
      loadNotifications()
        .then(function () {
          AdminCore.setStatus("Notifications loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load notifications.", "bad");
        });
    });

    el("notifResolveAllBtn").addEventListener("click", function () {
      resolveAllOpenVisible().catch(function (error) {
        AdminCore.setStatus(error.message || "Failed to resolve all open notifications.", "bad");
      });
    });

    el("notifExportBtn").addEventListener("click", function () {
      exportNotifications();
      AdminCore.toast("Notifications CSV exported.", "ok");
    });

    el("notifTableBody").addEventListener("click", function (event) {
      var resolveBtn = event.target.closest(".notif-resolve");
      var detailBtn = event.target.closest(".notif-detail");
      if (!resolveBtn && !detailBtn) return;

      var id = Number((resolveBtn || detailBtn).dataset.id);
      if (!id) return;

      if (detailBtn) {
        var row = notificationsCache.find(function (item) {
          return Number(item.id) === id;
        });
        el("notifDetailBox").textContent = AdminCore.toPretty(row || null);
        return;
      }

      resolveNotification(id)
        .then(function () {
          return loadNotifications();
        })
        .then(function () {
          AdminCore.setStatus("Notification resolved.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to resolve notification.", "bad");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadNotifications().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load integrations data.", "bad");
    });
  });
})();
