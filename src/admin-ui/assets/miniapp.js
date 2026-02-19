(function () {
  var state = {
    tg: null,
    tgUser: null,
    user: null,
    profile: null,
    isAdmin: false,
    activeTab: "dashboard",
    university: {
      all: [],
      filtered: [],
      page: 0,
      pageSize: 5
    },
    admin: {
      support: [],
      submissions: []
    }
  };

  var TAB_ITEMS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "profile", label: "Profile" },
    { key: "university", label: "University" },
    { key: "industry", label: "Industry" },
    { key: "path", label: "My Path" },
    { key: "support", label: "Support" },
    { key: "submissions", label: "Submissions" },
    { key: "admin", label: "Admin" }
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toText(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback || "-";
    return String(value);
  }

  function toDateLabel(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function parseCsv(value) {
    return String(value || "")
      .split(/[\u060C,]/)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function statusPill(status) {
    var normalized = String(status || "").toLowerCase();
    var cls = "pill";
    if (["open", "approved", "accepted", "done", "completed", "published", "answered", "in_progress"].includes(normalized)) cls += " ok";
    else if (["pending", "submitted", "viewed", "interview", "todo", "doing", "draft"].includes(normalized)) cls += " warn";
    else if (["rejected", "closed"].includes(normalized)) cls += " bad";
    return "<span class='" + cls + "'>" + esc(status || "-") + "</span>";
  }

  function toast(message, type) {
    var host = el("miniToastHost");
    if (!host) return;
    var node = document.createElement("div");
    node.className = "toast " + (type || "");
    node.textContent = String(message || "");
    host.appendChild(node);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 2600);
  }

  async function api(path, options) {
    var opts = options || {};
    var headers = opts.headers ? Object.assign({}, opts.headers) : {};
    var body = opts.body;

    if (body && !(body instanceof FormData) && typeof body === "object") {
      headers["content-type"] = headers["content-type"] || "application/json";
      body = JSON.stringify(body);
    }

    var response = await fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: body
    });

    var data = {};
    try {
      data = await response.json();
    } catch (_error) {}

    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function onError(error) {
    toast(error.message || "Error", "bad");
  }

  function ensureUser() {
    if (!state.user || !state.user.id) throw new Error("User session is not ready");
    return Number(state.user.id);
  }

  function ensureAdmin() {
    if (!state.isAdmin) throw new Error("Admin access is not available for this account.");
  }

  function adminAuthQuery() {
    var tgUser = state.tgUser || {};
    var params = new URLSearchParams({
      telegramId: String(tgUser.id || ""),
      username: String(tgUser.username || "")
    });
    return params.toString();
  }

  function buildNav() {
    var nav = el("miniNav");
    if (!nav) return;

    var visibleTabs = TAB_ITEMS.filter(function (item) {
      if (item.key === "admin") return state.isAdmin;
      return true;
    });

    nav.innerHTML = visibleTabs
      .map(function (item) {
        return "<button data-tab='" + item.key + "'>" + esc(item.label) + "</button>";
      })
      .join("");

    nav.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-tab]");
      if (!btn) return;
      setTab(btn.dataset.tab);
    });
  }

  function setTab(key) {
    state.activeTab = key;
    var navEl = el("miniNav");
    if (!navEl) return;

    var buttons = navEl.querySelectorAll("button[data-tab]");
    buttons.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === key);
    });

    var sections = document.querySelectorAll(".mini-tab");
    sections.forEach(function (node) {
      node.classList.toggle("active", node.id === "tab-" + key);
    });

    if (key === "dashboard") loadDashboard().catch(onError);
    if (key === "university") loadUniversity().catch(onError);
    if (key === "industry") loadIndustryHome().catch(onError);
    if (key === "path") loadPath().catch(onError);
    if (key === "support") loadSupportTickets().catch(onError);
    if (key === "submissions") loadMySubmissions().catch(onError);
    if (key === "admin" && state.isAdmin) {
      Promise.all([loadAdminOverview(), loadAdminSupportTickets(), loadAdminSubmissions()]).catch(onError);
    }
  }

  function renderDashCards(counters) {
    var cards = [];
    Object.keys(counters || {}).forEach(function (key) {
      var total = asArray(counters[key]).reduce(function (acc, row) {
        return acc + Number(row.total || 0);
      }, 0);
      cards.push({ label: key, value: total });
    });

    el("dashCards").innerHTML = cards
      .map(function (item) {
        return "<div class='card-item'><div class='value'>" + Number(item.value).toLocaleString() + "</div><div class='label'>" + esc(item.label) + "</div></div>";
      })
      .join("");
  }

  function renderKv(target, rows) {
    el(target).innerHTML = rows
      .map(function (row) {
        return "<div class='kv-row'><div class='kv-key'>" + esc(row.key) + "</div><div class='kv-value'>" + esc(toText(row.value)) + "</div></div>";
      })
      .join("");
  }

  async function loadDashboard() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/dashboard/" + userId);
    renderDashCards(data.counters || {});

    renderKv("dashProfile", [
      { key: "Name", value: data.profile.full_name },
      { key: "Major", value: data.profile.major },
      { key: "Term", value: data.profile.term },
      { key: "Skill level", value: data.profile.skill_level },
      { key: "Goal", value: data.profile.short_term_goal },
      { key: "Weekly hours", value: data.profile.weekly_hours }
    ]);

    el("dashEvents").innerHTML =
      asArray(data.recentEvents)
        .map(function (event) {
          return "<div class='list-item'><div class='list-title'>" + esc(event.event_type || "-") + "</div><div class='list-meta'>" + esc(toDateLabel(event.created_at)) + "</div></div>";
        })
        .join("") || "<div class='list-item'>No recent events.</div>";
  }

  function field(label, name, value, type) {
    return "<div class='form-row'><label for='" + name + "'>" + esc(label) + "</label><input id='" + name + "' type='" + (type || "text") + "' value='" + esc(value) + "' /></div>";
  }

  function parseSkills(raw) {
    return parseCsv(raw)
      .map(function (item) {
        var parts = item.split(":").map(function (p) { return p.trim(); });
        if (!parts[0]) return null;
        var score = Number(parts[1] || 5);
        if (!Number.isFinite(score)) score = 5;
        score = Math.max(1, Math.min(10, score));
        return { name: parts[0], score: score };
      })
      .filter(Boolean);
  }

  function buildProfileForm() {
    var p = state.profile || {};
    el("profileForm").innerHTML = [
      field("University", "university", p.university || ""),
      field("City", "city", p.city || ""),
      field("Major", "major", p.major || ""),
      field("Level", "level", p.level || ""),
      field("Term", "term", p.term || ""),
      field("Skill level", "skillLevel", p.skill_level || ""),
      field("Short-term goal", "shortTermGoal", p.short_term_goal || ""),
      field("Weekly free hours", "weeklyHours", p.weekly_hours || 8, "number"),
      field("Interests (comma separated)", "interests", asArray(p.interests).join(", ")),
      field("Skills (name:score)", "skills", asArray(p.skills).map(function (s) { return s.name + ":" + (s.score || 5); }).join(", ")),
      field("Passed courses", "passedCourses", asArray(p.passed_courses).join(", ")),
      field("Resume URL", "resumeUrl", p.resume_url || ""),
      field("GitHub URL", "githubUrl", p.github_url || ""),
      field("Portfolio URL", "portfolioUrl", p.portfolio_url || ""),
      "<button id='profileSaveBtn' class='btn' type='button'>Save profile</button>"
    ].join("");

    el("profileSaveBtn").addEventListener("click", function () {
      saveProfile().catch(onError);
    });
  }

  async function saveProfile() {
    var userId = ensureUser();
    var payload = {
      userId: userId,
      university: el("university").value,
      city: el("city").value,
      major: el("major").value,
      level: el("level").value,
      term: el("term").value,
      skillLevel: el("skillLevel").value,
      shortTermGoal: el("shortTermGoal").value,
      weeklyHours: Number(el("weeklyHours").value || 8),
      interests: parseCsv(el("interests").value),
      skills: parseSkills(el("skills").value),
      passedCourses: parseCsv(el("passedCourses").value),
      resumeUrl: el("resumeUrl").value || null,
      githubUrl: el("githubUrl").value || null,
      portfolioUrl: el("portfolioUrl").value || null
    };

    var res = await api("/api/profile/upsert", { method: "POST", body: payload });
    state.profile = Object.assign({}, state.profile || {}, res.profile || {});
    toast("Profile saved", "ok");
  }
  function normalizeUniversityItems(modules) {
    var map = {
      courses: "course",
      professors: "professor",
      notes: "note",
      books: "book",
      resources: "resource",
      videos: "video",
      sampleQuestions: "sample-question",
      summaries: "summary",
      examTips: "exam-tip"
    };
    var out = [];
    Object.keys(map).forEach(function (groupKey) {
      asArray(modules[groupKey]).forEach(function (item) {
        out.push(Object.assign({}, item, { _kind: map[groupKey] }));
      });
    });
    return out;
  }

  async function loadUniversity() {
    var userId = ensureUser();
    var data = await api("/api/university/my/" + userId + "?limit=120");
    state.university.all = normalizeUniversityItems(data.modules || {});
    renderUniversityFilters();
    applyUniversityFilters();
  }

  function renderUniversityFilters() {
    var kinds = ["", "course", "professor", "note", "book", "resource", "video", "sample-question", "summary", "exam-tip"];
    el("uniKindFilter").innerHTML = kinds.map(function (kind) {
      var label = kind || "all";
      return "<option value='" + kind + "'>" + label + "</option>";
    }).join("");
  }

  function applyUniversityFilters() {
    var q = String(el("uniSearchInput").value || "").trim().toLowerCase();
    var kind = String(el("uniKindFilter").value || "").trim();
    state.university.filtered = state.university.all.filter(function (item) {
      if (kind && item._kind !== kind) return false;
      if (!q) return true;
      var hay = (item.title || "") + " " + (item.description || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
    state.university.page = 0;
    renderUniversityList();
  }

  function renderUniversityList() {
    var start = state.university.page * state.university.pageSize;
    var pageItems = state.university.filtered.slice(start, start + state.university.pageSize);

    el("uniList").innerHTML =
      pageItems
        .map(function (item) {
          var metaLines = String(item.description || "").split(/\n+/).slice(0, 3).join(" | ");
          var downloadUrl = item.drive_link || item.external_link || "";
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item._kind) + "</div>" +
            "<div class='list-meta'>" + esc(metaLines || "No description") + "</div>" +
            "<div class='list-actions'>" +
            (downloadUrl ? "<a class='btn' href='" + esc(downloadUrl) + "' target='_blank'>Open / Download</a>" : "<span class='pill warn'>No file link</span>") +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>No item found.</div>";

    var totalPages = Math.max(1, Math.ceil(state.university.filtered.length / state.university.pageSize));
    el("uniPageLabel").textContent = "Page " + (state.university.page + 1) + " of " + totalPages;
  }

  async function loadIndustryHome() {
    await Promise.all([loadIndustryOpportunities(), loadIndustryProjects(), loadIndustryApplications()]);
  }

  async function loadIndustryOpportunities() {
    var userId = ensureUser();
    var type = el("indTypeFilter").value || "";
    var query = "/api/industry/student/opportunities?userId=" + userId + "&limit=20";
    if (type) query += "&type=" + encodeURIComponent(type);
    var data = await api(query);

    el("indOppList").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.level || "-") + "</div>" +
            "<div class='list-meta'>" + esc(item.company_name || "-") + " | match: " + Number(item.matchScore || 0).toFixed(1) + "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ind-apply' data-id='" + item.id + "'>Apply</button>" +
            "<button class='btn ghost ind-save' data-id='" + item.id + "'>Save</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>No opportunity found.</div>";
  }

  async function loadIndustryProjects() {
    var userId = ensureUser();
    var data = await api("/api/industry/student/projects?userId=" + userId + "&limit=20");

    el("indProjectList").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.level || "-") + "</div>" +
            "<div class='list-meta'>Estimated: " + esc(item.estimated_hours || "-") + " h</div>" +
            "<div class='list-actions'><button class='btn ind-start-project' data-id='" + item.id + "'>Start project</button></div>" +
            "</div>"
          );
        })
        .join("") || "<div class='list-item'>No project found.</div>";
  }

  async function loadIndustryWorkspace() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/industry/workspace/" + userId + "?limit=20");

    el("indProjectList").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.project_title || "-") + " " + statusPill(item.status || "-") + "</div>" +
            "<div class='list-meta'>Progress: " + Number(item.progress || 0) + "% | output links: " + asArray(item.output_links).length + "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ghost ind-progress' data-id='" + item.id + "'>Set progress</button>" +
            "<button class='btn ghost ind-link' data-id='" + item.id + "'>Add link</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>No active project.</div>";
  }

  async function loadIndustryApplications() {
    var userId = ensureUser();
    var data = await api("/api/industry/student/applications/" + userId);

    el("indApplications").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return "<div class='list-item'><div class='list-title'>" + esc(item.opportunity_title || "-") + " " + statusPill(item.status || "-") + "</div><div class='list-meta'>Updated: " + esc(toDateLabel(item.updated_at)) + "</div></div>";
        })
        .join("") || "<div class='list-item'>No application found.</div>";
  }

  async function loadPath() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/my-path/" + userId);
    renderPathSummary(data.summary || {});
    renderPathLists(data);
  }

  function renderPathSummary(summary) {
    el("pathSummary").innerHTML = [
      { label: "Goals", value: summary.totalGoals || 0 },
      { label: "Tasks", value: summary.totalTasks || 0 },
      { label: "Done", value: summary.doneTasks || 0 },
      { label: "Artifacts", value: summary.totalArtifacts || 0 },
      { label: "Completion", value: (summary.completionRate || 0) + "%" }
    ].map(function (item) {
      return "<div class='card-item'><div class='value'>" + esc(item.value) + "</div><div class='label'>" + esc(item.label) + "</div></div>";
    }).join("");
  }

  function renderPathLists(data) {
    el("pathGoals").innerHTML = asArray(data.goals).map(function (goal) {
      return "<div class='list-item'><div class='list-title'>" + esc(goal.title) + " " + statusPill(goal.status) + "</div><div class='list-meta'>type: " + esc(goal.type) + " | progress: " + Number(goal.progress_percent || 0) + "%</div></div>";
    }).join("") || "<div class='list-item'>No goal found.</div>";

    el("pathTasks").innerHTML = asArray(data.tasks).map(function (task) {
      return "<div class='list-item'><div class='list-title'>" + esc(task.title) + " " + statusPill(task.status) + "</div><div class='list-actions'><button class='btn ghost path-task-status' data-id='" + task.id + "' data-status='doing'>Start</button><button class='btn path-task-status' data-id='" + task.id + "' data-status='done'>Mark done</button></div></div>";
    }).join("") || "<div class='list-item'>No task found.</div>";

    el("pathArtifacts").innerHTML = asArray(data.artifacts).map(function (artifact) {
      var link = artifact.url ? "<a class='btn ghost' href='" + esc(artifact.url) + "' target='_blank'>Open</a>" : "";
      return "<div class='list-item'><div class='list-title'>" + esc(artifact.title) + " " + statusPill(artifact.type) + "</div><div class='list-actions'>" + link + "</div></div>";
    }).join("") || "<div class='list-item'>No artifact found.</div>";
  }

  async function loadSupportTickets() {
    var userId = ensureUser();
    var data = await api("/api/support/my/" + userId + "/tickets?limit=30");

    el("supportList").innerHTML =
      asArray(data.items)
        .map(function (ticket) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>#" + Number(ticket.id) + " " + esc(ticket.subject || "-") + " " + statusPill(ticket.status || "-") + "</div>" +
            "<div class='list-meta'>" + esc(ticket.last_message || "-") + "</div>" +
            "<div class='list-actions'><button class='btn ghost support-detail' data-id='" + ticket.id + "'>Detail / Reply</button></div>" +
            "</div>"
          );
        })
        .join("") || "<div class='list-item'>No ticket found.</div>";
  }

  async function loadMySubmissions() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/submissions/" + userId + "?limit=30");

    el("submissionList").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return "<div class='list-item'><div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.status || "-") + "</div><div class='list-meta'>" + esc(item.moderation_reason || "Pending moderation") + "</div></div>";
        })
        .join("") || "<div class='list-item'>No submission found.</div>";
  }

  function renderAdminCards(overview) {
    var rows = [
      { label: "Total users", value: overview.total_users || 0 },
      { label: "Started bot users", value: overview.bot_started_users || 0 },
      { label: "Open support tickets", value: overview.open_support_tickets || 0 },
      { label: "Pending submissions", value: overview.pending_submissions || 0 },
      { label: "Open admin notifications", value: overview.open_admin_notifications || 0 }
    ];
    el("adminOverviewCards").innerHTML = rows
      .map(function (item) {
        return (
          "<div class='card-item'><div class='value'>" +
          Number(item.value || 0).toLocaleString() +
          "</div><div class='label'>" +
          esc(item.label) +
          "</div></div>"
        );
      })
      .join("");
  }

  function renderAdminSupport(items) {
    state.admin.support = asArray(items);
    el("adminSupportList").innerHTML =
      state.admin.support
        .map(function (ticket) {
          var userName = ticket.full_name || ("User #" + Number(ticket.user_id || 0));
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>#" +
            Number(ticket.id) +
            " " +
            esc(ticket.subject || "-") +
            " " +
            statusPill(ticket.status || "-") +
            "</div>" +
            "<div class='list-meta'>" +
            esc(userName) +
            " | " +
            esc(ticket.last_message || "-") +
            "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ghost admin-ticket-detail' data-id='" +
            ticket.id +
            "'>Detail</button>" +
            "<button class='btn admin-ticket-reply' data-id='" +
            ticket.id +
            "'>Reply</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>No ticket found.</div>";
  }

  function renderAdminSubmissions(items) {
    state.admin.submissions = asArray(items);
    el("adminSubmissionList").innerHTML =
      state.admin.submissions
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>#" +
            Number(item.id) +
            " " +
            esc(item.title || "-") +
            " " +
            statusPill(item.status || "-") +
            "</div>" +
            "<div class='list-meta'>" +
            esc((item.full_name || ("User #" + Number(item.user_id || 0))) + " | " + (item.section || "-") + " / " + (item.content_kind || "-")) +
            "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn admin-sub-approve' data-id='" +
            item.id +
            "'>Approve</button>" +
            "<button class='btn danger admin-sub-reject' data-id='" +
            item.id +
            "'>Reject</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>No submission found.</div>";
  }

  async function loadAdminOverview() {
    ensureAdmin();
    var data = await api("/api/miniapp/admin/overview?" + adminAuthQuery());
    renderAdminCards(data.overview || {});
    renderAdminSupport(data.supportTickets || []);
    renderAdminSubmissions(data.pendingSubmissions || []);
  }

  async function loadAdminSupportTickets() {
    ensureAdmin();
    var data = await api("/api/miniapp/admin/support/tickets?" + adminAuthQuery() + "&limit=40");
    renderAdminSupport(data.items || []);
  }

  async function loadAdminSubmissions() {
    ensureAdmin();
    var data = await api("/api/miniapp/admin/moderation/submissions?" + adminAuthQuery() + "&status=pending&limit=40");
    renderAdminSubmissions(data.items || []);
  }

  async function adminTicketDetail(ticketId) {
    ensureAdmin();
    var data = await api("/api/miniapp/admin/support/tickets/" + ticketId + "?" + adminAuthQuery());
    var lines = asArray(data.messages).map(function (item) {
      var role = String(item.sender_role || "").toLowerCase() === "admin" ? "Admin" : "User";
      return "[" + role + "] " + (item.sender_full_name || "-") + ": " + (item.message_text || "");
    });
    window.alert(lines.join("\n\n") || "No messages.");
  }

  async function adminTicketReply(ticketId) {
    ensureAdmin();
    var message = window.prompt("Reply text:", "");
    if (!message || !message.trim()) return;
    await api("/api/miniapp/admin/support/tickets/" + ticketId + "/reply?" + adminAuthQuery(), {
      method: "POST",
      body: { message: message.trim(), status: "answered" }
    });
    toast("Support reply sent", "ok");
    await loadAdminSupportTickets();
  }

  async function adminReviewSubmission(submissionId, action) {
    ensureAdmin();
    var reason = null;
    if (action === "reject") {
      reason = window.prompt("Reject reason:", "");
      if (reason === null) return;
      reason = String(reason || "").trim() || "Rejected by admin moderation";
    }
    await api("/api/miniapp/admin/moderation/submissions/" + submissionId + "/review?" + adminAuthQuery(), {
      method: "POST",
      body: { action: action, reason: reason }
    });
    toast(action === "approve" ? "Submission approved" : "Submission rejected", "ok");
    await loadAdminSubmissions();
  }

  async function adminRunBroadcast() {
    ensureAdmin();
    var message = String((el("adminBroadcastMessage") || {}).value || "").trim();
    if (!message) throw new Error("Broadcast message is required.");
    var limit = Number((el("adminBroadcastLimit") || {}).value || 0);
    var dryRun = Boolean((el("adminBroadcastDryRun") || {}).checked);

    var result = await api("/api/miniapp/admin/broadcast/send?" + adminAuthQuery(), {
      method: "POST",
      body: {
        message: message,
        dryRun: dryRun,
        limit: Number.isFinite(limit) && limit > 0 ? limit : null
      }
    });

    if (result.dryRun) {
      toast("Dry run complete: " + Number(result.totalRecipients || 0) + " users", "warn");
      return;
    }
    toast(
      "Broadcast sent: " +
        Number(result.sentCount || 0) +
        "/" +
        Number(result.totalRecipients || 0),
      "ok"
    );
  }

  async function showSupportDetail(ticketId) {
    var userId = ensureUser();
    var data = await api("/api/support/my/" + userId + "/tickets/" + ticketId);
    var textLog = asArray(data.messages).map(function (m) {
      var role = String(m.sender_role || "") === "admin" ? "Admin" : "User";
      return "[" + role + "] " + (m.message_text || "");
    }).join("\n\n");

    var reply = window.prompt("Reply to ticket #" + ticketId + ":", "");
    if (reply && reply.trim()) {
      await api("/api/support/my/" + userId + "/tickets/" + ticketId + "/reply", {
        method: "POST",
        body: { message: reply.trim() }
      });
      toast("Reply sent", "ok");
      await loadSupportTickets();
      return;
    }

    window.alert(textLog || "No message.");
  }
  function bindStaticActions() {
    el("miniRefreshAllBtn").addEventListener("click", function () {
      if (state.activeTab === "dashboard") loadDashboard().catch(onError);
      if (state.activeTab === "university") loadUniversity().catch(onError);
      if (state.activeTab === "industry") loadIndustryHome().catch(onError);
      if (state.activeTab === "path") loadPath().catch(onError);
      if (state.activeTab === "support") loadSupportTickets().catch(onError);
      if (state.activeTab === "submissions") loadMySubmissions().catch(onError);
      if (state.activeTab === "admin" && state.isAdmin) {
        Promise.all([loadAdminOverview(), loadAdminSupportTickets(), loadAdminSubmissions()]).catch(onError);
      }
    });

    el("uniLoadBtn").addEventListener("click", function () { applyUniversityFilters(); });
    el("uniPrevBtn").addEventListener("click", function () {
      state.university.page = Math.max(0, state.university.page - 1);
      renderUniversityList();
    });
    el("uniNextBtn").addEventListener("click", function () {
      var totalPages = Math.max(1, Math.ceil(state.university.filtered.length / state.university.pageSize));
      state.university.page = Math.min(totalPages - 1, state.university.page + 1);
      renderUniversityList();
    });

    el("indLoadOppBtn").addEventListener("click", function () { loadIndustryOpportunities().catch(onError); });
    el("indLoadProjectsBtn").addEventListener("click", function () { loadIndustryProjects().catch(onError); });
    el("indLoadWorkspaceBtn").addEventListener("click", function () { loadIndustryWorkspace().catch(onError); });

    if (state.isAdmin) {
      el("adminLoadOverviewBtn").addEventListener("click", function () {
        loadAdminOverview().catch(onError);
      });
      el("adminLoadSupportBtn").addEventListener("click", function () {
        loadAdminSupportTickets().catch(onError);
      });
      el("adminLoadSubmissionsBtn").addEventListener("click", function () {
        loadAdminSubmissions().catch(onError);
      });
      el("adminBroadcastBtn").addEventListener("click", function () {
        adminRunBroadcast().catch(onError);
      });
    }

    document.body.addEventListener("click", function (event) {
      var applyBtn = event.target.closest(".ind-apply");
      var saveBtn = event.target.closest(".ind-save");
      var startBtn = event.target.closest(".ind-start-project");
      var progressBtn = event.target.closest(".ind-progress");
      var linkBtn = event.target.closest(".ind-link");
      var supportDetailBtn = event.target.closest(".support-detail");
      var pathTaskStatusBtn = event.target.closest(".path-task-status");
      var adminTicketDetailBtn = event.target.closest(".admin-ticket-detail");
      var adminTicketReplyBtn = event.target.closest(".admin-ticket-reply");
      var adminSubApproveBtn = event.target.closest(".admin-sub-approve");
      var adminSubRejectBtn = event.target.closest(".admin-sub-reject");

      if (applyBtn) {
        api("/api/industry/student/opportunities/" + Number(applyBtn.dataset.id) + "/apply", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("Application submitted", "ok"); loadIndustryApplications().catch(onError); })
          .catch(onError);
      }

      if (saveBtn) {
        api("/api/industry/student/opportunities/" + Number(saveBtn.dataset.id) + "/save", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("Opportunity saved", "ok"); })
          .catch(onError);
      }

      if (startBtn) {
        api("/api/industry/student/projects/" + Number(startBtn.dataset.id) + "/start", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("Project started", "ok"); loadIndustryWorkspace().catch(onError); })
          .catch(onError);
      }

      if (progressBtn) {
        var nextProgress = Number(window.prompt("Enter progress (0-100):", "30"));
        if (!Number.isFinite(nextProgress)) return;
        nextProgress = Math.max(0, Math.min(100, Math.floor(nextProgress)));
        api("/api/industry/student/student-projects/" + Number(progressBtn.dataset.id), {
          method: "PATCH",
          body: { progress: nextProgress, status: nextProgress >= 100 ? "completed" : "in_progress" }
        }).then(function () { toast("Progress saved", "ok"); loadIndustryWorkspace().catch(onError); }).catch(onError);
      }

      if (linkBtn) {
        var link = window.prompt("Enter output URL:", "");
        if (!link) return;
        api("/api/industry/student/student-projects/" + Number(linkBtn.dataset.id), { method: "PATCH", body: { outputLinks: [link] } })
          .then(function () { toast("Output link added", "ok"); loadIndustryWorkspace().catch(onError); })
          .catch(onError);
      }

      if (supportDetailBtn) showSupportDetail(Number(supportDetailBtn.dataset.id)).catch(onError);

      if (pathTaskStatusBtn) {
        api("/api/miniapp/my-path/tasks/" + Number(pathTaskStatusBtn.dataset.id), {
          method: "PATCH",
          body: { userId: ensureUser(), status: pathTaskStatusBtn.dataset.status }
        }).then(function () { toast("Task status updated", "ok"); loadPath().catch(onError); }).catch(onError);
      }

      if (adminTicketDetailBtn) {
        adminTicketDetail(Number(adminTicketDetailBtn.dataset.id)).catch(onError);
      }

      if (adminTicketReplyBtn) {
        adminTicketReply(Number(adminTicketReplyBtn.dataset.id)).catch(onError);
      }

      if (adminSubApproveBtn) {
        adminReviewSubmission(Number(adminSubApproveBtn.dataset.id), "approve").catch(onError);
      }

      if (adminSubRejectBtn) {
        adminReviewSubmission(Number(adminSubRejectBtn.dataset.id), "reject").catch(onError);
      }
    });
  }

  function buildForms() {
    el("pathGoalForm").innerHTML = [
      "<select id='goalType'><option value='academic'>academic</option><option value='career'>career</option><option value='project'>project</option><option value='application'>application</option></select>",
      "<input id='goalTitle' placeholder='Goal title' />",
      "<button id='goalAddBtn' class='btn' type='button'>Add goal</button>"
    ].join("");

    el("pathTaskForm").innerHTML = [
      "<select id='taskType'><option value='study'>study</option><option value='practice'>practice</option><option value='project'>project</option><option value='apply'>apply</option><option value='interview'>interview</option></select>",
      "<input id='taskTitle' placeholder='Task title' />",
      "<input id='taskGoalId' placeholder='goalId (optional)' />",
      "<button id='taskAddBtn' class='btn' type='button'>Add task</button>"
    ].join("");

    el("pathArtifactForm").innerHTML = [
      "<select id='artifactType'><option value='github'>github</option><option value='demo'>demo</option><option value='file'>file</option><option value='certificate'>certificate</option><option value='resume_bullet'>resume_bullet</option></select>",
      "<input id='artifactTitle' placeholder='Artifact title' />",
      "<input id='artifactUrl' placeholder='https://...' />",
      "<button id='artifactAddBtn' class='btn' type='button'>Add artifact</button>"
    ].join("");

    el("supportCreateForm").innerHTML = [
      field("Ticket subject", "supportSubject", "", "text"),
      "<div class='form-row'><label for='supportPriority'>Priority</label><select id='supportPriority'><option value='normal'>normal</option><option value='high'>high</option><option value='urgent'>urgent</option><option value='low'>low</option></select></div>",
      "<div class='form-row'><label for='supportMessage'>Message</label><textarea id='supportMessage'></textarea></div>",
      "<button id='supportCreateBtn' class='btn' type='button'>Create ticket</button>"
    ].join("");

    el("submissionForm").innerHTML = [
      "<div class='form-row'><label for='subKind'>Content kind</label><select id='subKind'><option value='note'>note</option><option value='book'>book</option><option value='resource'>resource</option><option value='video'>video</option><option value='summary'>summary</option><option value='sample-question'>sample question</option><option value='exam-tip'>exam tip</option><option value='course'>course</option><option value='professor'>professor</option></select></div>",
      field("Course name", "subCourseName", ""),
      field("Professor name", "subProfessorName", ""),
      field("Title", "subTitle", ""),
      field("Purpose", "subPurpose", ""),
      field("Tags", "subTags", ""),
      "<div class='form-row'><label for='subFile'>PDF file (optional)</label><input id='subFile' type='file' accept='application/pdf' /></div>",
      "<button id='submissionSendBtn' class='btn' type='button'>Submit for review</button>"
    ].join("");

    el("goalAddBtn").addEventListener("click", function () {
      api("/api/miniapp/my-path/goals", { method: "POST", body: { userId: ensureUser(), type: el("goalType").value, title: el("goalTitle").value } })
        .then(function () { toast("Goal added", "ok"); el("goalTitle").value = ""; loadPath().catch(onError); })
        .catch(onError);
    });

    el("taskAddBtn").addEventListener("click", function () {
      api("/api/miniapp/my-path/tasks", { method: "POST", body: { userId: ensureUser(), type: el("taskType").value, title: el("taskTitle").value, goalId: el("taskGoalId").value || null } })
        .then(function () { toast("Task added", "ok"); el("taskTitle").value = ""; loadPath().catch(onError); })
        .catch(onError);
    });

    el("artifactAddBtn").addEventListener("click", function () {
      api("/api/miniapp/my-path/artifacts", { method: "POST", body: { userId: ensureUser(), type: el("artifactType").value, title: el("artifactTitle").value, url: el("artifactUrl").value || null } })
        .then(function () { toast("Artifact added", "ok"); el("artifactTitle").value = ""; el("artifactUrl").value = ""; loadPath().catch(onError); })
        .catch(onError);
    });

    el("supportCreateBtn").addEventListener("click", function () {
      api("/api/support/tickets", {
        method: "POST",
        body: {
          userId: ensureUser(),
          subject: el("supportSubject").value,
          priority: el("supportPriority").value,
          message: el("supportMessage").value
        }
      }).then(function () {
        toast("Ticket created", "ok");
        el("supportSubject").value = "";
        el("supportMessage").value = "";
        loadSupportTickets().catch(onError);
      }).catch(onError);
    });

    el("supportLoadBtn").addEventListener("click", function () { loadSupportTickets().catch(onError); });

    el("submissionSendBtn").addEventListener("click", function () {
      var form = new FormData();
      form.append("userId", String(ensureUser()));
      form.append("contentKind", el("subKind").value);
      form.append("courseName", el("subCourseName").value);
      form.append("professorName", el("subProfessorName").value);
      form.append("title", el("subTitle").value);
      form.append("purpose", el("subPurpose").value);
      form.append("tags", el("subTags").value);
      var file = el("subFile").files[0];
      if (file) form.append("file", file);

      api("/api/miniapp/submissions/university", { method: "POST", body: form })
        .then(function () {
          toast("Submission added to moderation queue", "ok");
          el("subTitle").value = "";
          el("subPurpose").value = "";
          el("subTags").value = "";
          el("subFile").value = "";
          loadMySubmissions().catch(onError);
        })
        .catch(onError);
    });

    el("submissionLoadBtn").addEventListener("click", function () { loadMySubmissions().catch(onError); });
  }

  async function bootstrapSession() {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    state.tg = tg;

    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (_error) {}
    }

    var tgUser = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
    state.tgUser = tgUser;
    state.isAdmin = Boolean(
      String((tgUser || {}).id || "") === "565136808" ||
      String((tgUser || {}).username || "").toLowerCase() === "immohammadf"
    );

    if (!tgUser || !tgUser.id) throw new Error("Open this mini app from Telegram.");

    var session = await api("/api/miniapp/session", {
      method: "POST",
      body: {
        telegramId: String(tgUser.id),
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        username: tgUser.username || ""
      }
    });

    state.user = session.user || null;
    state.profile = session.profile || null;
    el("miniUserLabel").textContent =
      "@" + toText(tgUser.username || "-") + " | user #" + Number((state.user || {}).id || 0).toLocaleString();
  }

  async function boot() {
    try {
      await bootstrapSession();
      buildNav();
      buildForms();
      buildProfileForm();
      bindStaticActions();
      setTab("dashboard");
      toast("Mini app is ready", "ok");
    } catch (error) {
      onError(error);
      el("miniUserLabel").textContent = error.message || "Mini app failed";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
