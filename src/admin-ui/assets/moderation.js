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
            "</td><td>#" +
            AdminCore.esc(item.user_id || "-") +
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

  async function review(id, action) {
    var reason = String((el("moderationReasonInput") || {}).value || "").trim();
    await AdminCore.api("/api/admin/moderation/submissions/" + id + "/review", {
      method: "POST",
      body: {
        action: action,
        reason: reason || "Reviewed in upgraded admin panel"
      }
    });
  }

  async function bulkReview(action) {
    var ids = selectedIds();
    if (!ids.length) {
      AdminCore.setStatus("Select at least one row for bulk action.", "warn");
      return;
    }

    var results = await Promise.allSettled(
      ids.map(function (id) {
        return review(id, action);
      })
    );
    var okCount = results.filter(function (result) {
      return result.status === "fulfilled";
    }).length;
    var failCount = results.length - okCount;

    await loadSubmissions();
    AdminCore.setStatus(
      "Bulk " + action + " complete. Success: " + okCount + " | Failed: " + failCount,
      failCount ? "warn" : "ok"
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

      review(id, approveBtn ? "approve" : "reject")
        .then(function () {
          return Promise.all([loadSubmissions(), loadDetail(id)]);
        })
        .then(function () {
          AdminCore.setStatus("Submission updated.", "ok");
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
