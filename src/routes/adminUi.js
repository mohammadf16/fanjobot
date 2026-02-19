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
  <title>Ù¾Ù†Ù„ Ø§Ø¯Ù…ÛŒÙ† ÙÙ†Ø¬ÙˆØ¨Ùˆ</title>
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
        <h1>Ù¾Ù†Ù„ Ø§Ø¯Ù…ÛŒÙ† ÙÙ†Ø¬ÙˆØ¨Ùˆ</h1>
        <div class="hint">Ù…Ø¯ÛŒØ±ÛŒØª Ú©Ø§Ù…Ù„ Ú©Ø§Ø±Ø¨Ø±Ø§Ù†ØŒ Ø«Ø¨Øªâ€ŒÙ†Ø§Ù…ØŒ Ù¾Ø±ÙˆÙØ§ÛŒÙ„ØŒ Ù†ÙˆØªÛŒÙâ€ŒÙ‡Ø§ Ùˆ ØµÙ Ø¨Ø±Ø±Ø³ÛŒ Ù…Ø­ØªÙˆØ§</div>
      </div>
      <div class="hint">Ù…Ø³ÛŒØ±: <code>/admin</code></div>
    </section>

    <section class="panel" id="authPanel">
      <h2 class="section-title">ÙˆØ±ÙˆØ¯ Ø§Ø¯Ù…ÛŒÙ†</h2>
      <div class="row">
        <input id="adminIdInput" placeholder="ADMIN_USER_ID" value="${defaultAdminId}" />
        <input id="adminKeyInput" placeholder="ADMIN_API_KEY" type="password" />
        <button id="loginBtn" class="tight">ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ù¾Ù†Ù„</button>
      </div>
      <p class="small">Ø¯Ø±Ø®ÙˆØ§Ø³Øªâ€ŒÙ‡Ø§ Ø¨Ø§ Ù‡Ø¯Ø±Ù‡Ø§ÛŒ <code>x-admin-key</code> Ùˆ <code>x-admin-id</code> Ø§Ø±Ø³Ø§Ù„ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.</p>
    </section>

    <section class="status hidden" id="statusBox"></section>


    <section class="panel hidden" id="dashboardPanel">
      <div class="row">
        <h2 class="section-title tight">???????</h2>
        <button id="refreshAllBtn" class="ghost tight">???????? ???</button>
      </div>
      <div class="grid" id="statsGrid"></div>
      <div class="split block">
        <div class="card">
          <div class="row">
            <h3 class="section-title tight">?????? ????</h3>
            <button id="refreshQuickBoardsBtn" class="ghost tight">????????</button>
          </div>
          <div class="list" id="quickQueueList"></div>
        </div>
        <div class="card">
          <h3 class="section-title">??????? ????</h3>
          <div class="list" id="recentUsersList"></div>
        </div>
      </div>
      <div class="card block">
        <div class="row">
          <h3 class="section-title tight">??????? ???? ????????</h3>
          <button id="refreshModerationBoardBtn" class="ghost tight">????????</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>??? / ???</th>
                <th>?????</th>
                <th>?????</th>
                <th>??????</th>
              </tr>
            </thead>
            <tbody id="moderationBoardBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card block">
        <div class="row">
          <h3 class="section-title tight">?????? ???? ????? / ????</h3>
          <button id="refreshOpsBoardBtn" class="ghost tight">????????</button>
        </div>
        <div class="split">
          <div>
            <h4 class="section-title">?????? ???? ??????</h4>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>?????</th>
                    <th>???</th>
                    <th>??????</th>
                  </tr>
                </thead>
                <tbody id="contentOpsBody"></tbody>
              </table>
            </div>
          </div>
          <div>
            <h4 class="section-title">???????? ?? ?????? + ??????????</h4>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>????</th>
                    <th>?????</th>
                    <th>??????</th>
                  </tr>
                </thead>
                <tbody id="industryOpsBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="panel hidden">
      <div class="row">
        <h2 class="section-title tight">Ú©Ø§Ø±Ø¨Ø±Ø§Ù†</h2>
        <input id="userSearchInput" placeholder="Ø¬Ø³ØªØ¬Ùˆ (Ù†Ø§Ù…ØŒ Ø§ÛŒÙ…ÛŒÙ„/Ø´Ù…Ø§Ø±Ù‡ØŒ ØªÙ„Ú¯Ø±Ø§Ù…)" />
        <select id="userHasProfileInput">
          <option value="">Ù‡Ù…Ù‡</option>
          <option value="true">Ø¯Ø§Ø±Ø§ÛŒ Ù¾Ø±ÙˆÙØ§ÛŒÙ„</option>
          <option value="false">Ø¨Ø¯ÙˆÙ† Ù¾Ø±ÙˆÙØ§ÛŒÙ„</option>
        </select>
        <button id="loadUsersBtn" class="tight">Ø¬Ø³ØªØ¬Ùˆ</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ø´Ù†Ø§Ø³Ù‡</th>
              <th>Ù†Ø§Ù…</th>
              <th>Ø§Ø±ØªØ¨Ø§Ø·</th>
              <th>ØªÙ„Ú¯Ø±Ø§Ù…</th>
              <th>Ù¾Ø±ÙˆÙØ§ÛŒÙ„</th>
              <th>Ø±Ø´ØªÙ‡/ØªØ±Ù…</th>
              <th>Ø«Ø¨Øª</th>
              <th>Ø¹Ù…Ù„ÛŒØ§Øª</th>
            </tr>
          </thead>
          <tbody id="usersBody"></tbody>
        </table>
      </div>
      <p class="small" id="usersMeta"></p>
    </section>

    <section class="panel hidden split">
      <div>
        <h2 class="section-title">Ø«Ø¨Øªâ€ŒÙ†Ø§Ù… Ú©Ø§Ø±Ø¨Ø± Ø¬Ø¯ÛŒØ¯</h2>
        <div class="row">
          <input id="newFullName" placeholder="Ù†Ø§Ù… Ú©Ø§Ù…Ù„" />
          <input id="newPhoneOrEmail" placeholder="Ø´Ù…Ø§Ø±Ù‡ ÛŒØ§ Ø§ÛŒÙ…ÛŒÙ„" />
          <input id="newTelegramId" placeholder="Telegram ID (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)" />
        </div>
        <div class="row block">
          <label class="tight"><input type="checkbox" id="newIncludeProfile" /> Ø«Ø¨Øª Ù‡Ù…Ø²Ù…Ø§Ù† Ù¾Ø±ÙˆÙØ§ÛŒÙ„</label>
        </div>
        <div id="newProfileFields" class="hidden">
          <div class="row block">
            <input id="newMajor" placeholder="Ø±Ø´ØªÙ‡" />
            <input id="newLevel" placeholder="Ù…Ù‚Ø·Ø¹" />
            <input id="newTerm" placeholder="ØªØ±Ù…" />
            <input id="newSkillLevel" placeholder="skillLevel: beginner/intermediate/advanced" />
          </div>
          <div class="row block">
            <input id="newShortGoal" placeholder="Ù‡Ø¯Ù Ú©ÙˆØªØ§Ù‡ Ù…Ø¯Øª" />
            <input id="newWeeklyHours" placeholder="Ø³Ø§Ø¹Øª Ù‡ÙØªÚ¯ÛŒ (Ø¹Ø¯Ø¯)" />
            <input id="newUniversity" placeholder="Ø¯Ø§Ù†Ø´Ú¯Ø§Ù‡ (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)" />
            <input id="newCity" placeholder="Ø´Ù‡Ø± (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)" />
          </div>
          <div class="row block">
            <input id="newInterests" placeholder="Ø¹Ù„Ø§Ù‚Ù‡â€ŒÙ…Ù†Ø¯ÛŒâ€ŒÙ‡Ø§: ai,web,backend" />
            <input id="newPassedCourses" placeholder="Ø¯Ø±ÙˆØ³ Ù¾Ø§Ø³ Ø´Ø¯Ù‡: CE101,MA201" />
            <input id="newSkills" placeholder="Ù…Ù‡Ø§Ø±Øªâ€ŒÙ‡Ø§: node:8,sql:7" />
          </div>
        </div>
        <div class="row block">
          <button id="createUserBtn">Ø«Ø¨Øª Ú©Ø§Ø±Ø¨Ø±</button>
        </div>
      </div>

      <div>
        <h2 class="section-title">ÙˆÛŒØ±Ø§ÛŒØ´ Ú©Ø§Ø±Ø¨Ø±</h2>
        <div class="small" id="editUserHint">ÛŒÚ© Ú©Ø§Ø±Ø¨Ø± Ø§Ø² Ø¬Ø¯ÙˆÙ„ Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†.</div>
        <div class="row block">
          <input id="editUserId" placeholder="User ID" readonly />
          <input id="editFullName" placeholder="Ù†Ø§Ù… Ú©Ø§Ù…Ù„" />
          <input id="editPhoneOrEmail" placeholder="Ø´Ù…Ø§Ø±Ù‡ ÛŒØ§ Ø§ÛŒÙ…ÛŒÙ„" />
          <input id="editTelegramId" placeholder="Telegram ID" />
        </div>
        <div class="row block">
          <label class="tight"><input type="checkbox" id="editIncludeProfile" /> Ø¨Ù‡â€ŒØ±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ Ù¾Ø±ÙˆÙØ§ÛŒÙ„</label>
        </div>
        <div id="editProfileFields" class="hidden">
          <div class="row block">
            <input id="editMajor" placeholder="Ø±Ø´ØªÙ‡" />
            <input id="editLevel" placeholder="Ù…Ù‚Ø·Ø¹" />
            <input id="editTerm" placeholder="ØªØ±Ù…" />
            <input id="editSkillLevel" placeholder="skillLevel" />
          </div>
          <div class="row block">
            <input id="editShortGoal" placeholder="Ù‡Ø¯Ù Ú©ÙˆØªØ§Ù‡ Ù…Ø¯Øª" />
            <input id="editWeeklyHours" placeholder="Ø³Ø§Ø¹Øª Ù‡ÙØªÚ¯ÛŒ" />
            <input id="editUniversity" placeholder="Ø¯Ø§Ù†Ø´Ú¯Ø§Ù‡" />
            <input id="editCity" placeholder="Ø´Ù‡Ø±" />
          </div>
          <div class="row block">
            <input id="editInterests" placeholder="interests: ai,web" />
            <input id="editPassedCourses" placeholder="passed courses: CE101,MA201" />
            <input id="editSkills" placeholder="skills: node:8,sql:7" />
          </div>
        </div>
        <div class="row block">
          <button id="updateUserBtn">Ø°Ø®ÛŒØ±Ù‡ ØªØºÛŒÛŒØ±Ø§Øª</button>
          <button id="deleteUserBtn" class="danger">Ø­Ø°Ù Ú©Ø§Ø±Ø¨Ø±</button>
        </div>
      </div>
    </section>

    <section class="panel hidden split">
      <div>
        <h2 class="section-title">Ù†ÙˆØªÛŒÙâ€ŒÙ‡Ø§ÛŒ Ø§Ø¯Ù…ÛŒÙ†</h2>
        <div class="row">
          <button id="loadNotificationsBtn" class="ghost tight">Ø¨Ø§Ø²Ø®ÙˆØ§Ù†ÛŒ</button>
        </div>
        <div class="list block" id="notificationsList"></div>
      </div>
      <div>
        <h2 class="section-title">ØµÙ Ø¨Ø±Ø±Ø³ÛŒ Ù…Ø­ØªÙˆØ§</h2>
        <div class="row">
          <button id="loadSubmissionsBtn" class="ghost tight">Ø¨Ø§Ø²Ø®ÙˆØ§Ù†ÛŒ</button>
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
        .split(/[,ØŒ]/)
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
        ["total_users", "Ú©Ù„ Ú©Ø§Ø±Ø¨Ø±Ø§Ù†"],
        ["total_profiles", "Ù¾Ø±ÙˆÙØ§ÛŒÙ„â€ŒÙ‡Ø§"],
        ["total_contents", "Ú©Ù„ Ù…Ø­ØªÙˆØ§"],
        ["published_contents", "Ù…Ø­ØªÙˆØ§ÛŒ Ù…Ù†ØªØ´Ø± Ø´Ø¯Ù‡"],
        ["total_opportunities", "ÙØ±ØµØªâ€ŒÙ‡Ø§ÛŒ ØµÙ†Ø¹ØªÛŒ"],
        ["pending_opportunities", "ÙØ±ØµØªâ€ŒÙ‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± ØªØ§ÛŒÛŒØ¯"],
        ["total_projects", "Ù¾Ø±ÙˆÚ˜Ù‡â€ŒÙ‡Ø§ÛŒ ØµÙ†Ø¹ØªÛŒ"],
        ["total_applications", "Ø¯Ø±Ø®ÙˆØ§Ø³Øªâ€ŒÙ‡Ø§ÛŒ Ø´ØºÙ„ÛŒ"],
        ["total_submissions", "Ø§Ø±Ø³Ø§Ù„â€ŒÙ‡Ø§ÛŒ Ø§Ù†Ø¬Ù…Ù†"],
        ["pending_submissions", "Ø§Ø±Ø³Ø§Ù„â€ŒÙ‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø±"],
        ["open_notifications", "Ù†ÙˆØªÛŒÙâ€ŒÙ‡Ø§ÛŒ Ø¨Ø§Ø²"]
      ];

      el("statsGrid").innerHTML = labels.map(([key, label]) => \`
        <article class="card stat-card">
          <div class="stat-value">\${Number(stats[key] || 0).toLocaleString("fa-IR")}</div>
          <div class="stat-label">\${label}</div>
        </article>
      \`).join("");

      const recentUsers = data.recentUsers || [];
      el("recentUsersList").innerHTML = recentUsers.length
        ? recentUsers.map((user) => \`
            <article class="list-item">
              <div class="row">
                <strong>#\${user.id} \${esc(user.full_name || "-")}</strong>
                <span class="badge \${user.has_profile ? "ok" : "off"} tight">\${user.has_profile ? "پروفایل دارد" : "بدون پروفایل"}</span>
              </div>
              <div class="small">\${esc(user.phone_or_email || "-")}</div>
              <div class="small">\${esc(user.created_at || "")}</div>
            </article>
          \`).join("")
        : "<div class='small'>کاربر جدیدی ثبت نشده.</div>";
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
          <td>\${user.has_profile ? '<span class="badge ok">Ø¯Ø§Ø±Ø¯</span>' : '<span class="badge off">Ù†Ø¯Ø§Ø±Ø¯</span>'}</td>
          <td>\${esc(user.major || "-")} / \${esc(user.term || "-")}</td>
          <td>\${esc(user.created_at)}</td>
          <td><button class="ghost user-select" data-id="\${user.id}">Ø§Ù†ØªØ®Ø§Ø¨</button></td>
        </tr>
      \`).join("") || "<tr><td colspan='8'>Ú©Ø§Ø±Ø¨Ø±ÛŒ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯.</td></tr>";

      el("usersMeta").textContent = \`ØªØ¹Ø¯Ø§Ø¯: \${Number(data.total || 0).toLocaleString("fa-IR")} | Ù†Ù…Ø§ÛŒØ´: \${state.users.length}\`;

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
      el("editUserHint").textContent = \`Ú©Ø§Ø±Ø¨Ø± #\${user.user_id} | Ø§Ù¾Ù„ÛŒÚ©ÛŒØ´Ù†: \${apps} | Ù¾Ø±ÙˆÚ˜Ù‡ Ø¯Ø§Ù†Ø´Ø¬ÙˆÛŒÛŒ: \${projects} | Ø±Ø®Ø¯Ø§Ø¯: \${events} | Ø§Ø±Ø³Ø§Ù„ Ø§Ù†Ø¬Ù…Ù†: \${submissions}\`;
    }

    async function loadUserDetail(userId) {
      const data = await api("/api/admin/users/" + userId);
      fillEditForm(data);
      showStatus("Ø¬Ø²Ø¦ÛŒØ§Øª Ú©Ø§Ø±Ø¨Ø± Ø¨Ø§Ø±Ú¯Ø°Ø§Ø±ÛŒ Ø´Ø¯.");
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

      showStatus(\`Ú©Ø§Ø±Ø¨Ø± Ø¬Ø¯ÛŒØ¯ Ø«Ø¨Øª Ø´Ø¯. Ø´Ù†Ø§Ø³Ù‡: \${data.user?.id}\`);
      await Promise.all([loadOverview(), loadUsers()]);
    }

    async function updateUser() {
      const userId = el("editUserId").value;
      if (!userId) {
        showStatus("Ø§Ø¨ØªØ¯Ø§ ÛŒÚ© Ú©Ø§Ø±Ø¨Ø± Ø±Ø§ Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†.", true);
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

      showStatus("Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ú©Ø§Ø±Ø¨Ø± Ø°Ø®ÛŒØ±Ù‡ Ø´Ø¯.");
      await Promise.all([loadOverview(), loadUsers(), loadUserDetail(userId)]);
    }

    async function deleteUser() {
      const userId = el("editUserId").value;
      if (!userId) return showStatus("Ú©Ø§Ø±Ø¨Ø±ÛŒ Ø¨Ø±Ø§ÛŒ Ø­Ø°Ù Ø§Ù†ØªØ®Ø§Ø¨ Ù†Ø´Ø¯Ù‡.", true);
      if (!confirm("Ø­Ø°Ù Ú©Ø§Ø±Ø¨Ø± Ø§Ù†Ø¬Ø§Ù… Ø´ÙˆØ¯ØŸ")) return;

      await api("/api/admin/users/" + userId, { method: "DELETE" });
      showStatus("Ú©Ø§Ø±Ø¨Ø± Ø­Ø°Ù Ø´Ø¯.");

      el("editUserId").value = "";
      el("editUserHint").textContent = "ÛŒÚ© Ú©Ø§Ø±Ø¨Ø± Ø§Ø² Ø¬Ø¯ÙˆÙ„ Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†.";
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
      \`).join("") || "<div class='small'>Ù†ÙˆØªÛŒÙ Ø¨Ø§Ø² ÙˆØ¬ÙˆØ¯ Ù†Ø¯Ø§Ø±Ø¯.</div>";
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
          <div class="small">Ú©Ø§Ø±Ø¨Ø±: #\${esc(item.user_id)} | \${esc(item.created_at || "")}</div>
        </article>
      \`).join("") || "<div class='small'>Ø¯Ø± Ø­Ø§Ù„ Ø­Ø§Ø¶Ø± Ù…ÙˆØ±Ø¯ÛŒ Ø¯Ø± ØµÙ Ø¨Ø±Ø±Ø³ÛŒ Ù†ÛŒØ³Øª.</div>";
    }

    async function loadQuickBoards() {
      const [pendingSubmissions, pendingOpportunities, openNotifications] = await Promise.all([
        api("/api/admin/moderation/submissions?status=pending&limit=5"),
        api("/api/admin/industry/opportunities?approvalStatus=pending&limit=5"),
        api("/api/admin/notifications?status=open&limit=5")
      ]);

      const lines = [];
      for (const item of (pendingSubmissions.items || [])) {
        lines.push(\`<article class="list-item"><strong>ارسال #\${item.id}</strong><div class="small">\${esc(item.title || "-")}</div></article>\`);
      }
      for (const item of (pendingOpportunities.items || [])) {
        lines.push(\`<article class="list-item"><strong>فرصت #\${item.id}</strong><div class="small">\${esc(item.title || "-")}</div></article>\`);
      }
      for (const item of (openNotifications.items || [])) {
        lines.push(\`<article class="list-item"><strong>نوتیف #\${item.id}</strong><div class="small">\${esc(item.title || item.type || "-")}</div></article>\`);
      }

      el("quickQueueList").innerHTML = lines.join("") || "<div class='small'>آیتم فوری وجود ندارد.</div>";
    }

    async function loadModerationBoard() {
      const data = await api("/api/admin/moderation/submissions?status=pending&limit=15");
      const rows = data.items || [];

      el("moderationBoardBody").innerHTML = rows.map((item) => \`
        <tr>
          <td>\${item.id}</td>
          <td>\${esc(item.section || "-")} / \${esc(item.content_kind || "-")}</td>
          <td>\${esc(item.title || "-")}</td>
          <td>#\${esc(item.user_id)}</td>
          <td>
            <div class="row">
              <button class="tight mod-approve" data-id="\${item.id}">تایید</button>
              <button class="tight danger mod-reject" data-id="\${item.id}">رد</button>
            </div>
          </td>
        </tr>
      \`).join("") || "<tr><td colspan='5'>ارسالی در انتظار نداریم.</td></tr>";
    }

    async function loadOpsBoard() {
      const [contents, pendingOpps, applications] = await Promise.all([
        api("/api/admin/content?isPublished=false&limit=12"),
        api("/api/admin/industry/opportunities?approvalStatus=pending&limit=8"),
        api("/api/admin/industry/applications?limit=8")
      ]);

      el("contentOpsBody").innerHTML = (contents.items || []).map((item) => \`
        <tr>
          <td>\${item.id}</td>
          <td>\${esc(item.title || "-")}</td>
          <td>\${esc(item.type || "-")} / \${esc(item.kind || "-")}</td>
          <td><button class="tight publish-content" data-id="\${item.id}">انتشار</button></td>
        </tr>
      \`).join("") || "<tr><td colspan='4'>موردی نیست.</td></tr>";

      const oppRows = (pendingOpps.items || []).map((item) => \`
        <tr>
          <td>فرصت #\${item.id} - \${esc(item.title || "-")}</td>
          <td>\${esc(item.approval_status || "pending")}</td>
          <td>
            <div class="row">
              <button class="tight approve-opp" data-id="\${item.id}">تایید</button>
              <button class="tight danger reject-opp" data-id="\${item.id}">رد</button>
            </div>
          </td>
        </tr>
      \`);

      const appRows = (applications.items || []).map((item) => \`
        <tr>
          <td>درخواست #\${item.id} - \${esc(item.opportunity_title || "-")}</td>
          <td>\${esc(item.status || "-")}</td>
          <td>
            <div class="row">
              <select class="app-status" data-id="\${item.id}">
                <option value="draft" \${item.status === "draft" ? "selected" : ""}>draft</option>
                <option value="submitted" \${item.status === "submitted" ? "selected" : ""}>submitted</option>
                <option value="viewed" \${item.status === "viewed" ? "selected" : ""}>viewed</option>
                <option value="interview" \${item.status === "interview" ? "selected" : ""}>interview</option>
                <option value="rejected" \${item.status === "rejected" ? "selected" : ""}>rejected</option>
                <option value="accepted" \${item.status === "accepted" ? "selected" : ""}>accepted</option>
              </select>
              <button class="tight update-app-status" data-id="\${item.id}">ثبت</button>
            </div>
          </td>
        </tr>
      \`);

      const allRows = [...oppRows, ...appRows];
      el("industryOpsBody").innerHTML = allRows.join("") || "<tr><td colspan='3'>موردی نیست.</td></tr>";
    }

    async function reviewSubmission(submissionId, action) {
      const reason = action === "approve" ? "Approved from admin dashboard" : "Rejected from admin dashboard";
      await api("/api/admin/moderation/submissions/" + submissionId + "/review", {
        method: "POST",
        body: JSON.stringify({ action, reason })
      });
    }

    async function setContentPublished(contentId, isPublished) {
      await api("/api/admin/content/" + contentId + "/publish", {
        method: "PATCH",
        body: JSON.stringify({ isPublished })
      });
    }

    async function setOpportunityApproval(opportunityId, approvalStatus) {
      await api("/api/admin/industry/opportunities/" + opportunityId + "/approval", {
        method: "PATCH",
        body: JSON.stringify({ approvalStatus })
      });
    }

    async function setApplicationStatus(applicationId, status) {
      await api("/api/admin/industry/applications/" + applicationId + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
    }

    async function loadAll() {
      await Promise.all([
        loadOverview(),
        loadUsers(),
        loadNotifications(),
        loadSubmissions(),
        loadQuickBoards(),
        loadModerationBoard(),
        loadOpsBoard()
      ]);
    }

    async function login() {
      state.adminId = el("adminIdInput").value.trim();
      state.adminKey = el("adminKeyInput").value.trim();
      if (!state.adminKey) {
        showStatus("ADMIN_API_KEY Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†.", true);
        return;
      }

      localStorage.setItem("adminKey", state.adminKey);
      localStorage.setItem("adminId", state.adminId);

      try {
        await loadAll();
        securePanels.forEach((panel) => panel.classList.remove("hidden"));
        dashboardPanel.classList.remove("hidden");
        showStatus("Ù¾Ù†Ù„ Ø§Ø¯Ù…ÛŒÙ† Ø¢Ù…Ø§Ø¯Ù‡ Ø§Ø³Øª.");
      } catch (error) {
        showStatus(error.message || "Ø®Ø·Ø§ Ø¯Ø± ÙˆØ±ÙˆØ¯ Ø§Ø¯Ù…ÛŒÙ†", true);
      }
    }

    el("loginBtn").addEventListener("click", login);
    el("refreshAllBtn").addEventListener("click", () => loadAll().then(() => showStatus("Ø¨Ø§Ø²Ø®ÙˆØ§Ù†ÛŒ Ø´Ø¯.")).catch((e) => showStatus(e.message, true)));
    el("refreshQuickBoardsBtn").addEventListener("click", () => loadQuickBoards().then(() => showStatus("کارهای فوری بازخوانی شد.")).catch((e) => showStatus(e.message, true)));
    el("refreshModerationBoardBtn").addEventListener("click", () => loadModerationBoard().then(() => showStatus("صف مودریشن بازخوانی شد.")).catch((e) => showStatus(e.message, true)));
    el("refreshOpsBoardBtn").addEventListener("click", () => loadOpsBoard().then(() => showStatus("اپریشن برد بازخوانی شد.")).catch((e) => showStatus(e.message, true)));
    el("loadUsersBtn").addEventListener("click", () => loadUsers().catch((e) => showStatus(e.message, true)));
    el("createUserBtn").addEventListener("click", () => createUser().catch((e) => showStatus(e.message, true)));
    el("updateUserBtn").addEventListener("click", () => updateUser().catch((e) => showStatus(e.message, true)));
    el("deleteUserBtn").addEventListener("click", () => deleteUser().catch((e) => showStatus(e.message, true)));
    el("loadNotificationsBtn").addEventListener("click", () => loadNotifications().catch((e) => showStatus(e.message, true)));
    el("loadSubmissionsBtn").addEventListener("click", () => loadSubmissions().catch((e) => showStatus(e.message, true)));

    el("moderationBoardBody").addEventListener("click", async (event) => {
      const approveBtn = event.target.closest(".mod-approve");
      const rejectBtn = event.target.closest(".mod-reject");
      if (!approveBtn && !rejectBtn) return;

      const submissionId = Number((approveBtn || rejectBtn).dataset.id);
      if (!submissionId) return;

      try {
        if (approveBtn) await reviewSubmission(submissionId, "approve");
        if (rejectBtn) await reviewSubmission(submissionId, "reject");
        await Promise.all([loadOverview(), loadModerationBoard(), loadSubmissions(), loadQuickBoards()]);
        showStatus("وضعیت ارسال به‌روزرسانی شد.");
      } catch (error) {
        showStatus(error.message, true);
      }
    });

    el("contentOpsBody").addEventListener("click", async (event) => {
      const btn = event.target.closest(".publish-content");
      if (!btn) return;
      const contentId = Number(btn.dataset.id);
      if (!contentId) return;

      try {
        await setContentPublished(contentId, true);
        await Promise.all([loadOverview(), loadOpsBoard()]);
        showStatus("محتوا منتشر شد.");
      } catch (error) {
        showStatus(error.message, true);
      }
    });

    el("industryOpsBody").addEventListener("click", async (event) => {
      const approveBtn = event.target.closest(".approve-opp");
      const rejectBtn = event.target.closest(".reject-opp");
      const updateAppBtn = event.target.closest(".update-app-status");

      try {
        if (approveBtn) {
          const opportunityId = Number(approveBtn.dataset.id);
          if (!opportunityId) return;
          await setOpportunityApproval(opportunityId, "approved");
        } else if (rejectBtn) {
          const opportunityId = Number(rejectBtn.dataset.id);
          if (!opportunityId) return;
          await setOpportunityApproval(opportunityId, "rejected");
        } else if (updateAppBtn) {
          const applicationId = Number(updateAppBtn.dataset.id);
          if (!applicationId) return;
          const selected = el("industryOpsBody").querySelector('.app-status[data-id=\"' + applicationId + '\"]');
          const status = selected?.value;
          if (!status) return;
          await setApplicationStatus(applicationId, status);
        } else {
          return;
        }

        await Promise.all([loadOverview(), loadOpsBoard(), loadQuickBoards()]);
        showStatus("عملیات انجام شد.");
      } catch (error) {
        showStatus(error.message, true);
      }
    });

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

