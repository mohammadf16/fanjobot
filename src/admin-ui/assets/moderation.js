(function () {
  var rowsCache = [];

  function el(id) {
    return document.getElementById(id);
  }

  function buildQuery() {
    var query = new URLSearchParams({ limit: "140" });
    var status = String((el("moderationStatusInput") || {}).value || "").trim();
    var section = String((el("moderationSectionInput") || {}).value || "").trim();
    var kind = String((el("moderationKindInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    if (section) query.set("section", section);
    if (kind) query.set("contentKind", kind);
    return query.toString();
  }

  function filterRows(items) {
    var search = String((el("moderationSearchInput") || {}).value || "").trim().toLowerCase();
    if (!search) return (items || []).slice();
    return (items || []).filter(function (item) {
      var title = String(item.title || "").toLowerCase();
      var userId = String(item.user_id || "");
      var id = String(item.id || "");
      return title.includes(search) || userId.includes(search) || id.includes(search);
    });
  }

  function selectedIds() {
    return Array.from(document.querySelectorAll(".moderation-select:checked"))
      .map(function (node) {
        return Number(node.value);
      })
      .filter(function (id) {
        return Number.isFinite(id) && id > 0;
      });
  }

  function userProfileLink(userId) {
    var id = Number(userId);
    if (!id) return "-";
    return "<a class='entity-link' href='/admin/users/" + id + "'>#" + id + "</a>";
  }

  function renderRows(items) {
    rowsCache = (items || []).slice();
    var filtered = filterRows(rowsCache);

    el("moderationTableBody").innerHTML =
      filtered
        .map(function (item) {
          return (
            "<tr><td><input class='moderation-select' type='checkbox' value='" +
            item.id +
            "' /></td><td>" +
            item.id +
            "</td><td>" +
            AdminCore.statusPill(item.status || "-") +
            "</td><td>" +
            AdminCore.esc(item.section || "-") +
            " / " +
            AdminCore.esc(item.content_kind || "-") +
            "</td><td>" +
            AdminCore.esc(item.title || "-") +
            "</td><td>" +
            userProfileLink(item.user_id) +
            "</td><td>" +
            AdminCore.esc(item.created_at || "") +
            "</td><td><div class='toolbar'><button class='btn ghost sub-detail' data-id='" +
            item.id +
            "'>Detail</button><button class='btn sub-approve' data-id='" +
            item.id +
            "'>Approve</button><button class='btn danger sub-reject' data-id='" +
            item.id +
            "'>Reject</button></div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='8'>No submissions found.</td></tr>";
  }

  async function loadSubmissions() {
    var data = await AdminCore.api("/api/admin/moderation/submissions?" + buildQuery());
    renderRows(data.items || []);
  }

  async function loadDetail(id) {
    var data = await AdminCore.api("/api/admin/moderation/submissions/" + id);
    el("moderationDetailBox").textContent = AdminCore.toPretty(data);
  }

  function resolveReviewReason(action) {
    var input = el("moderationReasonInput");
    var typedReason = String((input || {}).value || "").trim();

    if (action === "approve") {
      return null;
    }

    if (typedReason) {
      return typedReason;
    }

    var prompted = window.prompt("Reject reason (optional). Leave empty for default message:", "");
    if (prompted === null) {
      return "__cancel__";
    }
    var normalized = String(prompted || "").trim();
    if (normalized && input) {
      input.value = normalized;
    }
    return normalized || "Rejected by admin moderation";
  }

  async function review(id, action, reason) {
    return AdminCore.api("/api/admin/moderation/submissions/" + id + "/review", {
      method: "POST",
      body: {
        action: action,
        reason: reason || null
      }
    });
  }

  async function bulkReview(action) {
    var ids = selectedIds();
    if (!ids.length) {
      AdminCore.setStatus("Select at least one row for bulk action.", "warn");
      return;
    }

    var reason = resolveReviewReason(action);
    if (reason === "__cancel__") {
      AdminCore.setStatus("Bulk " + action + " cancelled.", "info");
      return;
    }

    var results = await Promise.allSettled(
      ids.map(function (id) {
        return review(id, action, reason);
      })
    );
    var okCount = results.filter(function (result) {
      return result.status === "fulfilled";
    }).length;
    var failCount = results.length - okCount;
    var notifyFailCount = results.filter(function (result) {
      return result.status === "fulfilled" && result.value && result.value.notify && !result.value.notify.delivered;
    }).length;

    await loadSubmissions();
    AdminCore.setStatus(
      "Bulk " +
        action +
        " complete. Success: " +
        okCount +
        " | Failed: " +
        failCount +
        " | Notify failed: " +
        notifyFailCount,
      failCount || notifyFailCount ? "warn" : "ok"
    );
  }

  function exportRows() {
    AdminCore.downloadCsv(
      "moderation-submissions.csv",
      [
        { key: "id", label: "id" },
        { key: "status", label: "status" },
        { key: "section", label: "section" },
        { key: "content_kind", label: "content_kind" },
        { key: "title", label: "title" },
        { key: "user_id", label: "user_id" },
        { key: "created_at", label: "created_at" }
      ],
      filterRows(rowsCache)
    );
  }

  function bindActions() {
    el("moderationLoadBtn").addEventListener("click", function () {
      loadSubmissions()
        .then(function () {
          AdminCore.setStatus("Submissions loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load submissions.", "bad");
        });
    });

    el("moderationApproveSelectedBtn").addEventListener("click", function () {
      bulkReview("approve").catch(function (error) {
        AdminCore.setStatus(error.message || "Bulk approve failed.", "bad");
      });
    });

    el("moderationRejectSelectedBtn").addEventListener("click", function () {
      bulkReview("reject").catch(function (error) {
        AdminCore.setStatus(error.message || "Bulk reject failed.", "bad");
      });
    });

    el("moderationExportBtn").addEventListener("click", function () {
      exportRows();
      AdminCore.toast("Moderation CSV exported.", "ok");
    });

    el("moderationSearchInput").addEventListener(
      "input",
      AdminCore.debounce(function () {
        renderRows(rowsCache);
      }, 200)
    );

    el("moderationSelectAll").addEventListener("change", function (event) {
      var checked = Boolean(event.target.checked);
      Array.from(document.querySelectorAll(".moderation-select")).forEach(function (node) {
        node.checked = checked;
      });
    });

    el("moderationTableBody").addEventListener("click", function (event) {
      var detailBtn = event.target.closest(".sub-detail");
      var approveBtn = event.target.closest(".sub-approve");
      var rejectBtn = event.target.closest(".sub-reject");
      if (!detailBtn && !approveBtn && !rejectBtn) return;

      var id = Number((detailBtn || approveBtn || rejectBtn).dataset.id);
      if (!id) return;

      if (detailBtn) {
        loadDetail(id)
          .then(function () {
            AdminCore.setStatus("Submission detail loaded.", "ok");
          })
          .catch(function (error) {
            AdminCore.setStatus(error.message || "Failed to load detail.", "bad");
          });
        return;
      }

      var action = approveBtn ? "approve" : "reject";
      var reason = resolveReviewReason(action);
      if (reason === "__cancel__") {
        AdminCore.setStatus("Review action cancelled.", "info");
        return;
      }

      var reviewResult = null;
      review(id, action, reason)
        .then(function (data) {
          reviewResult = data || null;
          return Promise.all([loadSubmissions(), loadDetail(id)]);
        })
        .then(function () {
          if (reviewResult && reviewResult.notify && !reviewResult.notify.delivered) {
            AdminCore.setStatus("Submission updated. User notification was not delivered.", "warn");
            return;
          }
          AdminCore.setStatus("Submission updated and user notified.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to update submission.", "bad");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadSubmissions().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load moderation data.", "bad");
    });
  });
})();
