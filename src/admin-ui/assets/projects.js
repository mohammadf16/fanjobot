(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function buildProjectQuery() {
    var query = new URLSearchParams({ limit: "120" });
    var status = String((el("projectStatusInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    return query.toString();
  }

  function renderProjects(items) {
    el("projectTableBody").innerHTML =
      (items || [])
        .map(function (item) {
          var openBtn =
            item.status === "open"
              ? ""
              : "<button class='btn project-open' data-id='" + item.id + "'>Approve/Open</button>";
          var closeBtn =
            item.status === "closed"
              ? ""
              : "<button class='btn danger project-close' data-id='" + item.id + "'>Reject/Close</button>";

          return (
            "<tr><td>" +
            item.id +
            "</td><td>" +
            AdminCore.esc(item.title || "-") +
            "</td><td>" +
            AdminCore.esc(item.company_name || "-") +
            "</td><td>" +
            AdminCore.statusPill(item.status || "-") +
            "</td><td>" +
            AdminCore.esc(item.type || "-") +
            " / " +
            AdminCore.esc(item.level || "-") +
            "</td><td><div class='toolbar'><button class='btn ghost project-detail' data-id='" +
            item.id +
            "'>Detail</button>" +
            openBtn +
            closeBtn +
            "</div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='6'>No projects found.</td></tr>";
  }

  function renderOpportunities(items) {
    el("opportunityTableBody").innerHTML =
      (items || [])
        .map(function (item) {
          return (
            "<tr><td>" +
            item.id +
            "</td><td>" +
            AdminCore.esc(item.title || "-") +
            "</td><td>" +
            AdminCore.esc(item.company_name || "-") +
            "</td><td>" +
            AdminCore.statusPill(item.approval_status || "pending") +
            "</td><td><div class='toolbar'><button class='btn opp-approve' data-id='" +
            item.id +
            "'>Approve</button><button class='btn danger opp-reject' data-id='" +
            item.id +
            "'>Reject</button></div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='5'>No pending opportunities.</td></tr>";
  }

  function renderApplications(items) {
    var statusOptions = ["draft", "submitted", "viewed", "interview", "rejected", "accepted"];
    el("applicationsTableBody").innerHTML =
      (items || [])
        .map(function (item) {
          var optionsHtml = statusOptions
            .map(function (status) {
              var selected = status === item.status ? "selected" : "";
              return "<option value='" + status + "' " + selected + ">" + status + "</option>";
            })
            .join("");

          return (
            "<tr><td>" +
            item.id +
            "</td><td>" +
            AdminCore.esc(item.opportunity_title || "-") +
            "</td><td>" +
            AdminCore.esc(item.full_name || "-") +
            "</td><td>" +
            AdminCore.statusPill(item.status || "-") +
            "</td><td><div class='toolbar'><select class='app-status' data-id='" +
            item.id +
            "'>" +
            optionsHtml +
            "</select><button class='btn app-update' data-id='" +
            item.id +
            "'>Update</button></div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='5'>No applications.</td></tr>";
  }

  async function loadProjects() {
    var data = await AdminCore.api("/api/admin/industry/projects?" + buildProjectQuery());
    renderProjects(data.items || []);
  }

  async function loadProjectDetail(projectId) {
    var data = await AdminCore.api("/api/admin/industry/projects/" + projectId + "/detail");
    el("projectDetailBox").textContent = AdminCore.toPretty(data);
  }

  async function updateProjectStatus(projectId, status) {
    await AdminCore.api("/api/admin/industry/projects/" + projectId + "/status", {
      method: "PATCH",
      body: { status: status }
    });
  }

  async function loadOpportunities() {
    var data = await AdminCore.api("/api/admin/industry/opportunities?approvalStatus=pending&limit=80");
    renderOpportunities(data.items || []);
  }

  async function updateOpportunityApproval(opportunityId, approvalStatus) {
    await AdminCore.api("/api/admin/industry/opportunities/" + opportunityId + "/approval", {
      method: "PATCH",
      body: { approvalStatus: approvalStatus }
    });
  }

  async function loadApplications() {
    var data = await AdminCore.api("/api/admin/industry/applications?limit=120");
    renderApplications(data.items || []);
  }

  async function updateApplicationStatus(applicationId, status) {
    await AdminCore.api("/api/admin/industry/applications/" + applicationId + "/status", {
      method: "PATCH",
      body: { status: status }
    });
  }

  async function loadAll() {
    await Promise.all([loadProjects(), loadOpportunities(), loadApplications()]);
  }

  function bindActions() {
    el("projectLoadBtn").addEventListener("click", function () {
      loadProjects()
        .then(function () {
          AdminCore.setStatus("Projects loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load projects.", "bad");
        });
    });

    el("opportunityRefreshBtn").addEventListener("click", function () {
      loadOpportunities()
        .then(function () {
          AdminCore.setStatus("Opportunities refreshed.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to refresh opportunities.", "bad");
        });
    });

    el("applicationsRefreshBtn").addEventListener("click", function () {
      loadApplications()
        .then(function () {
          AdminCore.setStatus("Applications refreshed.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to refresh applications.", "bad");
        });
    });

    el("projectTableBody").addEventListener("click", function (event) {
      var detailBtn = event.target.closest(".project-detail");
      var openBtn = event.target.closest(".project-open");
      var closeBtn = event.target.closest(".project-close");
      if (!detailBtn && !openBtn && !closeBtn) return;

      var projectId = Number((detailBtn || openBtn || closeBtn).dataset.id);
      if (!projectId) return;

      if (detailBtn) {
        loadProjectDetail(projectId)
          .then(function () {
            AdminCore.setStatus("Project detail loaded.", "ok");
          })
          .catch(function (error) {
            AdminCore.setStatus(error.message || "Failed to load project detail.", "bad");
          });
        return;
      }

      updateProjectStatus(projectId, openBtn ? "open" : "closed")
        .then(function () {
          return Promise.all([loadProjects(), loadProjectDetail(projectId)]);
        })
        .then(function () {
          AdminCore.setStatus("Project status updated.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to update project status.", "bad");
        });
    });

    el("opportunityTableBody").addEventListener("click", function (event) {
      var approveBtn = event.target.closest(".opp-approve");
      var rejectBtn = event.target.closest(".opp-reject");
      if (!approveBtn && !rejectBtn) return;
      var opportunityId = Number((approveBtn || rejectBtn).dataset.id);
      if (!opportunityId) return;

      updateOpportunityApproval(opportunityId, approveBtn ? "approved" : "rejected")
        .then(function () {
          return loadOpportunities();
        })
        .then(function () {
          AdminCore.setStatus("Opportunity moderation updated.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to update opportunity moderation.", "bad");
        });
    });

    el("applicationsTableBody").addEventListener("click", function (event) {
      var updateBtn = event.target.closest(".app-update");
      if (!updateBtn) return;
      var applicationId = Number(updateBtn.dataset.id);
      if (!applicationId) return;
      var select = el("applicationsTableBody").querySelector(".app-status[data-id='" + applicationId + "']");
      var nextStatus = select ? select.value : "viewed";

      updateApplicationStatus(applicationId, nextStatus)
        .then(function () {
          return loadApplications();
        })
        .then(function () {
          AdminCore.setStatus("Application status updated.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to update application status.", "bad");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadAll().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load projects/ops data.", "bad");
    });
  });
})();
