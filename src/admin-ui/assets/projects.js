(function () {
  var projectsCache = [];
  var opportunitiesCache = [];
  var applicationsCache = [];

  function el(id) {
    return document.getElementById(id);
  }

  function buildProjectQuery() {
    var query = new URLSearchParams({ limit: "160" });
    var status = String((el("projectStatusInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    return query.toString();
  }

  function buildOpportunityQuery() {
    var query = new URLSearchParams({ limit: "120" });
    var approval = String((el("opportunityStatusInput") || {}).value || "pending").trim();
    if (approval) query.set("approvalStatus", approval);
    return query.toString();
  }

  function buildApplicationsQuery() {
    var query = new URLSearchParams({ limit: "160" });
    var status = String((el("applicationsStatusInput") || {}).value || "").trim();
    if (status) query.set("status", status);
    return query.toString();
  }

  function userProfileLink(userId, fullName) {
    var id = Number(userId);
    var label = String(fullName || "").trim() || (id ? "User #" + id : "-");
    if (!id) return AdminCore.esc(label);
    return "<a class='entity-link' href='/admin/users/" + id + "'>" + AdminCore.esc(label) + "</a>";
  }

  function renderProjectsSummary(items) {
    var open = (items || []).filter(function (item) {
      return String(item.status || "").toLowerCase() === "open";
    }).length;
    var closed = (items || []).filter(function (item) {
      return String(item.status || "").toLowerCase() === "closed";
    }).length;

    el("projectsSummaryChips").innerHTML = [
      '<span class="chip">Visible projects: ' + Number((items || []).length).toLocaleString("en-US") + "</span>",
      '<span class="chip ok">Open: ' + Number(open).toLocaleString("en-US") + "</span>",
      '<span class="chip bad">Closed: ' + Number(closed).toLocaleString("en-US") + "</span>"
    ].join("");
  }

  function renderProjects(items) {
    projectsCache = (items || []).slice();
    renderProjectsSummary(projectsCache);

    el("projectTableBody").innerHTML =
      projectsCache
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
    opportunitiesCache = (items || []).slice();
    el("opportunityTableBody").innerHTML =
      opportunitiesCache
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
        .join("") || "<tr><td colspan='5'>No opportunities.</td></tr>";
  }

  function renderApplications(items) {
    applicationsCache = (items || []).slice();
    var statusOptions = ["draft", "submitted", "viewed", "interview", "rejected", "accepted"];
    el("applicationsTableBody").innerHTML =
      applicationsCache
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
            userProfileLink(item.user_id, item.full_name) +
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
    var data = await AdminCore.api("/api/admin/industry/opportunities?" + buildOpportunityQuery());
    renderOpportunities(data.items || []);
  }

  async function updateOpportunityApproval(opportunityId, approvalStatus) {
    await AdminCore.api("/api/admin/industry/opportunities/" + opportunityId + "/approval", {
      method: "PATCH",
      body: { approvalStatus: approvalStatus }
    });
  }

  async function loadApplications() {
    var data = await AdminCore.api("/api/admin/industry/applications?" + buildApplicationsQuery());
    renderApplications(data.items || []);
  }

  async function updateApplicationStatus(applicationId, status) {
    await AdminCore.api("/api/admin/industry/applications/" + applicationId + "/status", {
      method: "PATCH",
      body: { status: status }
    });
  }

  function exportProjects() {
    AdminCore.downloadCsv(
      "projects-export.csv",
      [
        { key: "id", label: "id" },
        { key: "title", label: "title" },
        { key: "company_name", label: "company_name" },
        { key: "status", label: "status" },
        { key: "type", label: "type" },
        { key: "level", label: "level" },
        { key: "created_at", label: "created_at" }
      ],
      projectsCache
    );
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

    el("projectExportBtn").addEventListener("click", function () {
      exportProjects();
      AdminCore.toast("Projects CSV exported.", "ok");
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

    el("opportunityStatusInput").addEventListener("change", function () {
      loadOpportunities().catch(function () {});
    });
    el("applicationsStatusInput").addEventListener("change", function () {
      loadApplications().catch(function () {});
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
          var matching = applicationsCache.find(function (item) {
            return Number(item.id) === applicationId;
          });
          el("applicationDetailBox").textContent = AdminCore.toPretty({
            applicationId: applicationId,
            previous: matching || null,
            nextStatus: nextStatus
          });
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
