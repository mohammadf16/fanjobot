(function () {
  var rowsCache = [];
  var selectedTicketId = null;

  function el(id) {
    return document.getElementById(id);
  }

  function buildQuery() {
    var params = new URLSearchParams({ limit: "160" });
    var status = String((el("supportStatusInput") || {}).value || "").trim();
    var priority = String((el("supportPriorityInput") || {}).value || "").trim();
    var q = String((el("supportSearchInput") || {}).value || "").trim();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (q) params.set("q", q);
    return params.toString();
  }

  function renderSummary(summary) {
    var chips = (summary || []).map(function (row) {
      return "<span class='chip'>" + AdminCore.esc(row.status) + ": " + Number(row.total || 0) + "</span>";
    });
    el("supportSummaryChips").innerHTML = chips.join("") || "<span class='chip muted'>No summary</span>";
  }

  function renderRows(items) {
    rowsCache = (items || []).slice();
    el("supportTableBody").innerHTML =
      rowsCache
        .map(function (row) {
          return (
            "<tr><td>#" +
            row.id +
            "</td><td>" +
            AdminCore.statusPill(row.status || "-") +
            "</td><td>" +
            AdminCore.statusPill(row.priority || "-") +
            "</td><td>" +
            AdminCore.esc(row.subject || "-") +
            "</td><td>" +
            AdminCore.esc(row.full_name || "-") +
            "</td><td>" +
            AdminCore.esc(row.updated_at || row.created_at || "-") +
            "</td><td><div class='toolbar'><button class='btn ghost support-detail' data-id='" +
            row.id +
            "'>Detail</button><button class='btn ghost support-pending' data-id='" +
            row.id +
            "'>Pending</button><button class='btn ghost support-closed' data-id='" +
            row.id +
            "'>Close</button></div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='7'>No tickets found.</td></tr>";
  }

  async function loadTickets() {
    var data = await AdminCore.api("/api/admin/support/tickets?" + buildQuery());
    renderRows(data.items || []);
    renderSummary(data.summary || []);
    return data;
  }

  async function loadDetail(ticketId) {
    var data = await AdminCore.api("/api/admin/support/tickets/" + ticketId);
    selectedTicketId = ticketId;
    el("supportDetailBox").textContent = AdminCore.toPretty(data);
    el("supportMetaBox").textContent = "Selected ticket: #" + ticketId;
    return data;
  }

  async function updateStatus(ticketId, status) {
    await AdminCore.api("/api/admin/support/tickets/" + ticketId + "/status", {
      method: "PATCH",
      body: { status: status }
    });
  }

  async function sendReply() {
    if (!selectedTicketId) {
      AdminCore.setStatus("Select a ticket first.", "warn");
      return;
    }

    var message = String((el("supportReplyInput") || {}).value || "").trim();
    var status = String((el("supportReplyStatusInput") || {}).value || "answered").trim();
    if (!message) {
      AdminCore.setStatus("Reply message is required.", "warn");
      return;
    }

    var result = await AdminCore.api("/api/admin/support/tickets/" + selectedTicketId + "/reply", {
      method: "POST",
      body: {
        message: message,
        status: status || "answered"
      }
    });

    await Promise.all([loadTickets(), loadDetail(selectedTicketId)]);
    if (result.notify && !result.notify.delivered) {
      AdminCore.setStatus("Reply saved, but Telegram notification was not delivered.", "warn");
      return;
    }
    AdminCore.setStatus("Reply sent successfully.", "ok");
    AdminCore.toast("Support reply sent.", "ok");
  }

  function exportRows() {
    AdminCore.downloadCsv(
      "support-tickets.csv",
      [
        { key: "id", label: "id" },
        { key: "status", label: "status" },
        { key: "priority", label: "priority" },
        { key: "subject", label: "subject" },
        { key: "full_name", label: "full_name" },
        { key: "phone_or_email", label: "phone_or_email" },
        { key: "telegram_id", label: "telegram_id" },
        { key: "updated_at", label: "updated_at" }
      ],
      rowsCache
    );
  }

  function bindActions() {
    el("supportLoadBtn").addEventListener("click", function () {
      loadTickets()
        .then(function () {
          AdminCore.setStatus("Support tickets loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load tickets.", "bad");
        });
    });

    el("supportExportBtn").addEventListener("click", function () {
      exportRows();
      AdminCore.toast("Support CSV exported.", "ok");
    });

    el("supportReplyBtn").addEventListener("click", function () {
      sendReply().catch(function (error) {
        AdminCore.setStatus(error.message || "Failed to send support reply.", "bad");
      });
    });

    el("supportTableBody").addEventListener("click", function (event) {
      var detailBtn = event.target.closest(".support-detail");
      var pendingBtn = event.target.closest(".support-pending");
      var closedBtn = event.target.closest(".support-closed");
      if (!detailBtn && !pendingBtn && !closedBtn) return;

      var ticketId = Number((detailBtn || pendingBtn || closedBtn).dataset.id);
      if (!ticketId) return;

      if (detailBtn) {
        loadDetail(ticketId)
          .then(function () {
            AdminCore.setStatus("Ticket detail loaded.", "ok");
          })
          .catch(function (error) {
            AdminCore.setStatus(error.message || "Failed to load ticket detail.", "bad");
          });
        return;
      }

      var targetStatus = pendingBtn ? "pending" : "closed";
      updateStatus(ticketId, targetStatus)
        .then(function () {
          return Promise.all([loadTickets(), loadDetail(ticketId)]);
        })
        .then(function () {
          AdminCore.setStatus("Ticket status updated.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to update ticket status.", "bad");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadTickets().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load support tickets.", "bad");
    });
  });
})();
