(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function buildNotifQuery() {
    var query = new URLSearchParams({ limit: "120" });
    var status = String((el("notifStatusInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    return query.toString();
  }

  function renderNotifications(items) {
    el("notifTableBody").innerHTML =
      (items || [])
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
            "</td><td>" +
            resolveAction +
            "</td></tr>"
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

  function bindActions() {
    el("driveRunBtn").addEventListener("click", function () {
      el("driveOutputBox").textContent = "Running Drive read/write test...";
      runDriveCheck()
        .then(function () {
          AdminCore.setStatus("Drive check completed.", "ok");
        })
        .catch(function (error) {
          el("driveOutputBox").textContent = "ERROR: " + (error.message || "Drive check failed");
          AdminCore.setStatus(error.message || "Drive check failed.", "bad");
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

    el("notifTableBody").addEventListener("click", function (event) {
      var resolveBtn = event.target.closest(".notif-resolve");
      if (!resolveBtn) return;
      var id = Number(resolveBtn.dataset.id);
      if (!id) return;

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
