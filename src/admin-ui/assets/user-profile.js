(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function getUserId() {
    return Number(document.body.getAttribute("data-user-id") || "0");
  }

  function toText(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : "-";
    }
    return String(value);
  }

  function toDateLabel(value) {
    if (!value) return "-";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function renderKv(targetId, rows) {
    var root = el(targetId);
    if (!root) return;
    var html = (rows || [])
      .map(function (row) {
        var label = AdminCore.esc(row.label || "-");
        var value = row.isHtml ? String(row.value || "-") : AdminCore.esc(toText(row.value));
        return (
          "<div class='kv-item'><div class='kv-label'>" +
          label +
          "</div><div class='kv-value'>" +
          value +
          "</div></div>"
        );
      })
      .join("");
    root.innerHTML = html || "<div class='profile-empty'>No data</div>";
  }

  function renderTags(items, emptyLabel) {
    var list = toArray(items);
    if (!list.length) return "<span class='profile-empty'>" + AdminCore.esc(emptyLabel || "No data") + "</span>";
    return list
      .map(function (item) {
        return "<span class='tag'>" + AdminCore.esc(toText(item)) + "</span>";
      })
      .join("");
  }

  function normalizeSkills(skills) {
    return toArray(skills)
      .map(function (skill) {
        if (!skill || typeof skill !== "object") return null;
        var name = String(skill.name || "").trim();
        if (!name) return null;
        var score = Number(skill.score);
        return { name: name, score: Number.isFinite(score) ? score : "-" };
      })
      .filter(Boolean);
  }

  function renderSkills(user) {
    var root = el("userProfileSkills");
    if (!root) return;

    var interests = toArray(user.interests);
    var skills = normalizeSkills(user.skills);
    var passedCourses = toArray(user.passed_courses);
    var links = [
      { label: "Resume", url: user.resume_url },
      { label: "GitHub", url: user.github_url },
      { label: "Portfolio", url: user.portfolio_url }
    ].filter(function (item) {
      return String(item.url || "").trim() !== "";
    });

    var html = "";
    html += "<div class='stack-section'><div class='stack-title'>Interests</div><div class='tag-list'>" + renderTags(interests, "No interests") + "</div></div>";
    html +=
      "<div class='stack-section'><div class='stack-title'>Skills</div><div class='tag-list'>" +
      (skills.length
        ? skills
            .map(function (skill) {
              return "<span class='tag'>" + AdminCore.esc(skill.name) + " (" + AdminCore.esc(toText(skill.score)) + "/10)</span>";
            })
            .join("")
        : "<span class='profile-empty'>No skills</span>") +
      "</div></div>";
    html += "<div class='stack-section'><div class='stack-title'>Passed Courses</div><div class='tag-list'>" + renderTags(passedCourses, "No courses") + "</div></div>";
    html +=
      "<div class='stack-section'><div class='stack-title'>External Links</div><div class='tag-list'>" +
      (links.length
        ? links
            .map(function (item) {
              return (
                "<a class='entity-link' href='" +
                AdminCore.esc(item.url) +
                "' target='_blank' rel='noopener noreferrer'>" +
                AdminCore.esc(item.label) +
                "</a>"
              );
            })
            .join("")
        : "<span class='profile-empty'>No links</span>") +
      "</div></div>";

    root.innerHTML = html;
  }

  function renderTableRows(targetId, rows, emptyLabel) {
    var body = el(targetId);
    if (!body) return;
    body.innerHTML = rows.length ? rows.join("") : "<tr><td colspan='5'>" + AdminCore.esc(emptyLabel || "No records") + "</td></tr>";
  }

  function summarizePayload(payload) {
    if (!payload || typeof payload !== "object") return "-";
    var keys = Object.keys(payload).slice(0, 4);
    if (!keys.length) return "-";
    return keys
      .map(function (key) {
        return key + ": " + toText(payload[key]);
      })
      .join(" | ");
  }

  function renderEvents(events) {
    var root = el("userProfileEventsList");
    if (!root) return;
    var rows = toArray(events);
    if (!rows.length) {
      root.innerHTML = "<div class='profile-empty'>No events recorded.</div>";
      return;
    }

    root.innerHTML = rows
      .map(function (row) {
        return (
          "<div class='list-item'>" +
          "<div class='title'>" +
          AdminCore.esc(row.event_type || "-") +
          "</div>" +
          "<div class='meta'>" +
          AdminCore.esc(toDateLabel(row.created_at)) +
          "</div>" +
          "<div class='meta'>" +
          AdminCore.esc(summarizePayload(row.payload)) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderHeader(user, activity) {
    var profileTitle = el("userProfileTitle");
    var profileSubtitle = el("userProfileSubtitle");
    var chips = el("userProfileHeroChips");
    var name = String(user.full_name || "").trim() || "Unknown user";
    var id = Number(user.user_id || 0);

    if (profileTitle) {
      profileTitle.textContent = name + (id ? " (#" + id + ")" : "");
    }

    if (profileSubtitle) {
      profileSubtitle.textContent = "Joined: " + toDateLabel(user.user_created_at);
    }

    if (!chips) return;
    chips.innerHTML = [
      "<span class='chip'>" + AdminCore.esc(user.phone_or_email || "-") + "</span>",
      "<span class='chip'>telegram: " + AdminCore.esc(user.telegram_id || "-") + "</span>",
      user.has_profile ? "<span class='chip ok'>Profile completed</span>" : "<span class='chip warn'>No profile</span>",
      "<span class='chip'>tickets: " + Number(toArray(activity.supportTickets).length) + "</span>",
      "<span class='chip'>applications: " + Number(toArray(activity.applications).length) + "</span>",
      "<span class='chip'>projects: " + Number(toArray(activity.studentProjects).length) + "</span>"
    ].join("");
  }

  function renderProfile(data) {
    var user = (data || {}).user || {};
    var activity = (data || {}).activity || {};

    renderHeader(user, activity);

    renderKv("userProfileIdentity", [
      { label: "Full Name", value: user.full_name },
      { label: "User ID", value: user.user_id },
      { label: "Contact", value: user.phone_or_email },
      { label: "Telegram ID", value: user.telegram_id },
      { label: "User Created", value: toDateLabel(user.user_created_at) },
      { label: "Profile Status", value: user.has_profile ? "Completed" : "Missing" }
    ]);

    renderKv("userProfileAcademic", [
      { label: "University", value: user.university },
      { label: "City", value: user.city },
      { label: "Major", value: user.major },
      { label: "Level", value: user.level },
      { label: "Term", value: user.term },
      { label: "Skill Level", value: user.skill_level },
      { label: "Weekly Hours", value: user.weekly_hours },
      { label: "Short-Term Goal", value: user.short_term_goal },
      { label: "Profile Updated", value: toDateLabel(user.profile_updated_at) }
    ]);

    renderSkills(user);

    var supportRows = toArray(activity.supportTickets).map(function (ticket) {
      return (
        "<tr><td><a class='entity-link' href='/admin/support'>#" +
        Number(ticket.id || 0) +
        "</a></td><td>" +
        AdminCore.esc(ticket.subject || "-") +
        "</td><td>" +
        AdminCore.statusPill(ticket.status || "-") +
        "</td><td>" +
        AdminCore.statusPill(ticket.priority || "-") +
        "</td><td>" +
        AdminCore.esc(toDateLabel(ticket.updated_at || ticket.created_at)) +
        "</td></tr>"
      );
    });
    renderTableRows("userProfileSupportBody", supportRows, "No support tickets.");

    var applicationRows = toArray(activity.applications).map(function (item) {
      return (
        "<tr><td>#" +
        Number(item.id || 0) +
        "</td><td>" +
        AdminCore.esc(item.opportunity_title || "-") +
        "</td><td>" +
        AdminCore.statusPill(item.status || "-") +
        "</td><td>" +
        AdminCore.esc(toDateLabel(item.updated_at || item.created_at)) +
        "</td></tr>"
      );
    });
    renderTableRows("userProfileApplicationsBody", applicationRows, "No industry applications.");

    var studentProjectRows = toArray(activity.studentProjects).map(function (item) {
      return (
        "<tr><td>#" +
        Number(item.project_id || item.id || 0) +
        "</td><td>" +
        AdminCore.esc(item.project_title || "-") +
        "</td><td>" +
        AdminCore.statusPill(item.status || "-") +
        "</td><td>" +
        AdminCore.esc(toDateLabel(item.updated_at || item.created_at)) +
        "</td></tr>"
      );
    });
    renderTableRows("userProfileProjectsBody", studentProjectRows, "No student projects.");

    var submissionRows = toArray(activity.submissions).map(function (item) {
      return (
        "<tr><td>#" +
        Number(item.id || 0) +
        "</td><td>" +
        AdminCore.esc(item.title || "-") +
        "</td><td>" +
        AdminCore.esc((item.section || "-") + " / " + (item.content_kind || "-")) +
        "</td><td>" +
        AdminCore.statusPill(item.status || "-") +
        "</td><td>" +
        AdminCore.esc(toDateLabel(item.created_at)) +
        "</td></tr>"
      );
    });
    renderTableRows("userProfileSubmissionsBody", submissionRows, "No content submissions.");

    renderEvents(activity.events);
  }

  async function loadProfile() {
    var userId = getUserId();
    if (!userId) {
      AdminCore.setStatus("Invalid user id in page context.", "bad");
      return;
    }
    var data = await AdminCore.api("/api/admin/users/" + userId);
    renderProfile(data);
    AdminCore.setStatus("User profile loaded.", "ok");
  }

  function bindActions() {
    var refreshBtn = el("userProfileRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadProfile().catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to reload user profile.", "bad");
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadProfile().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load user profile.", "bad");
    });
  });
})();
