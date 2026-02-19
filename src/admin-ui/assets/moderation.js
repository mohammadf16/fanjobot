(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function buildQuery() {
    var query = new URLSearchParams({ limit: "100" });
    var status = String((el("moderationStatusInput") || {}).value || "").trim();
    var section = String((el("moderationSectionInput") || {}).value || "").trim();
    var kind = String((el("moderationKindInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    if (section) query.set("section", section);
    if (kind) query.set("contentKind", kind);
    return query.toString();
  }

  function renderRows(items) {
    el("moderationTableBody").innerHTML =
      (items || [])
        .map(function (item) {
          return (
            "<tr><td>" +
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
        .join("") || "<tr><td colspan='7'>No submissions found.</td></tr>";
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
    await AdminCore.api("/api/admin/moderation/submissions/" + id + "/review", {
      method: "POST",
      body: {
        action: action,
        reason: "Reviewed in multi-page admin panel"
      }
    });
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
