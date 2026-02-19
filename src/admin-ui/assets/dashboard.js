(function () {
  var autoTimer = null;
  var lastPayload = {
    overview: {},
    analytics: {},
    queue: {
      submissions: [],
      opportunities: [],
      notifications: [],
      supportTickets: []
    }
  };

  function el(id) {
    return document.getElementById(id);
  }

  function renderHeroMetrics(overview) {
    var totalContents = Number((overview || {}).total_contents || 0);
    var publishedContents = Number((overview || {}).published_contents || 0);
    var publishRate = totalContents ? Math.round((publishedContents / totalContents) * 100) : 0;
    var backlog =
      Number((overview || {}).pending_submissions || 0) + Number((overview || {}).pending_opportunities || 0);

    var items = [
      {
        label: "Moderation Backlog",
        value: backlog,
        note: "Pending submissions + opportunities",
        tone: backlog > 0 ? "warn" : "ok"
      },
      {
        label: "Open Notifications",
        value: Number((overview || {}).open_notifications || 0),
        note: "Unresolved admin notifications",
        tone: Number((overview || {}).open_notifications || 0) > 0 ? "warn" : "ok"
      },
      {
        label: "Open Tickets",
        value: Number((overview || {}).open_support_tickets || 0),
        note: "Open or pending support tickets",
        tone: Number((overview || {}).open_support_tickets || 0) > 0 ? "warn" : "ok"
      },
      {
        label: "Bot Started Users",
        value: Number((overview || {}).bot_started_users || 0),
        note: "Users reachable in Telegram",
        tone: "ok"
      },
      {
        label: "Publish Rate",
        value: publishRate + "%",
        note: "Published / total content",
        tone: publishRate >= 70 ? "ok" : "warn"
      }
    ];

    el("dashboardHeroMetrics").innerHTML =
      items
        .map(function (item) {
          return (
            "<article class='hero-metric " +
            item.tone +
            "'><div class='hero-metric-value'>" +
            AdminCore.esc(String(item.value)) +
            "</div><div class='hero-metric-label'>" +
            AdminCore.esc(item.label) +
            "</div><div class='hero-metric-note'>" +
            AdminCore.esc(item.note) +
            "</div></article>"
          );
        })
        .join("") || "<div class='meta-text'>No dashboard data available.</div>";
  }

  function renderStats(overview) {
    var items = [
      ["Users", "total_users"],
      ["Profiles", "total_profiles"],
      ["Bot Started", "bot_started_users"],
      ["Contents", "total_contents"],
      ["Published", "published_contents"],
      ["Opportunities", "total_opportunities"],
      ["Pending Opps", "pending_opportunities"],
      ["Projects", "total_projects"],
      ["Applications", "total_applications"],
      ["Submissions", "total_submissions"],
      ["Pending Subs", "pending_submissions"],
      ["Tickets", "total_support_tickets"],
      ["Open Tickets", "open_support_tickets"],
      ["Open Notifs", "open_notifications"]
    ];

    el("dashboardStatsGrid").innerHTML =
      items
        .map(function (item) {
          var value = Number((overview || {})[item[1]] || 0).toLocaleString("en-US");
          return (
            "<article class='stat'><div class='stat-value'>" +
            value +
            "</div><div class='stat-key'>" +
            item[0] +
            "</div></article>"
          );
        })
        .join("") || "<div>No stats</div>";
  }

  function queueItemsByType(type) {
    if (type === "submission") {
      return (lastPayload.queue.submissions || []).map(function (item) {
        return {
          title: "Submission #" + item.id,
          meta: item.title || "-",
          href: "/admin/moderation",
          status: item.status || "pending"
        };
      });
    }

    if (type === "opportunity") {
      return (lastPayload.queue.opportunities || []).map(function (item) {
        return {
          title: "Opportunity #" + item.id,
          meta: item.title || "-",
          href: "/admin/projects",
          status: item.approval_status || "pending"
        };
      });
    }

    if (type === "notification") {
      return (lastPayload.queue.notifications || []).map(function (item) {
        return {
          title: "Notification #" + item.id,
          meta: item.title || item.type || "-",
          href: "/admin/integrations",
          status: item.status || "-"
        };
      });
    }

    if (type === "support") {
      return (lastPayload.queue.supportTickets || []).map(function (item) {
        return {
          title: "Ticket #" + item.id,
          meta: item.subject || "-",
          href: "/admin/support",
          status: item.status || "open"
        };
      });
    }

    return []
      .concat(queueItemsByType("submission"))
      .concat(queueItemsByType("opportunity"))
      .concat(queueItemsByType("notification"))
      .concat(queueItemsByType("support"));
  }

  function renderQuickQueue() {
    var type = String((el("dashboardQueueTypeInput") || {}).value || "all").trim();
    var queue = queueItemsByType(type === "all" ? "" : type);

    el("dashboardQuickQueue").innerHTML =
      queue
        .map(function (item) {
          return (
            "<article class='list-item'><div class='title'>" +
            AdminCore.esc(item.title || "-") +
            "</div><div class='meta'>" +
            AdminCore.esc(item.meta || "-") +
            "</div><div class='actions'>" +
            AdminCore.statusPill(item.status || "-") +
            "<a class='btn ghost' href='" +
            AdminCore.esc(item.href || "/admin/dashboard") +
            "'>Open Queue</a></div></article>"
          );
        })
        .join("") || "<div class='meta-text'>No urgent records.</div>";
  }

  function renderRecentUsers(users) {
    el("dashboardRecentUsers").innerHTML =
      (users || [])
        .map(function (item) {
          return (
            "<article class='list-item'><div class='title'>#" +
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
        .join("") || "<div class='meta-text'>No recent users.</div>";
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

  async function loadAll(silent) {
    var overviewData = await AdminCore.api("/api/admin/dashboard/overview");
    var overview = overviewData.overview || {};

    renderHeroMetrics(overview);
    renderStats(overview);
    renderRecentUsers(overviewData.recentUsers || []);

    var queueData = await Promise.all([
      AdminCore.api("/api/admin/moderation/submissions?status=pending&limit=8"),
      AdminCore.api("/api/admin/industry/opportunities?approvalStatus=pending&limit=8"),
      AdminCore.api("/api/admin/notifications?status=open&limit=8"),
      AdminCore.api("/api/admin/support/tickets?limit=16")
    ]);

    lastPayload.queue = {
      submissions: queueData[0].items || [],
      opportunities: queueData[1].items || [],
      notifications: queueData[2].items || [],
      supportTickets: (queueData[3].items || []).filter(function (item) {
        var st = String(item.status || "").toLowerCase();
        return st === "open" || st === "pending";
      })
    };
    renderQuickQueue();

    var analyticsData = await AdminCore.api("/api/admin/dashboard/analytics");
    lastPayload.overview = overview;
    lastPayload.analytics = analyticsData.analytics || {};
    renderAnalytics(lastPayload.analytics);

    if (!silent) {
      AdminCore.setStatus("Dashboard refreshed.", "ok");
      AdminCore.toast("Dashboard refreshed.", "ok");
    }
  }

  function setAutoRefresh(intervalMs) {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }

    var parsed = Number(intervalMs || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    autoTimer = setInterval(function () {
      loadAll(true).catch(function () {});
    }, parsed);
  }

  function bindActions() {
    var refreshBtn = el("dashboardRefreshBtn");
    var exportBtn = el("dashboardExportBtn");
    var queueTypeInput = el("dashboardQueueTypeInput");
    var autoInput = el("dashboardAutoInterval");

    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadAll(false).catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to refresh dashboard.", "bad");
        });
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        AdminCore.downloadJson("dashboard-export.json", lastPayload);
        AdminCore.toast("Dashboard export downloaded.", "ok");
      });
    }

    if (queueTypeInput) {
      queueTypeInput.addEventListener("change", renderQuickQueue);
    }

    if (autoInput) {
      autoInput.addEventListener("change", function () {
        setAutoRefresh(Number(autoInput.value || 0));
      });
    }
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadAll(false).catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load dashboard.", "bad");
    });
  });
})();
