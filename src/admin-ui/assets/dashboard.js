(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function renderStats(overview) {
    var items = [
      ["Users", "total_users"],
      ["Profiles", "total_profiles"],
      ["Contents", "total_contents"],
      ["Published", "published_contents"],
      ["Opportunities", "total_opportunities"],
      ["Pending Opps", "pending_opportunities"],
      ["Projects", "total_projects"],
      ["Applications", "total_applications"],
      ["Submissions", "total_submissions"],
      ["Pending Subs", "pending_submissions"],
      ["Open Notifs", "open_notifications"]
    ];

    var html = items
      .map(function (item) {
        var value = Number((overview || {})[item[1]] || 0).toLocaleString("en-US");
        return (
          '<article class="stat"><div class="stat-value">' +
          value +
          '</div><div class="stat-key">' +
          item[0] +
          "</div></article>"
        );
      })
      .join("");

    el("dashboardStatsGrid").innerHTML = html || "<div>No stats</div>";
  }

  function renderQuickQueue(all) {
    var queue = [];
    var submissions = all[0].items || [];
    var opportunities = all[1].items || [];
    var notifications = all[2].items || [];

    submissions.forEach(function (item) {
      queue.push(
        '<article class="list-item"><div class="title">Submission #' +
          item.id +
          "</div><div class='meta'>" +
          AdminCore.esc(item.title || "-") +
          "</div></article>"
      );
    });

    opportunities.forEach(function (item) {
      queue.push(
        '<article class="list-item"><div class="title">Opportunity #' +
          item.id +
          "</div><div class='meta'>" +
          AdminCore.esc(item.title || "-") +
          "</div></article>"
      );
    });

    notifications.forEach(function (item) {
      queue.push(
        '<article class="list-item"><div class="title">Notification #' +
          item.id +
          "</div><div class='meta'>" +
          AdminCore.esc(item.title || item.type || "-") +
          "</div></article>"
      );
    });

    el("dashboardQuickQueue").innerHTML = queue.join("") || "<div class='meta-text'>No urgent records.</div>";
  }

  function renderRecentUsers(users) {
    var html = (users || [])
      .map(function (item) {
        return (
          '<article class="list-item"><div class="title">#' +
          item.id +
          " " +
          AdminCore.esc(item.full_name || "-") +
          "</div><div class='meta'>" +
          AdminCore.esc(item.phone_or_email || "-") +
          "</div><div class='meta'>" +
          AdminCore.esc(item.created_at || "") +
          "</div></article>"
        );
      })
      .join("");

    el("dashboardRecentUsers").innerHTML = html || "<div class='meta-text'>No recent users.</div>";
  }

  function renderAnalytics(analytics) {
    var majors = analytics.profilesByMajor || [];
    var submissions = analytics.submissionsByStatus || [];
    var contents = analytics.contentsByTypeKind || [];

    el("dashboardMajorsBody").innerHTML =
      majors
        .map(function (item) {
          return (
            "<tr><td>" +
            AdminCore.esc(item.major || "-") +
            "</td><td>" +
            Number(item.total || 0).toLocaleString("en-US") +
            "</td></tr>"
          );
        })
        .join("") || "<tr><td colspan='2'>No data</td></tr>";

    el("dashboardSubmissionAnalyticsBody").innerHTML =
      submissions
        .map(function (item) {
          return (
            "<tr><td>" +
            AdminCore.statusPill(item.status || "-") +
            "</td><td>" +
            AdminCore.esc(item.section || "-") +
            "</td><td>" +
            AdminCore.esc(item.content_kind || "-") +
            "</td><td>" +
            Number(item.total || 0).toLocaleString("en-US") +
            "</td></tr>"
          );
        })
        .join("") || "<tr><td colspan='4'>No data</td></tr>";

    el("dashboardContentAnalyticsBody").innerHTML =
      contents
        .map(function (item) {
          return (
            "<tr><td>" +
            AdminCore.esc(item.type || "-") +
            "</td><td>" +
            AdminCore.esc(item.kind || "-") +
            "</td><td>" +
            Number(item.total || 0).toLocaleString("en-US") +
            "</td><td>" +
            Number(item.published || 0).toLocaleString("en-US") +
            "</td></tr>"
          );
        })
        .join("") || "<tr><td colspan='4'>No data</td></tr>";

    el("dashboardOpsAnalyticsBox").textContent = AdminCore.toPretty({
      applicationsByStatus: analytics.applicationsByStatus || [],
      projectsByStatus: analytics.projectsByStatus || []
    });
  }

  async function loadAll() {
    var overviewData = await AdminCore.api("/api/admin/dashboard/overview");
    renderStats(overviewData.overview || {});
    renderRecentUsers(overviewData.recentUsers || []);

    var queueData = await Promise.all([
      AdminCore.api("/api/admin/moderation/submissions?status=pending&limit=8"),
      AdminCore.api("/api/admin/industry/opportunities?approvalStatus=pending&limit=8"),
      AdminCore.api("/api/admin/notifications?status=open&limit=8")
    ]);
    renderQuickQueue(queueData);

    var analyticsData = await AdminCore.api("/api/admin/dashboard/analytics");
    renderAnalytics(analyticsData.analytics || {});
  }

  function bindActions() {
    var refreshBtn = el("dashboardRefreshBtn");
    if (!refreshBtn) return;
    refreshBtn.addEventListener("click", function () {
      loadAll()
        .then(function () {
          AdminCore.setStatus("Dashboard refreshed.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to refresh dashboard.", "bad");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadAll().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load dashboard.", "bad");
    });
  });
})();
