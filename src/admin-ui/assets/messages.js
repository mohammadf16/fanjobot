(function () {
  var audienceCache = [];
  var lastResult = null;

  function el(id) {
    return document.getElementById(id);
  }

  function renderAudience(payload) {
    var audience = payload.audience || {};
    audienceCache = (payload.recentUsers || []).slice();

    var chips = [
      "Started users: " + Number(audience.totalStartedUsers || 0).toLocaleString("en-US"),
      "Bot: " + (audience.botOnline ? "Online" : "Offline")
    ];
    el("msgAudienceChips").innerHTML = chips
      .map(function (item) {
        return "<span class='chip'>" + AdminCore.esc(item) + "</span>";
      })
      .join("");

    el("msgAudienceBody").innerHTML =
      audienceCache
        .map(function (row) {
          return (
            "<tr><td>#" +
            row.id +
            "</td><td>" +
            AdminCore.esc(row.full_name || "-") +
            "</td><td>" +
            AdminCore.esc(row.telegram_id || "-") +
            "</td><td>" +
            AdminCore.esc(row.created_at || "-") +
            "</td></tr>"
          );
        })
        .join("") || "<tr><td colspan='4'>No started users found.</td></tr>";
  }

  async function loadAudience() {
    var data = await AdminCore.api("/api/admin/broadcast/audience?limit=120");
    renderAudience(data || {});
    return data;
  }

  function getPayload() {
    var rawMessage = String((el("msgBodyInput") || {}).value || "").trim();
    var rawLimit = Number((el("msgLimitInput") || {}).value || 0);
    var dryRun = Boolean((el("msgDryRunInput") || {}).checked);

    return {
      message: rawMessage,
      limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(10000, Math.floor(rawLimit)) : null,
      dryRun: dryRun
    };
  }

  function renderResult(result, payload) {
    lastResult = result || {};
    var metaText =
      (payload.dryRun ? "Dry run complete. " : "Broadcast complete. ") +
      "Recipients: " +
      Number(lastResult.totalRecipients || 0).toLocaleString("en-US") +
      " | Sent: " +
      Number(lastResult.sentCount || 0).toLocaleString("en-US") +
      " | Failed: " +
      Number(lastResult.failedCount || 0).toLocaleString("en-US");

    el("msgResultMeta").textContent = metaText;
    el("msgResultBox").textContent = AdminCore.toPretty(lastResult);
  }

  async function runBroadcast() {
    var payload = getPayload();
    if (!payload.message) {
      AdminCore.setStatus("Message text is required.", "warn");
      return;
    }

    var sendBtn = el("msgSendBtn");
    sendBtn.disabled = true;

    try {
      var data = await AdminCore.api("/api/admin/broadcast/send", {
        method: "POST",
        body: payload
      });

      renderResult(data, payload);
      AdminCore.setStatus(payload.dryRun ? "Dry run completed." : "Broadcast completed.", "ok");
      AdminCore.toast(payload.dryRun ? "Dry run finished." : "Broadcast sent.", "ok");

      if (!payload.dryRun) {
        await loadAudience();
      }
    } catch (error) {
      AdminCore.setStatus(error.message || "Broadcast failed.", "bad");
      throw error;
    } finally {
      sendBtn.disabled = false;
    }
  }

  function bindActions() {
    el("msgLoadAudienceBtn").addEventListener("click", function () {
      loadAudience()
        .then(function () {
          AdminCore.setStatus("Audience refreshed.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load audience.", "bad");
        });
    });

    el("msgSendBtn").addEventListener("click", function () {
      runBroadcast().catch(function (error) {
        AdminCore.setStatus(error.message || "Broadcast failed.", "bad");
      });
    });

    el("msgClearBtn").addEventListener("click", function () {
      var box = el("msgBodyInput");
      if (box) box.value = "";
      AdminCore.setStatus("Message editor cleared.", "info");
    });

    el("msgCopyBtn").addEventListener("click", function () {
      var text = String((el("msgBodyInput") || {}).value || "");
      AdminCore.copyText(text)
        .then(function () {
          AdminCore.setStatus("Message copied to clipboard.", "ok");
        })
        .catch(function () {
          AdminCore.setStatus("Clipboard copy failed.", "warn");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadAudience().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load messaging page data.", "bad");
    });
  });
})();
