const express = require("express");
const path = require("path");
const { config } = require("../config");

const router = express.Router();
const assetsDir = path.join(__dirname, "..", "admin-ui", "assets");
const assetVersion = "20260219-4";

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function noStore(_req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
}

const navItems = [
  { key: "dashboard", label: "Overview", href: "/admin/dashboard" },
  { key: "users", label: "Users & Profiles", href: "/admin/users" },
  { key: "messaging", label: "Messaging", href: "/admin/messaging" },
  { key: "moderation", label: "Moderation", href: "/admin/moderation" },
  { key: "content", label: "Content", href: "/admin/content" },
  { key: "projects", label: "Projects & Ops", href: "/admin/projects" },
  { key: "integrations", label: "Integrations", href: "/admin/integrations" },
  { key: "logs", label: "Logs & Runtime", href: "/admin/logs" }
];

function renderNav(active) {
  return navItems
    .map((item) => {
      const activeClass = item.key === active ? "nav-link active" : "nav-link";
      return `<a class="${activeClass}" href="${item.href}">${item.label}</a>`;
    })
    .join("");
}

function renderPage({ title, heading, subtitle, activeNav, content, scriptName }) {
  const safeTitle = escapeAttr(title);
  const safeHeading = escapeAttr(heading);
  const safeSubtitle = escapeAttr(subtitle);
  const defaultAdminId = escapeAttr(config.adminUserId || "");
  const navHtml = renderNav(activeNav);
  const navOptions = navItems
    .map((item) => {
      const selected = item.key === activeNav ? " selected" : "";
      return `<option value="${item.href}"${selected}>${item.label}</option>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="/admin/assets/admin.css?v=${assetVersion}" />
</head>
<body data-default-admin-id="${defaultAdminId}">
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-kicker">Fanjobo</div>
        <h1>Admin Panel</h1>
      </div>
      <nav class="nav">${navHtml}</nav>
    </aside>

    <div class="workspace">
      <header class="topbar card">
        <div class="topbar-main">
          <div>
            <h2 class="page-title">${safeHeading}</h2>
            <div class="page-subtitle">${safeSubtitle}</div>
          </div>
          <div class="chip-row">
            <span id="globalConnChip" class="chip muted">Offline</span>
            <span id="globalSyncChip" class="chip">Last sync: -</span>
          </div>
        </div>

        <div class="auth-bar">
          <input id="globalAdminIdInput" placeholder="ADMIN_USER_ID" />
          <input id="globalAdminKeyInput" type="password" placeholder="ADMIN_API_KEY" />
          <button id="globalConnectBtn" class="btn">Connect</button>
          <button id="globalReconnectBtn" class="btn ghost">Verify</button>
          <button id="globalClearBtn" class="btn ghost">Clear</button>
        </div>

        <div class="quickbar">
          <select id="globalNavSelect">${navOptions}</select>
          <button id="globalGoBtn" class="btn ghost">Go</button>
          <button id="globalRefreshPageBtn" class="btn ghost">Reload Page</button>
          <button id="globalCopyHeadersBtn" class="btn ghost">Copy Headers</button>
        </div>

        <div id="globalStatusBox" class="status-box info">Enter admin credentials to load data.</div>
      </header>

      <main class="content">${content}</main>
    </div>
  </div>
  <div id="globalToastHost" class="toast-host" aria-live="polite"></div>
  <script defer src="/admin/assets/admin-core.js?v=${assetVersion}"></script>
  <script defer src="/admin/assets/${scriptName}?v=${assetVersion}"></script>
</body>
</html>`;
}

const dashboardContent = `
<section class="card dashboard-hero">
  <div class="section-head">
    <div>
      <h3>Operations Command Center</h3>
      <div class="meta-text">Live snapshot of moderation pressure, publishing health, and bot audience.</div>
    </div>
    <div class="toolbar">
      <button id="dashboardRefreshBtn" class="btn ghost">Refresh</button>
      <button id="dashboardExportBtn" class="btn ghost">Export JSON</button>
      <select id="dashboardAutoInterval">
        <option value="0">Auto: OFF</option>
        <option value="5000">Auto: 5s</option>
        <option value="10000">Auto: 10s</option>
        <option value="30000">Auto: 30s</option>
      </select>
    </div>
  </div>
  <div id="dashboardHeroMetrics" class="hero-metrics"></div>
</section>

<section class="card">
  <div class="section-head">
    <h3>Core Metrics</h3>
    <div class="meta-text">System-wide totals with balanced card sizes for quick scanning.</div>
  </div>
  <div id="dashboardStatsGrid" class="stats-grid stats-grid-dashboard"></div>
</section>

<section class="grid-2 dashboard-columns">
  <article class="card">
    <div class="section-head">
      <h3>Quick Queue</h3>
      <div class="toolbar">
        <select id="dashboardQueueTypeInput">
          <option value="all">all</option>
          <option value="submission">submissions</option>
          <option value="opportunity">opportunities</option>
          <option value="notification">notifications</option>
        </select>
      </div>
    </div>
    <div id="dashboardQuickQueue" class="list-block"></div>
  </article>
  <article class="card">
    <h3>Recent Users</h3>
    <div id="dashboardRecentUsers" class="list-block"></div>
  </article>
</section>

<section class="grid-2">
  <article class="card">
    <h3>Majors Distribution</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Major</th><th>Total</th></tr></thead>
        <tbody id="dashboardMajorsBody"></tbody>
      </table>
    </div>
  </article>
  <article class="card">
    <h3>Submission Analytics</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Status</th><th>Section</th><th>Kind</th><th>Total</th></tr></thead>
        <tbody id="dashboardSubmissionAnalyticsBody"></tbody>
      </table>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Type</th><th>Kind</th><th>Total</th><th>Published</th></tr></thead>
        <tbody id="dashboardContentAnalyticsBody"></tbody>
      </table>
    </div>
  </article>
</section>

<section class="card">
  <h3>Operations Snapshot</h3>
  <pre id="dashboardOpsAnalyticsBox" class="codebox compact">No data</pre>
</section>
`;

const usersContent = `
<section class="card">
  <div class="section-head">
    <h3>Users</h3>
    <div class="toolbar">
      <input id="usersSearchInput" placeholder="Search name/contact/telegram" />
      <select id="usersHasProfileInput">
        <option value="">All</option>
        <option value="true">Has profile</option>
        <option value="false">No profile</option>
      </select>
      <select id="usersSortInput">
        <option value="created_desc">Newest first</option>
        <option value="created_asc">Oldest first</option>
        <option value="name_asc">Name A-Z</option>
        <option value="name_desc">Name Z-A</option>
      </select>
      <button id="usersLoadBtn" class="btn">Load</button>
      <button id="usersExportBtn" class="btn ghost">Export Users CSV</button>
    </div>
  </div>
  <div id="usersSummaryChips" class="chip-row"></div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Telegram</th><th>Profile</th><th>Major/Term</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody id="usersTableBody"></tbody>
    </table>
  </div>
  <div id="usersMetaBox" class="meta-text"></div>
</section>

<section class="grid-2">
  <article class="card">
    <h3>User Full Detail</h3>
    <pre id="usersDetailBox" class="codebox">Select a user...</pre>
  </article>
  <article class="card">
    <div class="section-head">
      <h3>Profiles Snapshot</h3>
      <div class="toolbar">
        <input id="profilesMajorInput" placeholder="Major filter (optional)" />
        <input id="profilesLevelInput" placeholder="Level filter (optional)" />
        <button id="profilesLoadBtn" class="btn ghost">Load Profiles</button>
        <button id="profilesExportBtn" class="btn ghost">Export Profiles CSV</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>User</th><th>Major</th><th>Level/Term</th><th>Hours</th><th>Updated</th><th>Action</th></tr></thead>
        <tbody id="profilesTableBody"></tbody>
      </table>
    </div>
    <div id="profilesMetaBox" class="meta-text"></div>
  </article>
</section>
`;

const moderationContent = `
<section class="card">
  <div class="section-head">
    <h3>Submissions Moderation</h3>
    <div class="toolbar">
      <select id="moderationStatusInput">
        <option value="pending">pending</option>
        <option value="approved">approved</option>
        <option value="rejected">rejected</option>
        <option value="">all</option>
      </select>
      <select id="moderationSectionInput">
        <option value="">all sections</option>
        <option value="university">university</option>
        <option value="industry">industry</option>
      </select>
      <input id="moderationKindInput" placeholder="kind (optional)" />
      <input id="moderationSearchInput" placeholder="local search title/user id" />
      <input id="moderationReasonInput" placeholder="review reason (reject: recommended)" />
      <button id="moderationLoadBtn" class="btn">Load</button>
      <button id="moderationApproveSelectedBtn" class="btn">Approve Selected</button>
      <button id="moderationRejectSelectedBtn" class="btn danger">Reject Selected</button>
      <button id="moderationExportBtn" class="btn ghost">Export CSV</button>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th><input id="moderationSelectAll" type="checkbox" /></th><th>ID</th><th>Status</th><th>Section/Kind</th><th>Title</th><th>User</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody id="moderationTableBody"></tbody>
    </table>
  </div>
</section>

<section class="card">
  <h3>Submission Full Detail</h3>
  <pre id="moderationDetailBox" class="codebox">Select a submission...</pre>
</section>
`;

const messagingContent = `
<section class="grid-2">
  <article class="card">
    <div class="section-head">
      <h3>Broadcast Message</h3>
      <div class="toolbar">
        <button id="msgLoadAudienceBtn" class="btn ghost">Refresh Audience</button>
      </div>
    </div>
    <div class="toolbar">
      <input id="msgLimitInput" type="number" min="1" max="10000" value="500" placeholder="send limit (optional)" />
      <label class="check-row">
        <input id="msgDryRunInput" type="checkbox" checked />
        Dry run only (no messages sent)
      </label>
    </div>
    <textarea id="msgBodyInput" class="message-box" placeholder="Write the message to send to all users who started the bot..."></textarea>
    <div class="toolbar">
      <button id="msgSendBtn" class="btn">Run Broadcast</button>
      <button id="msgClearBtn" class="btn ghost">Clear</button>
      <button id="msgCopyBtn" class="btn ghost">Copy Text</button>
    </div>
    <div id="msgResultMeta" class="meta-text">No broadcast executed yet.</div>
    <pre id="msgResultBox" class="codebox compact">Waiting for input...</pre>
  </article>

  <article class="card">
    <div class="section-head">
      <h3>Started Bot Audience</h3>
      <div id="msgAudienceChips" class="chip-row"></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>User</th><th>Name</th><th>Telegram</th><th>Started</th></tr></thead>
        <tbody id="msgAudienceBody"></tbody>
      </table>
    </div>
  </article>
</section>
`;

const contentContent = `
<section class="card">
  <div class="section-head">
    <h3>Content Library</h3>
    <div class="toolbar">
      <select id="contentTypeInput">
        <option value="">all types</option>
        <option value="university">university</option>
        <option value="industry">industry</option>
      </select>
      <input id="contentKindInput" placeholder="kind (optional)" />
      <select id="contentPublishedInput">
        <option value="">all</option>
        <option value="true">published</option>
        <option value="false">unpublished</option>
      </select>
      <input id="contentSearchInput" placeholder="local search title/id" />
      <button id="contentLoadBtn" class="btn">Load</button>
      <button id="contentPublishSelectedBtn" class="btn">Publish Selected</button>
      <button id="contentUnpublishSelectedBtn" class="btn danger">Unpublish Selected</button>
      <button id="contentExportBtn" class="btn ghost">Export CSV</button>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th><input id="contentSelectAll" type="checkbox" /></th><th>ID</th><th>Type/Kind</th><th>Title</th><th>Major/Term</th><th>Published</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody id="contentTableBody"></tbody>
    </table>
  </div>
</section>

<section class="card">
  <h3>Content Full Detail</h3>
  <pre id="contentDetailBox" class="codebox">Select a content record...</pre>
</section>
`;

const projectsContent = `
<section class="grid-2">
  <article class="card">
    <div class="section-head">
      <h3>Projects Review</h3>
      <div class="toolbar">
        <select id="projectStatusInput">
          <option value="">all statuses</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
        </select>
        <button id="projectLoadBtn" class="btn">Load</button>
        <button id="projectExportBtn" class="btn ghost">Export CSV</button>
      </div>
    </div>
    <div id="projectsSummaryChips" class="chip-row"></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Title</th><th>Company</th><th>Status</th><th>Type/Level</th><th>Actions</th></tr></thead>
        <tbody id="projectTableBody"></tbody>
      </table>
    </div>
  </article>
  <article class="card">
    <h3>Project Full Detail</h3>
    <pre id="projectDetailBox" class="codebox">Select a project...</pre>
  </article>
</section>

<section class="grid-2">
  <article class="card">
    <div class="section-head">
      <h3>Opportunity Approvals</h3>
      <div class="toolbar">
        <select id="opportunityStatusInput">
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="">all</option>
        </select>
        <button id="opportunityRefreshBtn" class="btn ghost">Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Title</th><th>Company</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="opportunityTableBody"></tbody>
      </table>
    </div>
  </article>
  <article class="card">
    <div class="section-head">
      <h3>Applications Tracker</h3>
      <div class="toolbar">
        <select id="applicationsStatusInput">
          <option value="">all</option>
          <option value="submitted">submitted</option>
          <option value="viewed">viewed</option>
          <option value="interview">interview</option>
          <option value="accepted">accepted</option>
          <option value="rejected">rejected</option>
        </select>
        <button id="applicationsRefreshBtn" class="btn ghost">Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Opportunity</th><th>Student</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="applicationsTableBody"></tbody>
      </table>
    </div>
    <pre id="applicationDetailBox" class="codebox compact">Select/update an application to inspect.</pre>
  </article>
</section>
`;

const integrationsContent = `
<section class="grid-2">
  <article class="card">
    <div class="section-head">
      <h3>Drive Read/Write Check</h3>
      <div class="toolbar">
        <button id="driveRunBtn" class="btn">Run Test</button>
        <button id="driveCopyResultBtn" class="btn ghost">Copy Result</button>
      </div>
    </div>
    <div class="toolbar">
      <input id="driveFolderInput" placeholder="Folder ID (optional; empty = DRIVE_ROOT_FOLDER_ID)" />
    </div>
    <pre id="driveOutputBox" class="codebox">No test executed yet.</pre>
  </article>
  <article class="card">
    <div class="section-head">
      <h3>Notifications</h3>
      <div class="toolbar">
        <select id="notifStatusInput">
          <option value="open">open</option>
          <option value="resolved">resolved</option>
          <option value="">all</option>
        </select>
        <button id="notifLoadBtn" class="btn ghost">Load</button>
        <button id="notifResolveAllBtn" class="btn danger">Resolve Visible Open</button>
        <button id="notifExportBtn" class="btn ghost">Export CSV</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
        <tbody id="notifTableBody"></tbody>
      </table>
    </div>
    <pre id="notifDetailBox" class="codebox compact">Select a notification to inspect payload.</pre>
  </article>
</section>
`;

const logsContent = `
<section class="card">
  <div class="section-head">
    <h3>System Logs</h3>
    <div class="toolbar">
      <select id="logsLevelInput">
        <option value="">all levels</option>
        <option value="info">info</option>
        <option value="warn">warn</option>
        <option value="error">error</option>
      </select>
      <input id="logsSearchInput" placeholder="search message/meta" />
      <input id="logsLimitInput" type="number" min="20" max="1000" value="300" />
      <select id="logsAutoIntervalInput">
        <option value="0">Auto OFF</option>
        <option value="3000">Auto 3s</option>
        <option value="5000">Auto 5s</option>
        <option value="10000">Auto 10s</option>
      </select>
      <button id="logsLoadBtn" class="btn">Load</button>
      <button id="logsAutoBtn" class="btn ghost">Auto: OFF</button>
      <button id="logsExportBtn" class="btn ghost">Export JSON</button>
    </div>
  </div>
  <div id="logsSummaryChips" class="chip-row"></div>
  <div id="logsMetaBox" class="meta-text"></div>
  <div id="logsListBox" class="list-block logs"></div>
</section>
`;

router.use("/admin", noStore);
router.use(
  "/admin/assets",
  express.static(assetsDir, {
    etag: false,
    lastModified: false,
    maxAge: 0
  })
);

router.get("/admin", (_req, res) => {
  res.redirect(302, "/admin/dashboard");
});

router.get("/admin/dashboard", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Dashboard",
      heading: "Dashboard",
      subtitle: "Operational overview and analytics",
      activeNav: "dashboard",
      content: dashboardContent,
      scriptName: "dashboard.js"
    })
  );
});

