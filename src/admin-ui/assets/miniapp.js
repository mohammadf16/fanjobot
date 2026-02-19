(function () {
  var state = {
    tg: null,
    tgUser: null,
    user: null,
    profile: null,
    industryProfile: null,
    isAdmin: false,
    activeTab: "dashboard",
    university: {
      all: [],
      filtered: [],
      page: 0,
      pageSize: 5
    },
    industry: {
      opportunities: [],
      oppPage: 0,
      projects: [],
      projPage: 0,
      applications: [],
      savedOpportunities: [],
      workspace: [],
      resources: [],
      resourcePage: 0,
      selectedOpportunity: null,
      selectedProject: null
    },
    path: {
      goals: [],
      tasks: [],
      artifacts: [],
      summary: {}
    },
    admin: {
      support: [],
      submissions: [],
      notifications: []
    }
  };

  var TAB_ITEMS = [
    { key: "dashboard", label: "📊 داشبورد" },
    { key: "profile", label: "👨‍💼 پروفایل" },
    { key: "university", label: "🎓 دانشگاه" },
    { key: "industry", label: "💼 صنعت" },
    { key: "path", label: "🗺️ مسیر من" },
    { key: "support", label: "💬 پشتیبانی" },
    { key: "submissions", label: "📤 آپلودها" },
    { key: "settings", label: "⚙️ تنظیمات" },
    { key: "admin", label: "👑 ادمین" }
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

  var STATUS_LABELS = {
    open: "باز",
    approved: "تایید شده",
    accepted: "پذیرفته شده",
    done: "انجام شد",
    completed: "تکمیل شد",
    published: "منتشر شد",
    answered: "پاسخ داده شد",
    in_progress: "در حال انجام",
    pending: "در انتظار",
    submitted: "ارسال شد",
    viewed: "دیده شد",
    interview: "مصاحبه",
    todo: "انجام نشده",
    doing: "در حال انجام",
    draft: "پیش‌نویس",
    rejected: "رد شده",
    closed: "بسته\u200c\u200c"
  };

  function statusPill(status) {
    var normalized = String(status || "").toLowerCase();
    var cls = "pill";
    if (["open", "approved", "accepted", "done", "completed", "published", "answered", "in_progress"].includes(normalized)) cls += " ok";
    else if (["pending", "submitted", "viewed", "interview", "todo", "doing", "draft"].includes(normalized)) cls += " warn";
    else if (["rejected", "closed"].includes(normalized)) cls += " bad";
    var displayText = STATUS_LABELS[normalized] || String(status || "-");
    return "<span class='" + cls + "'>" + esc(displayText) + "</span>";
  }

  function toast(message, type) {
    var host = el("miniToastHost");
    if (!host) return;
    var node = document.createElement("div");
    node.className = "toast " + (type || "");
    node.textContent = String(message || "");
    node.style.direction = "rtl";
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
    toast(error.message || "خطا", "bad");
  }

  function showLoading(elementId) {
    var el = document.getElementById(elementId);
    if (el) {
      el.classList.add("loading");
      el.innerHTML = "<div style='text-align: center; padding: 20px;'><div class='spinner' style='display: inline-block;'></div><p style='margin-top: 10px; color: var(--text-secondary);'>در حال بارگیری...</p></div>";
    }
  }

  function hideLoading(elementId) {
    var el = document.getElementById(elementId);
    if (el) {
      el.classList.remove("loading");
    }
  }

  function showEmptyState(elementId, icon, title, text) {
    var el = document.getElementById(elementId);
    if (el) {
      el.innerHTML = "<div class='empty-state'><div class='empty-state-icon'>" + icon + "</div><div class='empty-state-title'>" + title + "</div><div class='empty-state-text'>" + text + "</div></div>";
    }
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
    if (key === "profile") buildProfileForm();
    if (key === "university") loadUniversity().catch(onError);
    if (key === "industry") loadIndustryHome().catch(onError);
    if (key === "path") loadPath().catch(onError);
    if (key === "support") loadSupportTickets().catch(onError);
    if (key === "submissions") loadMySubmissions().catch(onError);
    if (key === "settings") buildSettingsForm();
    if (key === "admin" && state.isAdmin) {
      Promise.all([loadAdminOverview(), loadAdminSupportTickets(), loadAdminSubmissions()]).catch(onError);
    }
  }

  function renderDashCards(counters) {
    var labelMap = {
      support: "تیکت پشتیبانی",
      submissions: "آپلود",
      applications: "درخواست",
      projects: "پروژه",
      tasks: "تسک",
      goals: "هدف"
    };
    var cards = [];
    Object.keys(counters || {}).forEach(function (key) {
      var total = asArray(counters[key]).reduce(function (acc, row) {
        return acc + Number(row.total || 0);
      }, 0);
      var displayLabel = labelMap[key] || key;
      cards.push({ label: displayLabel, value: total });
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
      { key: "نام", value: data.profile.full_name },
      { key: "رشته", value: data.profile.major },
      { key: "ترم", value: data.profile.term },
      { key: "سطح مهارت", value: data.profile.skill_level },
      { key: "هدف کوتاه مدت", value: data.profile.short_term_goal },
      { key: "ساعات هفتگی", value: data.profile.weekly_hours }
    ]);

    el("dashEvents").innerHTML =
      asArray(data.recentEvents)
        .map(function (event) {
          return "<div class='list-item'><div class='list-title'>" + esc(event.event_type || "-") + "</div><div class='list-meta'>" + esc(toDateLabel(event.created_at)) + "</div></div>";
        })
        .join("") || "<div class='list-item'>رویدادی به تازگی ایجاد نشده است.</div>";
  }

  function field(label, name, value, type) {
    return "<div class='form-row'><label for='" + name + "' style='text-align: right;'>" + esc(label) + "</label><input id='" + name + "' type='" + (type || "text") + "' value='" + esc(value) + "' style='direction: rtl; text-align: right;' /></div>";
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
      field("دانشگاه", "university", p.university || ""),
      field("شهر", "city", p.city || ""),
      field("رشته تحصیلی", "major", p.major || ""),
      field("سطح", "level", p.level || ""),
      field("ترم", "term", p.term || ""),
      field("سطح مهارت", "skillLevel", p.skill_level || ""),
      field("هدف کوتاه مدت", "shortTermGoal", p.short_term_goal || ""),
      field("ساعات آزاد هفتگی", "weeklyHours", p.weekly_hours || 8, "number"),
      field("علایق (جدا شده با کاما)", "interests", asArray(p.interests).join(", ")),
      field("مهارت‌ها (نام:امتیاز)", "skills", asArray(p.skills).map(function (s) { return s.name + ":" + (s.score || 5); }).join(", ")),
      field("دروس گذرانده شده", "passedCourses", asArray(p.passed_courses).join(", ")),
      field("لینک رزومه", "resumeUrl", p.resume_url || ""),
      field("لینک GitHub", "githubUrl", p.github_url || ""),
      field("لینک نمونه کار", "portfolioUrl", p.portfolio_url || ""),
      "<button id='profileSaveBtn' class='btn' type='button'>ذخیره پروفایل</button>"
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
    toast("پروفایل ذخیره شد", "ok");
  }

  function buildSettingsForm() {
    // Load settings from localStorage
    var notifPush = localStorage.getItem("setting_notif_push") !== "false";
    var notifEmail = localStorage.getItem("setting_notif_email") !== "false";
    var notifTelegram = localStorage.getItem("setting_notif_telegram") !== "false";
    var themeMode = localStorage.getItem("setting_theme_mode") || "auto";

    // Set checkbox values
    el("notifPush").checked = notifPush;
    el("notifEmail").checked = notifEmail;
    el("notifTelegram").checked = notifTelegram;
    el("themeMode").value = themeMode;

    // Add event listeners
    el("notifPush").addEventListener("change", function (e) {
      localStorage.setItem("setting_notif_push", e.target.checked);
      toast("تنظیم برای اعلان‌های فشاری ذخیره شد", "ok");
    });

    el("notifEmail").addEventListener("change", function (e) {
      localStorage.setItem("setting_notif_email", e.target.checked);
      toast("تنظیم برای اعلان‌های ایمیل ذخیره شد", "ok");
    });

    el("notifTelegram").addEventListener("change", function (e) {
      localStorage.setItem("setting_notif_telegram", e.target.checked);
      toast("تنظیم برای اعلان‌های تلگرام ذخیره شد", "ok");
    });

    el("themeMode").addEventListener("change", function (e) {
      localStorage.setItem("setting_theme_mode", e.target.value);
      toast("تم‌های نمایش تغییر یافت", "ok");
    });
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
    var data = await api("/api/miniapp/university/my/" + userId + "?limit=120");
    state.university.all = normalizeUniversityItems(data.modules || {});
    renderUniversityFilters();
    applyUniversityFilters();
  }

  function renderUniversityFilters() {
    var kindLabels = {
      "": "همه",
      "course": "درس",
      "professor": "استاد",
      "note": "ا݂ور",
      "book": "کتاب",
      "resource": "منبع",
      "video": "ویدیو",
      "sample-question": "نمونه پرسش",
      "summary": "خلاصه",
      "exam-tip": "راهنمایی امتحان"
    };
    var kinds = ["", "course", "professor", "note", "book", "resource", "video", "sample-question", "summary", "exam-tip"];
    el("uniKindFilter").innerHTML = kinds.map(function (kind) {
      var label = kindLabels[kind];
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
          var hasFile = Boolean(item.has_file);
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item._kind) + "</div>" +
            "<div class='list-meta'>" + esc(metaLines || "No description") + "</div>" +
            "<div class='list-actions'>" +
            (hasFile
              ? "<button class='btn uni-request-download' data-id='" + Number(item.id) + "'>Send In Telegram</button>"
              : "<span class='pill warn'>No downloadable file</span>") +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>No item found.</div>";

    var totalPages = Math.max(1, Math.ceil(state.university.filtered.length / state.university.pageSize));
    el("uniPageLabel").textContent = "Page " + (state.university.page + 1) + " of " + totalPages;
  }

  async function loadIndustryHome() {
    await Promise.all([
      loadIndustryProfile(),
      loadIndustryOpportunities(),
      loadIndustryProjects(),
      loadIndustryApplications(),
      loadIndustryWorkspace(),
      loadIndustrySavedOpportunities(),
      loadIndustryResources()
    ]);
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
            "<div class='list-meta'>" + esc(item.company_name || "-") + " | مطابقت: " + Number(item.matchScore || 0).toFixed(1) + "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ind-apply' data-id='" + item.id + "'>درخواست</button>" +
            "<button class='btn ghost ind-save' data-id='" + item.id + "'>ذخیره</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>فرصتی یافت نشد.</div>";
  }

  async function loadIndustryProjects() {
    var userId = ensureUser();
    var data = await api("/api/industry/student/projects?userId=" + userId + "&limit=20");
    state.industry.projects = asArray(data.items);
    renderIndustryProjects();
  }

  function renderIndustryProjects() {
    el("indProjectList").innerHTML =
      state.industry.projects
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.level || "-") + "</div>" +
            "<div class='list-meta'>تخمینی: " + esc(item.estimated_hours || "-") + " ساعت</div>" +
            "<div class='list-actions'><button class='btn ind-start-project' data-id='" + item.id + "'>شروع پروژه</button></div>" +
            "</div>"
          );
        })
        .join("") || "<div class='list-item'>پروژه یافت نشد.</div>";
  }

  async function loadIndustryProfile() {
    var userId = ensureUser();
    var data = await api("/api/industry/student/profile/" + userId);
    state.industryProfile = data.profile || {};
    renderIndustryProfileForm();
  }

  function renderIndustryProfileForm() {
    var p = state.industryProfile || {};
    el("industryProfileForm").innerHTML = [
      field("شغل مورد نظر", "targetJob", p.target_job || ""),
      field("سطح تجربه", "experienceLevel", p.experience_level || ""),
      field("محل کار ترجیحی", "preferredLocation", p.preferred_location || ""),
      field("نوع شغل ترجیحی", "preferredJobType", p.preferred_job_type || ""),
      field("حداقل حقوق مورد نظر", "salary", p.expected_salary || "", "number"),
      field("درباره شما", "about", p.about || ""),
      "<textarea id='careerSummary' placeholder='خلاصه شغلی شما' style='direction: rtl; text-align: right; min-height: 80px;'>" + esc(p.career_summary || "") + "</textarea>",
      "<button id='industrySaveBtn' class='btn' type='button'>ذخیره پروفایل صنعتی</button>"
    ].join("");

    el("industrySaveBtn").addEventListener("click", function () {
      saveIndustryProfile().catch(onError);
    });
  }

  async function saveIndustryProfile() {
    var userId = ensureUser();
    var payload = {
      userId: userId,
      targetJob: el("targetJob").value,
      experienceLevel: el("experienceLevel").value,
      preferredLocation: el("preferredLocation").value,
      preferredJobType: el("preferredJobType").value,
      expectedSalary: Number(el("salary").value || 0),
      about: el("about").value || null,
      careerSummary: el("careerSummary").value || null
    };

    var res = await api("/api/industry/student/profile/" + userId, { method: "PUT", body: payload });
    state.industryProfile = res.profile || {};
    toast("پروفایل صنعتی ذخیره شد", "ok");
  }

  async function loadIndustryWorkspace() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/industry/workspace/" + userId + "?limit=30");
    state.industry.workspace = asArray(data.items);
    renderIndustryWorkspace();
  }

  function renderIndustryWorkspace() {
    el("indWorkspaceList").innerHTML =
      state.industry.workspace
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.project_title || "-") + " " + statusPill(item.status || "-") + "</div>" +
            "<div class='list-meta'>پیشرفت: " + Number(item.progress || 0) + "% | لینک‌ها: " + asArray(item.output_links).length + "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ghost ind-progress' data-id='" + item.id + "'>تعیین پیشرفت</button>" +
            "<button class='btn ghost ind-link' data-id='" + item.id + "'>افزودن لینک</button>" +
            "<button class='btn ghost ind-workspace-detail' data-id='" + item.id + "'>جزئیات</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>پروژه فعالی یافت نشد.</div>";
  }

  async function showWorkspaceDetail(workspaceId) {
    var item = state.industry.workspace.find(function (w) { return w.id === workspaceId; });
    if (!item) {
      toast("پروژه یافت نشد", "bad");
      return;
    }
    
    var details = "پروژه: " + item.project_title + "\n" +
                  "وضعیت: " + (STATUS_LABELS[item.status] || item.status) + "\n" +
                  "پیشرفت: " + item.progress + "%\n" +
                  "تاریخ شروع: " + toDateLabel(item.started_at) + "\n" +
                  "تاریخ آپدیت: " + toDateLabel(item.updated_at) + "\n\n" +
                  "لینک‌های خروجی:\n" + asArray(item.output_links).map(function (l) { return "• " + l; }).join("\n") || "لینکی ثبت نشده";
    
    window.alert(details);
  }

  async function loadIndustrySavedOpportunities() {
    var userId = ensureUser();
    var data = await api("/api/industry/student/saved-opportunities/" + userId + "?limit=20");
    state.industry.savedOpportunities = asArray(data.items);
    renderIndustrySavedOpportunities();
  }

  function renderIndustrySavedOpportunities() {
    el("indSavedOppList").innerHTML =
      state.industry.savedOpportunities
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.level || "-") + "</div>" +
            "<div class='list-meta'>" + esc(item.company_name || "-") + " | مطابقت: " + Number(item.matchScore || 0).toFixed(1) + "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ind-saved-apply' data-id='" + item.id + "'>درخواست</button>" +
            "<button class='btn danger ind-unsave' data-id='" + item.id + "'>حذف</button>" +
            "<button class='btn ghost ind-saved-detail' data-id='" + item.id + "'>جزئیات</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>فرصت ذخیره شده‌ای یافت نشد.</div>";
  }

  async function loadIndustryResources() {
    var userId = ensureUser();
    var category = el("resCategory").value || "";
    var query = "/api/industry/resources?limit=20";
    if (category) query += "&category=" + encodeURIComponent(category);
    var data = await api(query);
    state.industry.resources = asArray(data.items);
    state.industry.resourcePage = 0;
    renderIndustryResources();
  }

  function renderIndustryResources() {
    var start = state.industry.resourcePage * 5;
    var pageItems = state.industry.resources.slice(start, start + 5);
    
    el("indResourceList").innerHTML =
      pageItems
        .map(function (item) {
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.category || "-") + "</div>" +
            "<div class='list-meta'>" + esc(item.description || "-") + "</div>" +
            "<div class='list-actions'>" +
            (item.url ? "<a class='btn' href='" + esc(item.url) + "' target='_blank'>باز / دانلود</a>" : "") +
            "<button class='btn ghost ind-resource-detail' data-id='" + item.id + "'>بیشتر</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>منبعی یافت نشد.</div>";
    
    var totalPages = Math.max(1, Math.ceil(state.industry.resources.length / 5));
    el("resPageLabel").textContent = "صفحه " + (state.industry.resourcePage + 1) + " از " + totalPages;
  }

  async function loadIndustryApplications() {
    var userId = ensureUser();
    var data = await api("/api/industry/student/applications/" + userId);

    el("indApplications").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return "<div class='list-item'><div class='list-title'>" + esc(item.opportunity_title || "-") + " " + statusPill(item.status || "-") + "</div><div class='list-meta'>به روز: " + esc(toDateLabel(item.updated_at)) + "</div></div>";
        })
        .join("") || "<div class='list-item'>درخواستی یافت نشد.</div>";
  }

  async function loadPath() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/my-path/" + userId);
    state.path.summary = data.summary || {};
    state.path.goals = asArray(data.goals);
    state.path.tasks = asArray(data.tasks);
    state.path.artifacts = asArray(data.artifacts);
    renderPathSummary(data.summary || {});
    renderPathLists(data);
  }

  function renderPathSummary(summary) {
    el("pathSummary").innerHTML = [
      { label: "هدف‌ها", value: summary.totalGoals || 0 },
      { label: "تسك‌ها", value: summary.totalTasks || 0 },
      { label: "انجام شده", value: summary.doneTasks || 0 },
      { label: "موارد", value: summary.totalArtifacts || 0 },
      { label: "پیشرفت", value: (summary.completionRate || 0) + "%" }
    ].map(function (item) {
      return "<div class='card-item'><div class='value'>" + esc(item.value) + "</div><div class='label'>" + esc(item.label) + "</div></div>";
    }).join("");
  }

  function renderPathLists(data) {
    el("pathGoals").innerHTML = asArray(data.goals).map(function (goal) {
      var typeLabels = { "academic": "تحصیلی", "career": "شغلی", "project": "پروژه", "application": "درخواست" };
      var typeLabel = typeLabels[goal.type] || goal.type;
      var endDate = goal.deadline ? " | سررسید: " + toDateLabel(goal.deadline) : "";
      return (
        "<div class='list-item'>" +
        "<div class='list-title'>" + esc(goal.title) + " " + statusPill(goal.status) + "</div>" +
        "<div class='list-meta'>نوع: " + esc(typeLabel) + " | پیشرفت: " + Number(goal.progress_percent || 0) + "%" + endDate + "</div>" +
        "<div class='list-actions'>" +
        "<button class='btn ghost path-goal-detail' data-id='" + goal.id + "'>جزئیات</button>" +
        "<button class='btn danger path-goal-delete' data-id='" + goal.id + "'>حذف</button>" +
        "</div>" +
        "</div>"
      );
    }).join("") || "<div class='list-item'>هدفی یافت نشد.</div>";

    el("pathTasks").innerHTML = asArray(data.tasks).map(function (task) {
      var typeLabels = { "study": "مطالعه", "practice": "تمرین", "project": "پروژه", "apply": "درخواست", "interview": "مصاحبه" };
      var dueDate = task.due_date ? " | موعد: " + toDateLabel(task.due_date) : "";
      return (
        "<div class='list-item'>" +
        "<div class='list-title'>" + esc(task.title) + " " + statusPill(task.status) + "</div>" +
        "<div class='list-meta'>نوع: " + esc(typeLabels[task.type] || task.type) + dueDate + "</div>" +
        "<div class='list-actions'>" +
        "<button class='btn ghost path-task-status' data-id='" + task.id + "' data-status='doing'>شروع</button>" +
        "<button class='btn path-task-status' data-id='" + task.id + "' data-status='done'>انجام شد</button>" +
        "<button class='btn danger path-task-delete' data-id='" + task.id + "'>حذف</button>" +
        "</div>" +
        "</div>"
      );
    }).join("") || "<div class='list-item'>تسكی یافت نشد.</div>";

    el("pathArtifacts").innerHTML = asArray(data.artifacts).map(function (artifact) {
      var link = artifact.url ? "<a class='btn ghost' href='" + esc(artifact.url) + "' target='_blank'>باز</a>" : "";
      var typeLabels = { "github": "GitHub", "demo": "نمایش", "file": "فایل", "certificate": "مدرک", "resume_bullet": "رزومه" };
      return (
        "<div class='list-item'>" +
        "<div class='list-title'>" + esc(artifact.title) + " " + statusPill(typeLabels[artifact.type] || artifact.type) + "</div>" +
        "<div class='list-meta'>تاریخ ایجاد: " + toDateLabel(artifact.created_at) + "</div>" +
        "<div class='list-actions'>" + link +
        "<button class='btn ghost path-artifact-delete' data-id='" + artifact.id + "'>حذف</button>" +
        "</div>" +
        "</div>"
      );
    }).join("") || "<div class='list-item'>موردی یافت نشد.</div>";
  }

  async function deletePathGoal(goalId) {
    if (!confirm("آیا از حذف این هدف مطمئن هستید؟")) return;
    var userId = ensureUser();
    await api("/api/miniapp/my-path/goals/" + goalId, { method: "DELETE", body: { userId: userId } });
    toast("هدف حذف شد", "ok");
    loadPath().catch(onError);
  }

  async function deletePathTask(taskId) {
    if (!confirm("آیا از حذف این تسک مطمئن هستید؟")) return;
    var userId = ensureUser();
    await api("/api/miniapp/my-path/tasks/" + taskId, { method: "DELETE", body: { userId: userId } });
    toast("تسک حذف شد", "ok");
    loadPath().catch(onError);
  }

  async function deletePathArtifact(artifactId) {
    if (!confirm("آیا از حذف این مورد مطمئن هستید؟")) return;
    var userId = ensureUser();
    await api("/api/miniapp/my-path/artifacts/" + artifactId, { method: "DELETE", body: { userId: userId } });
    toast("مورد حذف شد", "ok");
    loadPath().catch(onError);
  }

  async function showPathGoalDetail(goalId) {
    var goal = state.path.goals.find(function (g) { return g.id === goalId; });
    if (!goal) {
      toast("هدف یافت نشد", "bad");
      return;
    }
    
    var typeLabels = { "academic": "تحصیلی", "career": "شغلی", "project": "پروژه", "application": "درخواست" };
    var details = "عنوان: " + goal.title + "\n" +
                  "نوع: " + typeLabels[goal.type] + "\n" +
                  "وضعیت: " + (STATUS_LABELS[goal.status] || goal.status) + "\n" +
                  "پیشرفت: " + goal.progress_percent + "%\n" +
                  "تاریخ شروع: " + toDateLabel(goal.created_at) + "\n" +
                  (goal.deadline ? "تاریخ سررسید: " + toDateLabel(goal.deadline) : "") + "\n\n" +
                  "توضیح: " + (goal.description || "توضیحی وجود ندارد");
    
    window.alert(details);
  }

  async function loadSupportTickets() {
    var userId = ensureUser();
    var status = el("supportStatusFilter").value || "";
    var query = "/api/support/my/" + userId + "/tickets?limit=50";
    if (status) query += "&status=" + encodeURIComponent(status);
    var data = await api(query);

    el("supportList").innerHTML =
      asArray(data.items)
        .map(function (ticket) {
          var daysOld = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60 * 24));
          var timeLabel = daysOld === 0 ? "امروز" : (daysOld === 1 ? "دیروز" : daysOld + " روز پیش");
          return (
            "<div class='list-item'>" +
            "<div class='list-title'>#" + Number(ticket.id) + " " + esc(ticket.subject || "-") + " " + statusPill(ticket.status || "-") + "</div>" +
            "<div class='list-meta'>اولویت: " + (ticket.priority || "عام") + " | " + timeLabel + "</div>" +
            "<div class='list-meta'>" + esc(ticket.last_message || "-") + "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn ghost support-detail' data-id='" + ticket.id + "'>جزئیات / پاسخ</button>" +
            (ticket.status !== "closed" ? "<button class='btn danger support-close' data-id='" + ticket.id + "'>بستن</button>" : "") +
            "</div>" +
            "</div>"
          );
        })
        .join("") || "<div class='list-item'>تیکی یافت نشد.</div>";
  }

  async function closeSupportTicket(ticketId) {
    var userId = ensureUser();
    await api("/api/support/my/" + userId + "/tickets/" + ticketId + "/close", { method: "POST", body: {} });
    toast("تیکت بسته شد", "ok");
    loadSupportTickets().catch(onError);
  }

  async function loadMySubmissions() {
    var userId = ensureUser();
    var data = await api("/api/miniapp/submissions/" + userId + "?limit=30");

    el("submissionList").innerHTML =
      asArray(data.items)
        .map(function (item) {
          return "<div class='list-item'><div class='list-title'>" + esc(item.title || "-") + " " + statusPill(item.status || "-") + "</div><div class='list-meta'>" + esc(item.moderation_reason || "در انتظر بررسی") + "</div></div>";
        })
        .join("") || "<div class='list-item'>آپلودی یافت نشد.</div>";
  }

  function renderAdminCards(overview) {
    var rows = [
      { label: "کل کاربران", value: overview.total_users || 0 },
      { label: "کاربران ربات", value: overview.bot_started_users || 0 },
      { label: "تیکت باز پشتیبانی", value: overview.open_support_tickets || 0 },
      { label: "آپلود در انتظار", value: overview.pending_submissions || 0 },
      { label: "اعله‌نامه باز", value: overview.open_admin_notifications || 0 }
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
          var userName = ticket.full_name || ("کاربر #" + Number(ticket.user_id || 0));
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
            "'>جزئیات</button>" +
            "<button class='btn admin-ticket-reply' data-id='" +
            ticket.id +
            "'>پاسخ</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>تیکی یافت نشد.</div>";
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
            esc((item.full_name || ("کاربر #" + Number(item.user_id || 0))) + " | " + (item.section || "-") + " / " + (item.content_kind || "-")) +
            "</div>" +
            "<div class='list-actions'>" +
            "<button class='btn admin-sub-approve' data-id='" +
            item.id +
            "'>تایید</button>" +
            "<button class='btn danger admin-sub-reject' data-id='" +
            item.id +
            "'>رد</button>" +
            "</div></div>"
          );
        })
        .join("") || "<div class='list-item'>آپلودی یافت نشد.</div>";
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
    var message = window.prompt("متن پاسخ:", "");
    if (!message || !message.trim()) return;
    await api("/api/miniapp/admin/support/tickets/" + ticketId + "/reply?" + adminAuthQuery(), {
      method: "POST",
      body: { message: message.trim(), status: "answered" }
    });
    toast("پاسخ پشتیبانی ارسال شد", "ok");
    await loadAdminSupportTickets();
  }

  async function adminReviewSubmission(submissionId, action) {
    ensureAdmin();
    var reason = null;
    if (action === "reject") {
      reason = window.prompt("دلیل رد:", "");
      if (reason === null) return;
      reason = String(reason || "").trim() || "رد شده بوسیله بررسی ادمین";
    }
    await api("/api/miniapp/admin/moderation/submissions/" + submissionId + "/review?" + adminAuthQuery(), {
      method: "POST",
      body: { action: action, reason: reason }
    });
    toast(action === "approve" ? "آپلود تایید شد" : "آپلود رد شد", "ok");
    await loadAdminSubmissions();
  }

  async function adminRunBroadcast() {
    ensureAdmin();
    var message = String((el("adminBroadcastMessage") || {}).value || "").trim();
    if (!message) throw new Error("پیام الزامی است.");
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
      toast("اجرای آزمایشی موفق: " + Number(result.totalRecipients || 0) + " کاربر", "warn");
      return;
    }
    toast(
      "پیام ارسال شد: " +
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
      var role = String(m.sender_role || "") === "admin" ? "ادمین" : "کاربر";
      return "[" + role + "] " + (m.message_text || "");
    }).join("\n\n");

    var reply = window.prompt("پاسخ به تیکت #" + ticketId + ":", "");
    if (reply && reply.trim()) {
      await api("/api/support/my/" + userId + "/tickets/" + ticketId + "/reply", {
        method: "POST",
        body: { message: reply.trim() }
      });
      toast("پاسخ ارسال شد", "ok");
      await loadSupportTickets();
      return;
    }

    window.alert(textLog || "هیچ پیامی وجود ندارد.");
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
    el("indLoadSavedBtn").addEventListener("click", function () { loadIndustrySavedOpportunities().catch(onError); });
    el("indLoadResourcesBtn").addEventListener("click", function () { loadIndustryResources().catch(onError); });

    el("resPrevBtn").addEventListener("click", function () {
      state.industry.resourcePage = Math.max(0, state.industry.resourcePage - 1);
      renderIndustryResources();
    });
    el("resNextBtn").addEventListener("click", function () {
      var totalPages = Math.max(1, Math.ceil(state.industry.resources.length / 5));
      state.industry.resourcePage = Math.min(totalPages - 1, state.industry.resourcePage + 1);
      renderIndustryResources();
    });

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
      var uniRequestDownloadBtn = event.target.closest(".uni-request-download");
      var applyBtn = event.target.closest(".ind-apply");
      var saveBtn = event.target.closest(".ind-save");
      var startBtn = event.target.closest(".ind-start-project");
      var progressBtn = event.target.closest(".ind-progress");
      var linkBtn = event.target.closest(".ind-link");
      var supportDetailBtn = event.target.closest(".support-detail");
      var supportCloseBtn = event.target.closest(".support-close");
      var pathTaskStatusBtn = event.target.closest(".path-task-status");
      var pathGoalDetailBtn = event.target.closest(".path-goal-detail");
      var pathGoalDeleteBtn = event.target.closest(".path-goal-delete");
      var pathTaskDeleteBtn = event.target.closest(".path-task-delete");
      var pathArtifactDeleteBtn = event.target.closest(".path-artifact-delete");
      var adminTicketDetailBtn = event.target.closest(".admin-ticket-detail");
      var adminTicketReplyBtn = event.target.closest(".admin-ticket-reply");
      var adminSubApproveBtn = event.target.closest(".admin-sub-approve");
      var adminSubRejectBtn = event.target.closest(".admin-sub-reject");
      var workspaceDetailBtn = event.target.closest(".ind-workspace-detail");
      var savedApplyBtn = event.target.closest(".ind-saved-apply");
      var unsaveBtn = event.target.closest(".ind-unsave");
      var savedDetailBtn = event.target.closest(".ind-saved-detail");
      var resourceDetailBtn = event.target.closest(".ind-resource-detail");

      if (uniRequestDownloadBtn) {
        api("/api/miniapp/university/request-download", {
          method: "POST",
          body: {
            userId: ensureUser(),
            contentId: Number(uniRequestDownloadBtn.dataset.id)
          }
        })
          .then(function () {
            toast("File sent to your Telegram chat", "ok");
          })
          .catch(onError);
      }

      if (applyBtn) {
        api("/api/industry/student/opportunities/" + Number(applyBtn.dataset.id) + "/apply", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("درخواست ارسال شد", "ok"); loadIndustryApplications().catch(onError); })
          .catch(onError);
      }

      if (saveBtn) {
        api("/api/industry/student/opportunities/" + Number(saveBtn.dataset.id) + "/save", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("فرصتی ذخیره شد", "ok"); })
          .catch(onError);
      }

      if (startBtn) {
        api("/api/industry/student/projects/" + Number(startBtn.dataset.id) + "/start", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("پروژه شروع شد", "ok"); loadIndustryWorkspace().catch(onError); })
          .catch(onError);
      }

      if (progressBtn) {
        var nextProgress = Number(window.prompt("راه رفته را وارد کنید (0-100):", "30"));
        if (!Number.isFinite(nextProgress)) return;
        nextProgress = Math.max(0, Math.min(100, Math.floor(nextProgress)));
        api("/api/industry/student/student-projects/" + Number(progressBtn.dataset.id), {
          method: "PATCH",
          body: { progress: nextProgress, status: nextProgress >= 100 ? "completed" : "in_progress" }
        }).then(function () { toast("پیشرفت ذخیره شد", "ok"); loadIndustryWorkspace().catch(onError); }).catch(onError);
      }

      if (linkBtn) {
        var link = window.prompt("آدرس خروجی:", "");
        if (!link) return;
        api("/api/industry/student/student-projects/" + Number(linkBtn.dataset.id), { method: "PATCH", body: { outputLinks: [link] } })
          .then(function () { toast("لینک افزوده شد", "ok"); loadIndustryWorkspace().catch(onError); })
          .catch(onError);
      }

      if (supportDetailBtn) showSupportDetail(Number(supportDetailBtn.dataset.id)).catch(onError);
      if (supportCloseBtn) closeSupportTicket(Number(supportCloseBtn.dataset.id)).catch(onError);

      if (pathTaskStatusBtn) {
        api("/api/miniapp/my-path/tasks/" + Number(pathTaskStatusBtn.dataset.id), {
          method: "PATCH",
          body: { userId: ensureUser(), status: pathTaskStatusBtn.dataset.status }
        }).then(function () { toast("تسک به روز شد", "ok"); loadPath().catch(onError); }).catch(onError);
      }

      if (pathGoalDetailBtn) showPathGoalDetail(Number(pathGoalDetailBtn.dataset.id)).catch(onError);
      if (pathGoalDeleteBtn) deletePathGoal(Number(pathGoalDeleteBtn.dataset.id)).catch(onError);
      if (pathTaskDeleteBtn) deletePathTask(Number(pathTaskDeleteBtn.dataset.id)).catch(onError);
      if (pathArtifactDeleteBtn) deletePathArtifact(Number(pathArtifactDeleteBtn.dataset.id)).catch(onError);

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

      if (workspaceDetailBtn) {
        showWorkspaceDetail(Number(workspaceDetailBtn.dataset.id)).catch(onError);
      }

      if (savedApplyBtn) {
        api("/api/industry/student/opportunities/" + Number(savedApplyBtn.dataset.id) + "/apply", { method: "POST", body: { userId: ensureUser() } })
          .then(function () { toast("درخواست ارسال شد", "ok"); loadIndustryApplications().catch(onError); })
          .catch(onError);
      }

      if (unsaveBtn) {
        api("/api/industry/student/saved-opportunities/" + Number(unsaveBtn.dataset.id), { method: "DELETE", body: { userId: ensureUser() } })
          .then(function () { toast("فرصت حذف شد", "ok"); loadIndustrySavedOpportunities().catch(onError); })
          .catch(onError);
      }

      if (savedDetailBtn) {
        var item = state.industry.savedOpportunities.find(function (i) { return i.id === Number(savedDetailBtn.dataset.id); });
        if (item) {
          window.alert("عنوان: " + item.title + "\nشرکت: " + item.company_name + "\nسطح: " + item.level + "\nمطابقت: " + item.matchScore);
        }
      }

      if (resourceDetailBtn) {
        var res = state.industry.resources.find(function (r) { return r.id === Number(resourceDetailBtn.dataset.id); });
        if (res) {
          window.alert("عنوان: " + res.title + "\nدسته‌بندی: " + res.category + "\nتوضیح: " + res.description);
        }
      }
    });
  }

  function buildForms() {
    el("industryProfileForm").innerHTML = "";

    el("pathGoalForm").innerHTML = [
      "<select id='goalType'><option value='academic'>تحصیلی</option><option value='career'>شغلی</option><option value='project'>پروژه</option><option value='application'>درخواست</option></select>",
      "<input id='goalTitle' placeholder='عنوان هدف' />",
      "<input id='goalDeadline' type='date' />",
      "<textarea id='goalDescription' placeholder='توضیح (اختیاری)' style='min-height: 60px;'></textarea>",
      "<button id='goalAddBtn' class='btn' type='button'>افزودن هدف</button>"
    ].join("");

    el("pathTaskForm").innerHTML = [
      "<select id='taskType'><option value='study'>مطالعه</option><option value='practice'>تمرین</option><option value='project'>پروژه</option><option value='apply'>درخواست</option><option value='interview'>مصاحبه</option></select>",
      "<input id='taskTitle' placeholder='عنوان تسك' />",
      "<input id='taskDueDate' type='date' />",
      "<input id='taskGoalId' placeholder='شناسه هدف (اختیاری)' />",
      "<button id='taskAddBtn' class='btn' type='button'>افزودن تسك</button>"
    ].join("");

    el("pathArtifactForm").innerHTML = [
      "<select id='artifactType'><option value='github'>GitHub</option><option value='demo'>نمایش</option><option value='file'>فایل</option><option value='certificate'>مدرک</option><option value='resume_bullet'>رزومه</option></select>",
      "<input id='artifactTitle' placeholder='عنوان مورد' />",
      "<input id='artifactUrl' placeholder='https://...' />",
      "<button id='artifactAddBtn' class='btn' type='button'>افزودن مورد</button>"
    ].join("");

    el("supportCreateForm").innerHTML = [
      field("موضوع تیکت", "supportSubject", "", "text"),
      "<div class='form-row'><label for='supportPriority' style='text-align: right;'>اولویت</label><select id='supportPriority'><option value='low'>نمل</option><option value='normal'>عام</option><option value='high'>بالا</option><option value='urgent'>فوری</option></select></div>",
      "<div class='form-row'><label for='supportMessage' style='text-align: right;'>پیام</label><textarea id='supportMessage' style='direction: rtl; text-align: right; min-height: 80px;'></textarea></div>",
      "<button id='supportCreateBtn' class='btn' type='button'>ثبت تیکت</button>"
    ].join("");

    el("submissionForm").innerHTML = [
      "<div class='form-row'><label for='subKind' style='text-align: right;'>نوع محتوا</label><select id='subKind'><option value='note'>جزوه</option><option value='book'>کتاب</option><option value='resource'>منبع</option><option value='video'>ویدیو</option><option value='summary'>خلاصه</option><option value='sample-question'>نمونه پرسش</option><option value='exam-tip'>راهنمایی امتحان</option><option value='course'>درس</option><option value='professor'>استاد</option></select></div>",
      field("نام درس", "subCourseName", ""),
      field("نام استاد", "subProfessorName", ""),
      field("عنوان", "subTitle", ""),
      field("مقصد", "subPurpose", ""),
      field("برچسب‌ها", "subTags", ""),
      "<div class='form-row'><label for='subFile' style='text-align: right;'>فایل PDF (اختیاری)</label><input id='subFile' type='file' accept='application/pdf' /></div>",
      "<button id='submissionSendBtn' class='btn' type='button'>ارسال برای بررسی</button>"
    ].join("");

    el("supportStatusFilter").innerHTML = [
      "<option value=''>همه</option>",
      "<option value='open'>باز</option>",
      "<option value='pending'>در انتظار</option>",
      "<option value='answered'>پاسخ داده شده</option>",
      "<option value='closed'>بسته</option>"
    ].join("");

    el("resCategory").innerHTML = [
      "<option value=''>همه</option>",
      "<option value='tutorial'>آموزش</option>",
      "<option value='tool'>ابزار</option>",
      "<option value='library'>کتابخانه</option>",
      "<option value='course'>دوره</option>",
      "<option value='article'>مقاله</option>"
    ].join("");

    el("goalAddBtn").addEventListener("click", function () {
      var userId = ensureUser();
      var deadline = el("goalDeadline").value || null;
      api("/api/miniapp/my-path/goals", {
        method: "POST",
        body: {
          userId: userId,
          type: el("goalType").value,
          title: el("goalTitle").value,
          deadline: deadline,
          description: el("goalDescription").value || null
        }
      })
        .then(function () {
          toast("هدف افزوده شد", "ok");
          el("goalTitle").value = "";
          el("goalDeadline").value = "";
          el("goalDescription").value = "";
          loadPath().catch(onError);
        })
        .catch(onError);
    });

    el("taskAddBtn").addEventListener("click", function () {
      var userId = ensureUser();
      var dueDate = el("taskDueDate").value || null;
      api("/api/miniapp/my-path/tasks", {
        method: "POST",
        body: {
          userId: userId,
          type: el("taskType").value,
          title: el("taskTitle").value,
          dueDate: dueDate,
          goalId: el("taskGoalId").value || null
        }
      })
        .then(function () {
          toast("تسك افزوده شد", "ok");
          el("taskTitle").value = "";
          el("taskDueDate").value = "";
          el("taskGoalId").value = "";
          loadPath().catch(onError);
        })
        .catch(onError);
    });

    el("artifactAddBtn").addEventListener("click", function () {
      api("/api/miniapp/my-path/artifacts", {
        method: "POST",
        body: {
          userId: ensureUser(),
          type: el("artifactType").value,
          title: el("artifactTitle").value,
          url: el("artifactUrl").value || null
        }
      })
        .then(function () {
          toast("مورد افزوده شد", "ok");
          el("artifactTitle").value = "";
          el("artifactUrl").value = "";
          loadPath().catch(onError);
        })
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
      })
        .then(function () {
          toast("تیکت ایجاد شد", "ok");
          el("supportSubject").value = "";
          el("supportMessage").value = "";
          loadSupportTickets().catch(onError);
        })
        .catch(onError);
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
          toast("آپلود برای بررسی ارسال شد", "ok");
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

  function normalizeUsername(value) {
    return String(value || "").trim().replace(/^@/, "");
  }

  function parseFallbackUserFromQuery() {
    var params = new URLSearchParams(window.location.search || "");
    var id = String(params.get("telegramId") || params.get("tgid") || params.get("uid") || "").trim();
    if (!id) return null;
    return {
      id: id,
      username: normalizeUsername(params.get("username") || params.get("user") || ""),
      first_name: String(params.get("firstName") || "").trim(),
      last_name: String(params.get("lastName") || "").trim()
    };
  }

  function loadStoredFallbackUser() {
    try {
      var raw = window.localStorage.getItem("fanjobo_miniapp_user");
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.id) return null;
      return {
        id: String(parsed.id),
        username: normalizeUsername(parsed.username || ""),
        first_name: String(parsed.first_name || ""),
        last_name: String(parsed.last_name || "")
      };
    } catch (_error) {
      return null;
    }
  }

  function saveStoredFallbackUser(user) {
    try {
      if (!user || !user.id) return;
      window.localStorage.setItem(
        "fanjobo_miniapp_user",
        JSON.stringify({
          id: String(user.id),
          username: normalizeUsername(user.username || ""),
          first_name: String(user.first_name || ""),
          last_name: String(user.last_name || "")
        })
      );
    } catch (_error) {}
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
    if (!tgUser || !tgUser.id) {
      tgUser = parseFallbackUserFromQuery() || loadStoredFallbackUser();
    }

    if (!tgUser || !tgUser.id) {
      var typedId = window.prompt(
        "Open outside Telegram: enter telegramId to continue:",
        ""
      );
      if (!typedId || !String(typedId).trim()) {
        throw new Error("Open this mini app from Telegram, or pass telegramId in URL.");
      }

      var typedUsername = window.prompt("Telegram username (optional):", "") || "";
      tgUser = {
        id: String(typedId).trim(),
        username: normalizeUsername(typedUsername),
        first_name: "",
        last_name: ""
      };
    }

    tgUser = {
      id: String(tgUser.id),
      username: normalizeUsername((tgUser || {}).username || ""),
      first_name: String((tgUser || {}).first_name || ""),
      last_name: String((tgUser || {}).last_name || "")
    };

    saveStoredFallbackUser(tgUser);
    state.tgUser = tgUser;
    state.isAdmin = Boolean(
      String((tgUser || {}).id || "") === "565136808" ||
      String((tgUser || {}).username || "").toLowerCase() === "immohammadf"
    );

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
    var userTag = tgUser.username ? "@" + tgUser.username : "tg:" + tgUser.id;
    el("miniUserLabel").textContent =
      userTag + " | \u06a9\u0627\u0631\u0628\u0631 #" + Number((state.user || {}).id || 0).toLocaleString();
  }

  async function boot() {
    try {
      await bootstrapSession();
      buildNav();
      buildForms();
      buildProfileForm();
      bindStaticActions();
      setTab("dashboard");
      toast("\u0645\u06cc\u0646\u06cc\u200c\u0627\u067e \u0622\u0645\u0627\u062f\u0647 \u0627\u0633\u062a", "ok");
    } catch (error) {
      onError(error);
      el("miniUserLabel").textContent = error.message || "\u0627\u062c\u0631\u0627\u06cc \u0645\u06cc\u0646\u06cc\u200c\u0627\u067e \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
