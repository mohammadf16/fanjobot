const express = require("express");
const { config } = require("../config");

const router = express.Router();

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

router.get("/admin", (req, res) => {
  const defaultAdminId = escapeAttr(config.adminUserId || "");

  res.type("html").send(`<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>پنل ادمین فنجوبو</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap");
    :root {
      --bg: #f4f7fb;
      --surface: #ffffff;
      --ink: #172033;
      --muted: #5f6f88;
      --line: #d9e1ee;
      --accent: #0a7a6c;
      --accent-2: #ff9f1c;
      --danger: #cc3344;
      --ok: #1a8f4a;
      --radius: 16px;
      --shadow: 0 18px 45px rgba(18, 39, 73, 0.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Vazirmatn", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 8%, rgba(10, 122, 108, 0.18), transparent 32%),
        radial-gradient(circle at 87% 2%, rgba(255, 159, 28, 0.2), transparent 35%),
        linear-gradient(150deg, #f6f9fe, #eef4fc 52%, #f9fbff);
      min-height: 100vh;
    }
    .shell {
      max-width: 1260px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 18px;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 16px;
    }
    .hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }
    .hero h1 {
      margin: 0;
      font-family: "Space Grotesk", "Vazirmatn", sans-serif;
      font-size: 1.5rem;
    }
    .hint { color: var(--muted); font-size: .92rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 14px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #ffffff, #f8fbff);
    }
    .stat-card { grid-column: span 2; min-height: 78px; }
    .stat-value { font-weight: 700; font-size: 1.3rem; }
    .stat-label { color: var(--muted); font-size: .84rem; }
    .section-title {
      margin: 0 0 10px;
      font-size: 1.06rem;
      font-weight: 700;
    }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .row > * { flex: 1; min-width: 160px; }
    .row .tight { flex: 0 0 auto; min-width: auto; }
    input, select, textarea, button {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 11px;
      padding: 10px 12px;
      font-family: inherit;
      font-size: .93rem;
      background: #fff;
    }
    textarea { min-height: 86px; resize: vertical; }
    button {
      cursor: pointer;
      font-weight: 700;
      border: none;
      transition: transform .15s ease, opacity .15s ease;
      color: #fff;
      background: linear-gradient(130deg, var(--accent), #0d8f7f);
    }
    button.warn { background: linear-gradient(130deg, var(--accent-2), #e88400); }
    button.danger { background: linear-gradient(130deg, var(--danger), #a82434); }
    button.ghost {
      color: var(--ink);
      background: #edf3fb;
      border: 1px solid var(--line);
    }
    button:active { transform: translateY(1px); }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 730px;
      font-size: .9rem;
    }
    th, td {
      text-align: right;
      border-bottom: 1px solid var(--line);
      padding: 10px;
      vertical-align: top;
    }
    th { background: #f5f9ff; color: #33425d; position: sticky; top: 0; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: .78rem;
      border: 1px solid transparent;
    }
    .badge.ok { color: #0c6d3a; border-color: #a6dfbd; background: #e8f8ee; }
    .badge.warn { color: #84510c; border-color: #ffd08f; background: #fff4e6; }
    .badge.off { color: #6f7d91; border-color: #d9e1ee; background: #f2f5fa; }
    .status {
      border-radius: 11px;
      border: 1px solid var(--line);
      padding: 10px 12px;
      font-size: .9rem;
      background: #f8fbff;
    }
    .status.error { color: #9f2330; border-color: #f2bac2; background: #fff2f4; }
    .split {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 14px;
    }
    .list {
      display: grid;
      gap: 8px;
      max-height: 270px;
      overflow: auto;
    }
    .list-item {
      border: 1px solid var(--line);
      border-radius: 11px;
      padding: 10px;
      background: #fff;
    }
    .small { font-size: .84rem; color: var(--muted); }
    .block { margin-top: 10px; }
    .hidden { display: none !important; }
    @media (max-width: 980px) {
      .stat-card { grid-column: span 4; }
      .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .shell { padding: 12px; }
      .stat-card { grid-column: span 6; }
      .row > * { min-width: 100%; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel hero">
      <div>
        <h1>پنل ادمین فنجوبو</h1>
        <div class="hint">مدیریت کامل کاربران، ثبت‌نام، پروفایل، نوتیف‌ها و صف بررسی محتوا</div>
      </div>
      <div class="hint">مسیر: <code>/admin</code></div>
    </section>

    <section class="panel" id="authPanel">
      <h2 class="section-title">ورود ادمین</h2>
      <div class="row">
        <input id="adminIdInput" placeholder="ADMIN_USER_ID" value="${defaultAdminId}" />
        <input id="adminKeyInput" placeholder="ADMIN_API_KEY" type="password" />
        <button id="loginBtn" class="tight">ورود به پنل</button>
      </div>
      <p class="small">درخواست‌ها با هدرهای <code>x-admin-key</code> و <code>x-admin-id</code> ارسال می‌شوند.</p>
    </section>

    <section class="status hidden" id="statusBox"></section>

    <section class="panel hidden" id="dashboardPanel">
      <div class="row">
        <h2 class="section-title tight">داشبورد</h2>
        <button id="refreshAllBtn" class="ghost tight">بازخوانی همه</button>
      </div>
      <div class="grid" id="statsGrid"></div>
    </section>

    <section class="panel hidden">
      <div class="row">
        <h2 class="section-title tight">کاربران</h2>
        <input id="userSearchInput" placeholder="جستجو (نام، ایمیل/شماره، تلگرام)" />
        <select id="userHasProfileInput">
          <option value="">همه</option>
          <option value="true">دارای پروفایل</option>
          <option value="false">بدون پروفایل</option>
        </select>
        <button id="loadUsersBtn" class="tight">جستجو</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>شناسه</th>
              <th>نام</th>
              <th>ارتباط</th>
              <th>تلگرام</th>
              <th>پروفایل</th>
              <th>رشته/ترم</th>
              <th>ثبت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody id="usersBody"></tbody>
        </table>
      </div>
      <p class="small" id="usersMeta"></p>
    </section>

    <section class="panel hidden split">
      <div>
        <h2 class="section-title">ثبت‌نام کاربر جدید</h2>
        <div class="row">
          <input id="newFullName" placeholder="نام کامل" />
          <input id="newPhoneOrEmail" placeholder="شماره یا ایمیل" />
          <input id="newTelegramId" placeholder="Telegram ID (اختیاری)" />
        </div>
        <div class="row block">
          <label class="tight"><input type="checkbox" id="newIncludeProfile" /> ثبت همزمان پروفایل</label>
        </div>
        <div id="newProfileFields" class="hidden">
          <div class="row block">
            <input id="newMajor" placeholder="رشته" />
            <input id="newLevel" placeholder="مقطع" />
            <input id="newTerm" placeholder="ترم" />
            <input id="newSkillLevel" placeholder="skillLevel: beginner/intermediate/advanced" />
          </div>
          <div class="row block">
            <input id="newShortGoal" placeholder="هدف کوتاه مدت" />
            <input id="newWeeklyHours" placeholder="ساعت هفتگی (عدد)" />
            <input id="newUniversity" placeholder="دانشگاه (اختیاری)" />
            <input id="newCity" placeholder="شهر (اختیاری)" />
          </div>
          <div class="row block">
            <input id="newInterests" placeholder="علاقه‌مندی‌ها: ai,web,backend" />
            <input id="newPassedCourses" placeholder="دروس پاس شده: CE101,MA201" />
            <input id="newSkills" placeholder="مهارت‌ها: node:8,sql:7" />
          </div>
        </div>
        <div class="row block">
          <button id="createUserBtn">ثبت کاربر</button>
        </div>
      </div>

      <div>
        <h2 class="section-title">ویرایش کاربر</h2>
        <div class="small" id="editUserHint">یک کاربر از جدول انتخاب کن.</div>
        <div class="row block">
          <input id="editUserId" placeholder="User ID" readonly />
          <input id="editFullName" placeholder="نام کامل" />
          <input id="editPhoneOrEmail" placeholder="شماره یا ایمیل" />
          <input id="editTelegramId" placeholder="Telegram ID" />
        </div>
        <div class="row block">
          <label class="tight"><input type="checkbox" id="editIncludeProfile" /> به‌روزرسانی پروفایل</label>
        </div>
        <div id="editProfileFields" class="hidden">
          <div class="row block">
            <input id="editMajor" placeholder="رشته" />
            <input id="editLevel" placeholder="مقطع" />
            <input id="editTerm" placeholder="ترم" />
            <input id="editSkillLevel" placeholder="skillLevel" />
          </div>
          <div class="row block">
            <input id="editShortGoal" placeholder="هدف کوتاه مدت" />
            <input id="editWeeklyHours" placeholder="ساعت هفتگی" />
            <input id="editUniversity" placeholder="دانشگاه" />
            <input id="editCity" placeholder="شهر" />
          </div>
          <div class="row block">
            <input id="editInterests" placeholder="interests: ai,web" />
            <input id="editPassedCourses" placeholder="passed courses: CE101,MA201" />
            <input id="editSkills" placeholder="skills: node:8,sql:7" />
          </div>
        </div>
        <div class="row block">
          <button id="updateUserBtn">ذخیره تغییرات</button>
          <button id="deleteUserBtn" class="danger">حذف کاربر</button>
        </div>
      </div>
    </section>

    <section class="panel hidden split">
      <div>
        <h2 class="section-title">نوتیف‌های ادمین</h2>
        <div class="row">
          <button id="loadNotificationsBtn" class="ghost tight">بازخوانی</button>
        </div>
        <div class="list block" id="notificationsList"></div>
      </div>
      <div>
        <h2 class="section-title">صف بررسی محتوا</h2>
        <div class="row">
          <button id="loadSubmissionsBtn" class="ghost tight">بازخوانی</button>
        </div>
        <div class="list block" id="submissionsList"></div>
      </div>
    </section>
  </main>

  <script>
    const state = {
      adminKey: localStorage.getItem("adminKey") || "",
      adminId: localStorage.getItem("adminId") || "${defaultAdminId}",
      users: []
    };

    const el = (id) => document.getElementById(id);

    const statusBox = el("statusBox");
    const dashboardPanel = el("dashboardPanel");
    const securePanels = Array.from(document.querySelectorAll(".panel.hidden")).filter((item) => item.id !== "authPanel");

    function showStatus(message, isError = false) {
      statusBox.textContent = message;
      statusBox.classList.remove("hidden", "error");
      if (isError) statusBox.classList.add("error");
      clearTimeout(showStatus.timer);
      showStatus.timer = setTimeout(() => statusBox.classList.add("hidden"), 4800);
    }

    function esc(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function csvToArray(text) {
      return String(text || "")
        .split(/[,،]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    function skillTextToArray(text) {
      return csvToArray(text).map((pair) => {
        const [name, scoreRaw] = pair.split(":").map((x) => x.trim());
        const score = Number(scoreRaw);
        return { name, score: Number.isFinite(score) ? score : 5 };
      }).filter((item) => item.name);
    }

    function arrayToCsv(value) {
      if (!Array.isArray(value)) return "";
      return value.join(", ");
    }

    function skillsToText(value) {
      if (!Array.isArray(value)) return "";
      return value.map((item) => {
        if (!item || typeof item !== "object") return "";
        return item.name ? \`\${item.name}:\${item.score ?? 5}\` : "";
      }).filter(Boolean).join(", ");
    }

    async function api(path, options = {}) {
      const headers = {
        "content-type": "application/json",
        "x-admin-key": state.adminKey,
        "x-admin-id": state.adminId
      };

      const response = await fetch(path, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || \`Request failed: \${response.status}\`);
      }
      return data;
    }

    function profilePayload(prefix) {
      const major = el(prefix + "Major").value.trim();
      const level = el(prefix + "Level").value.trim();
      const term = el(prefix + "Term").value.trim();
      const skillLevel = el(prefix + "SkillLevel").value.trim();
      const shortTermGoal = el(prefix + "ShortGoal").value.trim();
      const weeklyHours = Number(el(prefix + "WeeklyHours").value);

      return {
        major,
        level,
        term,
        skillLevel,
        shortTermGoal,
        weeklyHours,
        university: el(prefix + "University").value.trim(),
        city: el(prefix + "City").value.trim(),
        interests: csvToArray(el(prefix + "Interests").value),
        passedCourses: csvToArray(el(prefix + "PassedCourses").value),
        skills: skillTextToArray(el(prefix + "Skills").value)
      };
    }

    async function loadOverview() {
      const data = await api("/api/admin/dashboard/overview");
      const stats = data.overview || {};
      const labels = [
        ["total_users", "کل کاربران"],
        ["total_profiles", "پروفایل‌ها"],
        ["total_contents", "کل محتوا"],
        ["published_contents", "محتوای منتشر شده"],
        ["total_opportunities", "فرصت‌های صنعتی"],
        ["pending_opportunities", "فرصت‌های در انتظار تایید"],
        ["total_projects", "پروژه‌های صنعتی"],
        ["total_applications", "درخواست‌های شغلی"],
        ["total_submissions", "ارسال‌های انجمن"],
        ["pending_submissions", "ارسال‌های در انتظار"],
        ["open_notifications", "نوتیف‌های باز"]
      ];

      el("statsGrid").innerHTML = labels.map(([key, label]) => \`
        <article class="card stat-card">
          <div class="stat-value">\${Number(stats[key] || 0).toLocaleString("fa-IR")}</div>
          <div class="stat-label">\${label}</div>
        </article>
      \`).join("");
    }

    async function loadUsers() {
      const q = el("userSearchInput").value.trim();
      const hasProfile = el("userHasProfileInput").value;
      const query = new URLSearchParams({ limit: "120" });
      if (q) query.set("q", q);
      if (hasProfile) query.set("hasProfile", hasProfile);

      const data = await api("/api/admin/users?" + query.toString());
      state.users = data.items || [];

      el("usersBody").innerHTML = state.users.map((user) => \`
        <tr>
          <td>\${user.id}</td>
          <td>\${esc(user.full_name)}</td>
          <td>\${esc(user.phone_or_email)}</td>
          <td>\${esc(user.telegram_id || "-")}</td>
          <td>\${user.has_profile ? '<span class="badge ok">دارد</span>' : '<span class="badge off">ندارد</span>'}</td>
          <td>\${esc(user.major || "-")} / \${esc(user.term || "-")}</td>
          <td>\${esc(user.created_at)}</td>
          <td><button class="ghost user-select" data-id="\${user.id}">انتخاب</button></td>
        </tr>
      \`).join("") || "<tr><td colspan='8'>کاربری پیدا نشد.</td></tr>";

      el("usersMeta").textContent = \`تعداد: \${Number(data.total || 0).toLocaleString("fa-IR")} | نمایش: \${state.users.length}\`;

      document.querySelectorAll(".user-select").forEach((btn) => {
        btn.addEventListener("click", () => loadUserDetail(btn.dataset.id));
      });
    }

    function fillEditForm(data) {
      const user = data.user || {};
      el("editUserId").value = user.user_id || "";
      el("editFullName").value = user.full_name || "";
      el("editPhoneOrEmail").value = user.phone_or_email || "";
      el("editTelegramId").value = user.telegram_id || "";
      el("editMajor").value = user.major || "";
      el("editLevel").value = user.level || "";
      el("editTerm").value = user.term || "";
      el("editSkillLevel").value = user.skill_level || "";
      el("editShortGoal").value = user.short_term_goal || "";
      el("editWeeklyHours").value = user.weekly_hours || "";
      el("editUniversity").value = user.university || "";
      el("editCity").value = user.city || "";
      el("editInterests").value = arrayToCsv(user.interests);
      el("editPassedCourses").value = arrayToCsv(user.passed_courses);
      el("editSkills").value = skillsToText(user.skills);

      const apps = data.activity?.applications?.length || 0;
      const projects = data.activity?.studentProjects?.length || 0;
      const events = data.activity?.events?.length || 0;
      const submissions = data.activity?.submissions?.length || 0;
      el("editUserHint").textContent = \`کاربر #\${user.user_id} | اپلیکیشن: \${apps} | پروژه دانشجویی: \${projects} | رخداد: \${events} | ارسال انجمن: \${submissions}\`;
    }

    async function loadUserDetail(userId) {
      const data = await api("/api/admin/users/" + userId);
      fillEditForm(data);
      showStatus("جزئیات کاربر بارگذاری شد.");
    }

    async function createUser() {
      const payload = {
        fullName: el("newFullName").value.trim(),
        phoneOrEmail: el("newPhoneOrEmail").value.trim(),
        telegramId: el("newTelegramId").value.trim() || null
      };

      if (el("newIncludeProfile").checked) {
        payload.profile = profilePayload("new");
      }

      const data = await api("/api/admin/users/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showStatus(\`کاربر جدید ثبت شد. شناسه: \${data.user?.id}\`);
      await Promise.all([loadOverview(), loadUsers()]);
    }

    async function updateUser() {
      const userId = el("editUserId").value;
      if (!userId) {
        showStatus("ابتدا یک کاربر را انتخاب کن.", true);
        return;
      }

      const payload = {
        fullName: el("editFullName").value.trim(),
        phoneOrEmail: el("editPhoneOrEmail").value.trim(),
        telegramId: el("editTelegramId").value.trim() || null
      };

      if (el("editIncludeProfile").checked) {
        payload.profile = profilePayload("edit");
      }

      await api("/api/admin/users/" + userId, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      showStatus("اطلاعات کاربر ذخیره شد.");
      await Promise.all([loadOverview(), loadUsers(), loadUserDetail(userId)]);
    }

    async function deleteUser() {
      const userId = el("editUserId").value;
      if (!userId) return showStatus("کاربری برای حذف انتخاب نشده.", true);
      if (!confirm("حذف کاربر انجام شود؟")) return;

      await api("/api/admin/users/" + userId, { method: "DELETE" });
      showStatus("کاربر حذف شد.");

      el("editUserId").value = "";
      el("editUserHint").textContent = "یک کاربر از جدول انتخاب کن.";
      await Promise.all([loadOverview(), loadUsers()]);
    }

    async function loadNotifications() {
      const data = await api("/api/admin/notifications?status=open&limit=40");
      el("notificationsList").innerHTML = (data.items || []).map((item) => \`
        <article class="list-item">
          <div class="row">
            <strong>\${esc(item.title || item.type || "Notification")}</strong>
            <span class="badge \${item.status === "open" ? "warn" : "ok"} tight">\${esc(item.status || "open")}</span>
          </div>
          <div class="small">\${esc(item.message || "-")}</div>
          <div class="small">#\${item.id} | \${esc(item.created_at || "")}</div>
        </article>
      \`).join("") || "<div class='small'>نوتیف باز وجود ندارد.</div>";
    }

    async function loadSubmissions() {
      const data = await api("/api/admin/moderation/submissions?status=pending&limit=40");
      el("submissionsList").innerHTML = (data.items || []).map((item) => \`
        <article class="list-item">
          <div class="row">
            <strong>\${esc(item.title || "-")}</strong>
            <span class="badge warn tight">\${esc(item.status || "pending")}</span>
          </div>
          <div class="small">\${esc(item.section || "-")} / \${esc(item.content_kind || "-")}</div>
          <div class="small">کاربر: #\${esc(item.user_id)} | \${esc(item.created_at || "")}</div>
        </article>
      \`).join("") || "<div class='small'>در حال حاضر موردی در صف بررسی نیست.</div>";
    }

    async function loadAll() {
      await Promise.all([loadOverview(), loadUsers(), loadNotifications(), loadSubmissions()]);
    }

    async function login() {
      state.adminId = el("adminIdInput").value.trim();
      state.adminKey = el("adminKeyInput").value.trim();
      if (!state.adminKey) {
        showStatus("ADMIN_API_KEY را وارد کن.", true);
        return;
      }

      localStorage.setItem("adminKey", state.adminKey);
      localStorage.setItem("adminId", state.adminId);

      try {
        await loadAll();
        securePanels.forEach((panel) => panel.classList.remove("hidden"));
        dashboardPanel.classList.remove("hidden");
        showStatus("پنل ادمین آماده است.");
      } catch (error) {
        showStatus(error.message || "خطا در ورود ادمین", true);
      }
    }

    el("loginBtn").addEventListener("click", login);
    el("refreshAllBtn").addEventListener("click", () => loadAll().then(() => showStatus("بازخوانی شد.")).catch((e) => showStatus(e.message, true)));
    el("loadUsersBtn").addEventListener("click", () => loadUsers().catch((e) => showStatus(e.message, true)));
    el("createUserBtn").addEventListener("click", () => createUser().catch((e) => showStatus(e.message, true)));
    el("updateUserBtn").addEventListener("click", () => updateUser().catch((e) => showStatus(e.message, true)));
    el("deleteUserBtn").addEventListener("click", () => deleteUser().catch((e) => showStatus(e.message, true)));
    el("loadNotificationsBtn").addEventListener("click", () => loadNotifications().catch((e) => showStatus(e.message, true)));
    el("loadSubmissionsBtn").addEventListener("click", () => loadSubmissions().catch((e) => showStatus(e.message, true)));

    el("newIncludeProfile").addEventListener("change", (event) => {
      el("newProfileFields").classList.toggle("hidden", !event.target.checked);
    });
    el("editIncludeProfile").addEventListener("change", (event) => {
      el("editProfileFields").classList.toggle("hidden", !event.target.checked);
    });

    el("adminIdInput").value = state.adminId || el("adminIdInput").value;
    if (state.adminKey) {
      el("adminKeyInput").value = state.adminKey;
      login();
    }
  </script>
</body>
</html>`);
});

module.exports = router;