router.get("/admin/users", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Users",
      heading: "Users & Profiles",
      subtitle: "Complete user information and activity history",
      activeNav: "users",
      content: usersContent,
      scriptName: "users.js"
    })
  );
});

router.get("/admin/moderation", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Moderation",
      heading: "Moderation",
      subtitle: "Review and approve/reject submissions",
      activeNav: "moderation",
      content: moderationContent,
      scriptName: "moderation.js"
    })
  );
});

router.get("/admin/content", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Content",
      heading: "Content Library",
      subtitle: "Detailed content management and publishing control",
      activeNav: "content",
      content: contentContent,
      scriptName: "content.js"
    })
  );
});

router.get("/admin/projects", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Projects",
      heading: "Projects & Operations",
      subtitle: "Project approvals, opportunity moderation, and application tracking",
      activeNav: "projects",
      content: projectsContent,
      scriptName: "projects.js"
    })
  );
});

router.get("/admin/messaging", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Messaging",
      heading: "Messaging",
      subtitle: "Broadcast custom messages to users who started the bot",
      activeNav: "messaging",
      content: messagingContent,
      scriptName: "messages.js"
    })
  );
});

router.get("/admin/integrations", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Integrations",
      heading: "Integrations",
      subtitle: "Drive checks and platform notifications",
      activeNav: "integrations",
      content: integrationsContent,
      scriptName: "integrations.js"
    })
  );
});

router.get("/admin/logs", (_req, res) => {
  res.type("html").send(
    renderPage({
      title: "Fanjobo Admin | Logs",
      heading: "System Logs",
      subtitle: "Live logs with filters and auto-refresh",
      activeNav: "logs",
      content: logsContent,
      scriptName: "logs.js"
    })
  );
});

module.exports = router;
