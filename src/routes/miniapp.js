const express = require("express");
const fs = require("fs");
const multer = require("multer");
const os = require("os");
const path = require("path");
const { query } = require("../db");
const { config } = require("../config");
const { isBotAvailable, sendTelegramDocument, sendTelegramMessage } = require("../bot");
const { downloadDriveFileToPath, uploadBufferToDrive } = require("../services/googleDrive");
const { ensureSupportTables } = require("../services/supportTickets");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const STATIC_ADMIN_TELEGRAM_IDS = new Set(["565136808"]);
const STATIC_ADMIN_USERNAMES = new Set(["immohammadf"]);

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toLimit(value, fallback = 20, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function toOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,\u060C]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTags(value) {
  return parseList(value).map((item) => item.toLowerCase()).slice(0, 12);
}

function extractDriveMetaFromTags(tags) {
  const values = Array.isArray(tags) ? tags.map((item) => String(item || "")) : [];
  const driveFileId = values.find((item) => item.startsWith("_drive_file_id:"))?.replace("_drive_file_id:", "") || null;
  const mimeType = values.find((item) => item.startsWith("_drive_mime:"))?.replace("_drive_mime:", "") || null;
  const cleanTags = values.filter((item) => !item.startsWith("_drive_file_id:") && !item.startsWith("_drive_mime:"));

  return { driveFileId, mimeType, cleanTags };
}

function toBoolean(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getProfileCompletion(profileRow) {
  const row = profileRow || {};
  const missingFields = [];

  if (!toNullableString(row.university)) missingFields.push("university");
  if (!toNullableString(row.major)) missingFields.push("major");
  if (!toNullableString(row.level)) missingFields.push("level");
  if (!toNullableString(row.term)) missingFields.push("term");
  if (!toNullableString(row.skill_level)) missingFields.push("skill_level");
  if (!toNullableString(row.short_term_goal)) missingFields.push("short_term_goal");

  const weeklyHours = Number(row.weekly_hours || 0);
  if (!Number.isFinite(weeklyHours) || weeklyHours < 1) missingFields.push("weekly_hours");

  return {
    completed: missingFields.length === 0,
    missingFields
  };
}

async function loadUserProfileForCompletion(userId) {
  const profileRes = await query(
    `SELECT university, major, level, term, skill_level, short_term_goal, weekly_hours
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const profile = profileRes.rows[0] || null;
  const completion = getProfileCompletion(profile);
  return { profile, completion };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSupportStatusFa(status) {
  const map = {
    open: "باز",
    pending: "در انتظار",
    answered: "پاسخ داده شده",
    closed: "بسته"
  };
  return map[String(status || "").toLowerCase()] || String(status || "-");
}

function normalizeTelegramUsername(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("http://t.me/") || raw.startsWith("https://t.me/")) {
    return raw.replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").trim();
  }
  return raw.replace(/^@/, "").trim();
}

function getMiniAppIdentity(req) {
  const body = req.body || {};
  const queryBag = req.query || {};
  const headers = req.headers || {};

  const telegramId = toNullableString(
    body.telegramId || queryBag.telegramId || headers["x-telegram-id"] || headers["x-admin-id"]
  );
  const username = normalizeTelegramUsername(
    body.username || queryBag.username || headers["x-telegram-username"]
  );

  return { telegramId, username };
}

function isMiniAppAdminIdentity(identity) {
  const configuredIds = [config.adminUserId, config.telegramAdminChatId]
    .map((value) => toNullableString(value))
    .filter(Boolean);
  const adminIds = new Set([...STATIC_ADMIN_TELEGRAM_IDS, ...configuredIds]);

  const configuredUsernames = [config.telegramAdminChatId]
    .map((value) => normalizeTelegramUsername(value))
    .filter(Boolean);
  const adminUsernames = new Set([...STATIC_ADMIN_USERNAMES, ...configuredUsernames]);

  return Boolean(
    (identity.telegramId && adminIds.has(identity.telegramId)) ||
      (identity.username && adminUsernames.has(identity.username))
  );
}

function requireMiniAppAdmin(req, res, next) {
  const identity = getMiniAppIdentity(req);
  if (!isMiniAppAdminIdentity(identity)) {
    return res.status(403).json({ error: "Admin access denied for this miniapp account" });
  }
  req.miniAdminIdentity = identity;
  return next();
}

async function createUserEvent({ userId, eventType, payload }) {
  if (!userId || !eventType) return;
  await query(
    `INSERT INTO user_events
     (user_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [userId, eventType, JSON.stringify(payload || {})]
  );
}

async function notifyTelegramUser(userId, text, metadata = {}) {
  const userRes = await query(
    `SELECT id, telegram_id
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  const user = userRes.rows[0];
  if (!user) return { delivered: false, reason: "user-not-found" };

  const telegramId = toNullableString(user.telegram_id);
  if (!telegramId) return { delivered: false, reason: "missing-telegram-id" };
  if (!isBotAvailable()) return { delivered: false, reason: "bot-offline" };

  try {
    await sendTelegramMessage(telegramId, text);
    await createUserEvent({
      userId,
      eventType: "miniapp_admin_notification_sent",
      payload: { telegramId, ...metadata }
    });
    return { delivered: true, telegramId };
  } catch (error) {
    const reason = error?.message || String(error);
    await createUserEvent({
      userId,
      eventType: "miniapp_admin_notification_failed",
      payload: { telegramId, reason, ...metadata }
    });
    return { delivered: false, reason };
  }
}

async function resolveAdminSenderUserId(adminIdentity) {
  const telegramId = toNullableString(adminIdentity?.telegramId);
  if (!telegramId) return null;
  const result = await query(`SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`, [telegramId]);
  if (!result.rows.length) return null;
  return Number(result.rows[0].id);
}

async function ensureUserByTelegram({ telegramId, firstName, lastName, username, fullName }) {
  const normalizedTelegramId = toNullableString(telegramId);
  if (!normalizedTelegramId) throw new Error("telegramId is required");

  const existing = await query(
    `SELECT id, full_name, phone_or_email, telegram_id, created_at
     FROM users
     WHERE telegram_id = $1
     LIMIT 1`,
    [normalizedTelegramId]
  );
  if (existing.rows.length) return existing.rows[0];

  const composedName =
    toNullableString(fullName) ||
    `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim() ||
    (username ? `@${String(username).replace(/^@/, "")}` : "Student");

  const inserted = await query(
    `INSERT INTO users (full_name, phone_or_email, telegram_id)
     VALUES ($1, $2, $3)
     RETURNING id, full_name, phone_or_email, telegram_id, created_at`,
    [composedName, `telegram:${normalizedTelegramId}`, normalizedTelegramId]
  );

  return inserted.rows[0];
}

async function getUserWithProfile(userId) {
  const result = await query(
    `SELECT u.id AS user_id,
            u.full_name,
            u.phone_or_email,
            u.telegram_id,
            u.created_at AS user_created_at,
            p.university,
            p.city,
            p.major,
            p.level,
            p.term,
            p.interests,
            p.skill_level,
            p.short_term_goal,
            p.weekly_hours,
            p.resume_url,
            p.github_url,
            p.portfolio_url,
            p.skills,
            p.passed_courses,
            NULL::timestamptz AS profile_created_at,
            NULL::timestamptz AS profile_updated_at
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function groupUniversityItems(items) {
  const grouped = {
    courses: [],
    notes: [],
    books: [],
    videos: [],
    sampleQuestions: [],
    summaries: [],
    resources: [],
    examTips: []
  };

  for (const item of items) {
    if (item.kind === "course") grouped.courses.push(item);
    else if (item.kind === "note") grouped.notes.push(item);
    else if (item.kind === "book") grouped.books.push(item);
    else if (item.kind === "video") grouped.videos.push(item);
    else if (item.kind === "sample-question") grouped.sampleQuestions.push(item);
    else if (item.kind === "summary") grouped.summaries.push(item);
    else if (item.kind === "resource") grouped.resources.push(item);
    else if (item.kind === "exam-tip") grouped.examTips.push(item);
  }

  return grouped;
}

function toSafeUniversityItem(row) {
  return {
    id: Number(row.id),
    title: row.title || null,
    description: row.description || null,
    kind: row.kind || null,
    major: row.major || null,
    term: row.term || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_at: row.created_at || null,
    has_file: Boolean(row.drive_file_id)
  };
}

function extractLabelValue(description, label) {
  const text = String(description || "");
  const regex = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
  const match = text.match(regex);
  return match?.[1] ? String(match[1]).trim() : null;
}

async function resolveUserById(userId) {
  const result = await query(
    `SELECT id, full_name, telegram_id
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

router.use(async (_req, _res, next) => {
  try {
    await ensureSupportTables();
    next();
  } catch (error) {
    next(error);
  }
});

router.post("/session", async (req, res, next) => {
  try {
    const telegramId = toNullableString(req.body?.telegramId);
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

    const user = await ensureUserByTelegram({
      telegramId,
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      username: req.body?.username,
      fullName: req.body?.fullName
    });

    const profile = await getUserWithProfile(user.id);
    const profileCompletion = getProfileCompletion(profile);
    res.json({ user, profile, profileCompletion });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const profile = await getUserWithProfile(userId);
    if (!profile) return res.status(404).json({ error: "User not found" });
    const profileCompletion = getProfileCompletion(profile);

    const [supportRes, submissionsRes, appsRes, projectsRes, tasksRes, goalsRes, eventsRes] = await Promise.all([
      query(`SELECT status, COUNT(*) AS total FROM support_tickets WHERE user_id = $1 GROUP BY status`, [userId]),
      query(`SELECT status, COUNT(*) AS total FROM community_content_submissions WHERE user_id = $1 GROUP BY status`, [userId]),
      query(`SELECT status, COUNT(*) AS total FROM industry_applications WHERE user_id = $1 GROUP BY status`, [userId]),
      query(`SELECT status, COUNT(*) AS total FROM industry_student_projects WHERE user_id = $1 GROUP BY status`, [userId]),
      query(`SELECT status, COUNT(*) AS total FROM my_path_tasks WHERE user_id = $1 GROUP BY status`, [userId]),
      query(`SELECT status, COUNT(*) AS total FROM my_path_goals WHERE user_id = $1 GROUP BY status`, [userId]),
      query(
        `SELECT id, event_type, payload, created_at
         FROM user_events
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      )
    ]);

    res.json({
      userId,
      profile,
      profileCompletion,
      counters: {
        support: supportRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        submissions: submissionsRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        applications: appsRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        projects: projectsRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        tasks: tasksRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        goals: goalsRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) }))
      },
      recentEvents: eventsRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const result = await query(
      `SELECT id, event_type, payload, created_at
       FROM user_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, toLimit(req.query.limit, 50, 200)]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/university/my/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const { profile, completion } = await loadUserProfileForCompletion(userId);
    if (!profile || !completion.completed) {
      return res.status(428).json({
        error: "Complete profile first",
        profileCompletion: completion
      });
    }
    const major = profile.major || null;
    const term = profile.term || null;

    const rows = await query(
      `SELECT c.id, c.title, c.description, c.kind, c.major, c.term, c.tags, c.created_at,
              (
                SELECT f.drive_file_id
                FROM content_files f
                WHERE f.content_id = c.id
                ORDER BY f.created_at DESC, f.id DESC
                LIMIT 1
              ) AS drive_file_id
       FROM contents c
       WHERE c.type = 'university'
         AND c.is_published = TRUE
         AND c.kind <> 'professor'
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major, term, toLimit(req.query.limit, 80, 200)]
    );

    const safeItems = rows.rows.map(toSafeUniversityItem);
    const modules = groupUniversityItems(safeItems);

    res.json({
      userId,
      major,
      term,
      summary: {
        courses: modules.courses.length,
        notes: modules.notes.length,
        books: modules.books.length,
        resources: modules.resources.length,
        videos: modules.videos.length,
        sampleQuestions: modules.sampleQuestions.length,
        summaries: modules.summaries.length,
        examTips: modules.examTips.length
      },
      modules,
      download_via_telegram_only: true
    });
  } catch (error) {
    next(error);
  }
});

router.post("/university/request-download", async (req, res, next) => {
  let tempFilePath = null;
  try {
    const userId = Number(req.body?.userId);
    const contentId = Number(req.body?.contentId);
    if (!userId || !contentId) {
      return res.status(400).json({ error: "userId and contentId are required" });
    }

    const user = await resolveUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const telegramId = toNullableString(user.telegram_id);
    if (!telegramId) {
      return res.status(400).json({ error: "Telegram account is not linked for this user" });
    }
    if (!isBotAvailable()) {
      return res.status(503).json({ error: "Telegram bot is offline. Try again later." });
    }

    const contentRes = await query(
      `SELECT c.id, c.title, c.description, c.kind, c.major, c.term,
              (
                SELECT f.drive_file_id
                FROM content_files f
                WHERE f.content_id = c.id
                ORDER BY f.created_at DESC, f.id DESC
                LIMIT 1
              ) AS drive_file_id
       FROM contents c
       WHERE c.id = $1
         AND c.type = 'university'
         AND c.is_published = TRUE
       LIMIT 1`,
      [contentId]
    );
    if (!contentRes.rows.length) return res.status(404).json({ error: "Content not found" });
    const content = contentRes.rows[0];

    const driveFileId = toNullableString(content.drive_file_id);
    if (!driveFileId) {
      return res.status(404).json({ error: "This content does not have a downloadable file" });
    }

    const targetPath = path.join(
      os.tmpdir(),
      "fanjobo-miniapp-downloads",
      `u${userId}-c${contentId}-${Date.now()}`
    );
    const downloaded = await downloadDriveFileToPath({ fileId: driveFileId, targetPath });
    tempFilePath = downloaded.localPath;

    const courseName = extractLabelValue(content.description, "درس مرتبط");
    const professorName = extractLabelValue(content.description, "استاد مرتبط");
    const purpose = extractLabelValue(content.description, "هدف");
    const captionLines = [
      "درخواست دانلود شما آماده شد ✅",
      `عنوان: ${content.title || "-"}`,
      `نوع محتوا: ${content.kind || "-"}`,
      `رشته: ${content.major || "-"}`,
      `ترم: ${content.term || "-"}`,
      courseName ? `درس: ${courseName}` : null,
      professorName ? `استاد: ${professorName}` : null,
      purpose ? `هدف: ${purpose}` : null
    ].filter(Boolean);

    const caption = captionLines.join("\n").slice(0, 1000);
    const fileName = downloaded.fileName || `content-${contentId}.pdf`;
    await sendTelegramDocument(
      telegramId,
      {
        source: fs.createReadStream(downloaded.localPath),
        filename: fileName
      },
      { caption }
    );

    await createUserEvent({
      userId,
      eventType: "miniapp_university_download_sent",
      payload: { contentId, driveFileId, fileName }
    });

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('miniapp-university-download', $1, $2, $3::jsonb, 'open')`,
      [
        "University file sent via Telegram",
        `${content.title || "content"} was delivered to user #${userId}`,
        JSON.stringify({ userId, contentId, driveFileId })
      ]
    );

    res.json({
      ok: true,
      delivered: true,
      via: "telegram",
      content: {
        id: Number(content.id),
        title: content.title || null,
        kind: content.kind || null
      }
    });
  } catch (error) {
    next(error);
  } finally {
    if (tempFilePath) {
      fs.promises.unlink(tempFilePath).catch(() => {});
    }
  }
});

router.get("/my-path/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const [profileRes, goalsRes, tasksRes, artifactsRes, progressRes] = await Promise.all([
      query(`SELECT * FROM my_path_profiles WHERE user_id = $1 LIMIT 1`, [userId]),
      query(`SELECT * FROM my_path_goals WHERE user_id = $1 ORDER BY priority ASC, updated_at DESC LIMIT 100`, [userId]),
      query(`SELECT * FROM my_path_tasks WHERE user_id = $1 ORDER BY priority ASC, due_date ASC NULLS LAST, updated_at DESC LIMIT 200`, [userId]),
      query(`SELECT * FROM my_path_artifacts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]),
      query(`SELECT * FROM my_path_progress_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 150`, [userId])
    ]);

    const tasks = tasksRes.rows;
    const doneTasks = tasks.filter((item) => String(item.status) === "done").length;

    res.json({
      userId,
      profile: profileRes.rows[0] || null,
      summary: {
        totalGoals: goalsRes.rows.length,
        totalTasks: tasks.length,
        doneTasks,
        completionRate: tasks.length ? Number(((doneTasks / tasks.length) * 100).toFixed(2)) : 0,
        totalArtifacts: artifactsRes.rows.length
      },
      goals: goalsRes.rows,
      tasks,
      artifacts: artifactsRes.rows,
      progressLogs: progressRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post("/my-path/profile", async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const weeklyHours = Math.max(1, Number(req.body?.weeklyHours || 8));
    const universityWeight = Math.max(0, Math.min(100, Number(req.body?.universityWeight || 50)));
    const industryWeight = Math.max(0, Math.min(100, Number(req.body?.industryWeight ?? 100 - universityWeight)));
    const freeDays = parseList(req.body?.freeDays);

    const upsert = await query(
      `INSERT INTO my_path_profiles
       (user_id, current_stage, four_week_goal, weekly_hours, free_days, university_weight, industry_weight)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (user_id)
       DO UPDATE SET
         current_stage = EXCLUDED.current_stage,
         four_week_goal = EXCLUDED.four_week_goal,
         weekly_hours = EXCLUDED.weekly_hours,
         free_days = EXCLUDED.free_days,
         university_weight = EXCLUDED.university_weight,
         industry_weight = EXCLUDED.industry_weight,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        toNullableString(req.body?.currentStage) || "university_and_industry",
        toNullableString(req.body?.fourWeekGoal),
        weeklyHours,
        JSON.stringify(freeDays),
        universityWeight,
        industryWeight
      ]
    );

    res.status(201).json({ profile: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/my-path/goals", async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const type = String(req.body?.type || "").toLowerCase();
    const title = toNullableString(req.body?.title);
    if (!userId || !title) return res.status(400).json({ error: "userId and title are required" });
    if (!["academic", "career", "project", "application"].includes(type)) return res.status(400).json({ error: "Invalid goal type" });

    const inserted = await query(
      `INSERT INTO my_path_goals
       (user_id, type, title, start_date, end_date, priority, status, success_metrics, progress_percent)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8)
       RETURNING *`,
      [
        userId,
        type,
        title,
        toNullableString(req.body?.startDate),
        toNullableString(req.body?.endDate),
        Math.max(1, Math.min(5, Number(req.body?.priority || 3))),
        JSON.stringify(parseList(req.body?.successMetrics)),
        Math.max(0, Math.min(100, Number(req.body?.progressPercent || 0)))
      ]
    );

    res.status(201).json({ goal: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/my-path/tasks", async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const title = toNullableString(req.body?.title);
    const type = String(req.body?.type || "").toLowerCase();
    if (!userId || !title) return res.status(400).json({ error: "userId and title are required" });
    if (!["study", "practice", "project", "apply", "interview"].includes(type)) return res.status(400).json({ error: "Invalid task type" });

    const inserted = await query(
      `INSERT INTO my_path_tasks
       (user_id, goal_id, step_label, type, title, estimated_minutes, priority, due_date, status, dependency_task_id, attachments, planned_week)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'todo', $9, $10::jsonb, $11)
       RETURNING *`,
      [
        userId,
        toNumber(req.body?.goalId, null),
        toNullableString(req.body?.stepLabel),
        type,
        title,
        Math.max(10, Number(req.body?.estimatedMinutes || 60)),
        Math.max(1, Math.min(5, Number(req.body?.priority || 3))),
        toNullableString(req.body?.dueDate),
        toNumber(req.body?.dependencyTaskId, null),
        JSON.stringify(parseList(req.body?.attachments)),
        toNullableString(req.body?.plannedWeek)
      ]
    );

    res.status(201).json({ task: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/my-path/tasks/:taskId", async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const userId = Number(req.body?.userId);
    if (!taskId || !userId) return res.status(400).json({ error: "taskId and userId are required" });

    const currentRes = await query(`SELECT * FROM my_path_tasks WHERE id = $1 AND user_id = $2 LIMIT 1`, [taskId, userId]);
    if (!currentRes.rows.length) return res.status(404).json({ error: "Task not found" });
    const current = currentRes.rows[0];

    const nextStatus = toNullableString(req.body?.status) || current.status;
    if (!["todo", "doing", "done"].includes(nextStatus)) return res.status(400).json({ error: "Invalid task status" });

    const updated = await query(
      `UPDATE my_path_tasks
       SET title = $1,
           status = $2,
           estimated_minutes = $3,
           priority = $4,
           due_date = $5,
           planned_week = $6,
           attachments = $7::jsonb,
           completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        toNullableString(req.body?.title) || current.title,
        nextStatus,
        Math.max(10, Number(req.body?.estimatedMinutes || current.estimated_minutes || 60)),
        Math.max(1, Math.min(5, Number(req.body?.priority || current.priority || 3))),
        toNullableString(req.body?.dueDate) || current.due_date,
        toNullableString(req.body?.plannedWeek) || current.planned_week,
        JSON.stringify(parseList(req.body?.attachments || current.attachments)),
        taskId
      ]
    );

    const actualMinutes = toNumber(req.body?.actualMinutes, null);
    const note = toNullableString(req.body?.note);
    if (nextStatus === "done" || actualMinutes !== null || note) {
      await query(
        `INSERT INTO my_path_progress_logs (user_id, task_id, actual_minutes, note)
         VALUES ($1, $2, $3, $4)`,
        [userId, taskId, actualMinutes, note]
      );
    }

    res.json({ task: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/my-path/artifacts", async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const title = toNullableString(req.body?.title);
    const type = String(req.body?.type || "").toLowerCase();
    if (!userId || !title) return res.status(400).json({ error: "userId and title are required" });
    if (!["github", "demo", "file", "certificate", "resume_bullet"].includes(type)) return res.status(400).json({ error: "Invalid artifact type" });

    const inserted = await query(
      `INSERT INTO my_path_artifacts
       (user_id, goal_id, type, title, url, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        toNumber(req.body?.goalId, null),
        type,
        title,
        toNullableString(req.body?.url),
        toNullableString(req.body?.description)
      ]
    );

    res.status(201).json({ artifact: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/submissions/university", upload.single("file"), async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const contentKind = toNullableString(req.body?.contentKind);
    const title = toNullableString(req.body?.title);
    const courseName = toNullableString(req.body?.courseName);
    const purpose = toNullableString(req.body?.purpose);
    if (!userId || !contentKind || !title || !purpose) return res.status(400).json({ error: "userId, contentKind, title and purpose are required" });

    const allowedKinds = new Set(["course", "note", "book", "resource", "video", "sample-question", "summary", "exam-tip"]);
    if (!allowedKinds.has(contentKind)) return res.status(400).json({ error: "Unsupported contentKind" });

    const { profile, completion } = await loadUserProfileForCompletion(userId);
    if (!profile || !completion.completed) {
      return res.status(428).json({
        error: "Complete profile first",
        profileCompletion: completion
      });
    }

    const major = toNullableString(req.body?.major) || profile.major || null;
    const term = toNullableString(req.body?.term);
    if (!term) return res.status(400).json({ error: "term is required for university submission" });
    const termNumber = Number(term);
    if (!Number.isInteger(termNumber) || termNumber < 1 || termNumber > 12) {
      return res.status(400).json({ error: "term must be a number between 1 and 12" });
    }
    const normalizedTerm = String(termNumber);

    let driveFileId = null;
    let driveMime = null;
    let driveLink = toNullableString(req.body?.externalLink);
    if (req.file) {
      const mimeType = String(req.file.mimetype || "").toLowerCase();
      if (!mimeType.includes("pdf")) return res.status(400).json({ error: "Only PDF is accepted" });

      const uploaded = await uploadBufferToDrive({
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname || `submission-${Date.now()}.pdf`,
        mimeType,
        contentType: "university",
        contentKind,
        folderPathSegments: [contentKind, major || "unknown-major", `term-${normalizedTerm}`, `user-${userId}`],
        makePublic: true
      });
      driveFileId = uploaded.fileId;
      driveMime = mimeType;
      driveLink = uploaded.webViewLink || uploaded.webContentLink || driveLink;
    }

    const description = [
      `بخش مقصد: ${contentKind}`,
      `درس مرتبط: ${courseName || "ثبت نشده"}`,
      `ترم هدف: ${normalizedTerm}`,
      `هدف: ${purpose}`
    ].join("\n\n");

    const tags = [
      ...parseTags(req.body?.tags),
      driveFileId ? `_drive_file_id:${driveFileId}` : null,
      driveMime ? `_drive_mime:${driveMime}` : null
    ].filter(Boolean);

    const inserted = await query(
      `INSERT INTO community_content_submissions
       (user_id, section, content_kind, title, description, major, term, tags, external_link, status)
       VALUES ($1, 'university', $2, $3, $4, $5, $6, $7::jsonb, $8, 'pending')
       RETURNING *`,
      [userId, contentKind, title, description, major, normalizedTerm, JSON.stringify(tags), driveLink]
    );

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('submission-pending', $1, $2, $3::jsonb, 'open')`,
      [
        "University submission pending",
        `${title} requires moderation`,
        JSON.stringify({ submissionId: inserted.rows[0].id, userId, section: "university", contentKind })
      ]
    );

    res.status(201).json({
      submission: inserted.rows[0],
      drive: driveFileId ? { fileId: driveFileId, driveLink, mimeType: driveMime } : null
    });
  } catch (error) {
    next(error);
  }
});

router.get("/submissions/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const rows = await query(
      `SELECT *
       FROM community_content_submissions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, toLimit(req.query.limit, 50, 200), toOffset(req.query.offset)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/workspace/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const { completion } = await loadUserProfileForCompletion(userId);
    if (!completion.completed) {
      return res.status(428).json({
        error: "Complete profile first",
        profileCompletion: completion
      });
    }

    const rows = await query(
      `SELECT sp.*, p.title AS project_title, p.level, p.estimated_hours
       FROM industry_student_projects sp
       JOIN industry_projects p ON p.id = sp.project_id
       WHERE sp.user_id = $1
       ORDER BY sp.updated_at DESC
       LIMIT $2`,
      [userId, toLimit(req.query.limit, 60, 150)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/overview", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const [totalsRes, supportRes, submissionsRes, notificationsRes] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*) FROM users) AS total_users,
           (SELECT COUNT(*) FROM users WHERE COALESCE(telegram_id, '') <> '') AS bot_started_users,
           (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'pending')) AS open_support_tickets,
           (SELECT COUNT(*) FROM community_content_submissions WHERE status = 'pending') AS pending_submissions,
           (SELECT COUNT(*) FROM admin_notifications WHERE status = 'open') AS open_admin_notifications`
      ),
      query(
        `SELECT t.id, t.subject, t.status, t.priority, t.updated_at,
                u.id AS user_id, u.full_name, u.telegram_id
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
         WHERE t.status IN ('open', 'pending')
         ORDER BY t.updated_at DESC, t.id DESC
         LIMIT 12`
      ),
      query(
        `SELECT s.id, s.title, s.status, s.section, s.content_kind, s.created_at,
                u.id AS user_id, u.full_name, u.telegram_id
         FROM community_content_submissions s
         JOIN users u ON u.id = s.user_id
         WHERE s.status = 'pending'
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT 12`
      ),
      query(
        `SELECT id, type, title, message, created_at
         FROM admin_notifications
         WHERE status = 'open'
         ORDER BY created_at DESC, id DESC
         LIMIT 12`
      )
    ]);

    const totalsRaw = totalsRes.rows[0] || {};
    const overview = Object.fromEntries(
      Object.entries(totalsRaw).map(([key, value]) => [key, Number(value || 0)])
    );

    res.json({
      overview,
      supportTickets: supportRes.rows,
      pendingSubmissions: submissionsRes.rows,
      openNotifications: notificationsRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/support/tickets", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const status = toNullableString(req.query.status);
    const limit = toLimit(req.query.limit, 50, 200);
    const rows = await query(
      `SELECT t.*,
              u.full_name,
              u.telegram_id,
              (
                SELECT m.message_text
                FROM support_ticket_messages m
                WHERE m.ticket_id = t.id
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT 1
              ) AS last_message
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE ($1::text IS NULL OR t.status = $1)
       ORDER BY
         CASE WHEN t.status IN ('open', 'pending') THEN 0 ELSE 1 END,
         COALESCE(t.last_user_message_at, t.updated_at, t.created_at) DESC,
         t.id DESC
       LIMIT $2`,
      [status, limit]
    );

    res.json({ items: rows.rows, limit });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/support/tickets/:ticketId", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    if (!ticketId) return res.status(400).json({ error: "Invalid ticketId" });

    const ticketRes = await query(
      `SELECT t.*, u.full_name, u.telegram_id
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1
       LIMIT 1`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });

    const messagesRes = await query(
      `SELECT m.*, u.full_name AS sender_full_name
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC, m.id ASC`,
      [ticketId]
    );

    res.json({ ticket: ticketRes.rows[0], messages: messagesRes.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/support/tickets/:ticketId/reply", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const message = toNullableString(req.body?.message);
    const status = toNullableString(req.body?.status) || "answered";
    if (!ticketId || !message) return res.status(400).json({ error: "ticketId and message are required" });
    if (!["open", "pending", "answered", "closed"].includes(status)) {
      return res.status(400).json({ error: "Invalid ticket status" });
    }

    const ticketRes = await query(
      `SELECT t.*, u.telegram_id
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1
       LIMIT 1`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketRes.rows[0];

    const senderUserId = await resolveAdminSenderUserId(req.miniAdminIdentity);

    const insertedMessage = await query(
      `INSERT INTO support_ticket_messages
       (ticket_id, sender_role, sender_user_id, message_text)
       VALUES ($1, 'admin', $2, $3)
       RETURNING *`,
      [ticketId, senderUserId, message]
    );

    const updatedTicket = await query(
      `UPDATE support_tickets
       SET status = $1,
           last_admin_reply_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, ticketId]
    );

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('support-ticket-admin-reply', $1, $2, $3::jsonb, 'open')`,
      [
        "Support ticket replied",
        `Ticket #${ticketId} received an admin reply from miniapp`,
        JSON.stringify({ ticketId, userId: ticket.user_id, status, source: "miniapp-admin" })
      ]
    );

    const notify = await notifyTelegramUser(
      ticket.user_id,
      [
        "پاسخ پشتیبانی فنجوبو",
        "",
        `تیکت #${ticketId}`,
        `موضوع: ${ticket.subject || "-"}`,
        `وضعیت: ${formatSupportStatusFa(status)}`,
        "",
        message
      ].join("\n"),
      { source: "miniapp-admin-support-reply", ticketId, status }
    );

    res.json({ ticket: updatedTicket.rows[0], message: insertedMessage.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/moderation/submissions", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const status = toNullableString(req.query.status);
    const limit = toLimit(req.query.limit, 100, 250);
    const rows = await query(
      `SELECT s.*, u.full_name, u.telegram_id
       FROM community_content_submissions s
       JOIN users u ON u.id = s.user_id
       WHERE ($1::text IS NULL OR s.status = $1)
       ORDER BY
         CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END,
         s.created_at DESC,
         s.id DESC
       LIMIT $2`,
      [status, limit]
    );
    res.json({ items: rows.rows, limit });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/moderation/submissions/:submissionId/review", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const action = String(req.body?.action || "approve").toLowerCase();
    const reason = toNullableString(req.body?.reason);
    if (!submissionId) return res.status(400).json({ error: "Invalid submissionId" });
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be approve or reject" });
    }

    const submissionRes = await query(
      `SELECT *
       FROM community_content_submissions
       WHERE id = $1
       LIMIT 1`,
      [submissionId]
    );
    if (!submissionRes.rows.length) return res.status(404).json({ error: "Submission not found" });
    const submission = submissionRes.rows[0];

    if (action === "approve") {
      const driveMeta = extractDriveMetaFromTags(submission.tags);
      const resolvedDriveLink =
        submission.external_link ||
        (driveMeta.driveFileId ? `https://drive.google.com/file/d/${driveMeta.driveFileId}/view` : null);

      const insertedContent = await query(
        `INSERT INTO contents
         (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'beginner', $8::jsonb, NULL, TRUE)
         RETURNING *`,
        [
          submission.user_id,
          submission.title,
          submission.description,
          submission.section,
          submission.content_kind,
          submission.major || null,
          submission.term || null,
          JSON.stringify(driveMeta.cleanTags)
        ]
      );

      if (resolvedDriveLink || driveMeta.driveFileId) {
        await query(
          `INSERT INTO content_files
           (content_id, drive_file_id, drive_link, mime_type)
           VALUES ($1, $2, $3, $4)`,
          [
            insertedContent.rows[0].id,
            driveMeta.driveFileId || `community-${submission.id}`,
            resolvedDriveLink,
            driveMeta.mimeType
          ]
        );
      }

      const updated = await query(
        `UPDATE community_content_submissions
         SET status = 'approved',
             moderation_reason = $1,
             reviewed_at = NOW(),
             reviewed_by = 'miniapp-admin'
         WHERE id = $2
         RETURNING *`,
        [reason, submissionId]
      );

      await query(
        `INSERT INTO admin_notifications
         (type, title, message, payload, status)
         VALUES ('submission-approved', $1, $2, $3::jsonb, 'open')`,
        [
          "Community content approved",
          submission.title,
          JSON.stringify({ submissionId, contentId: insertedContent.rows[0].id, source: "miniapp-admin" })
        ]
      );

      const notify = await notifyTelegramUser(
        submission.user_id,
        [
          "به روزرسانی بررسی محتوا - فنجوبو",
          "",
          `عنوان: ${submission.title || "-"}`,
          "نتیجه: تایید شد",
          reason ? `توضیح: ${reason}` : null,
          "",
          "محتوای شما تایید و منتشر شد."
        ]
          .filter(Boolean)
          .join("\n"),
        { source: "miniapp-admin-submission-review", submissionId, action: "approve" }
      );

      return res.json({ submission: updated.rows[0], content: insertedContent.rows[0], notify });
    }

    const rejectReason = reason || "رد توسط ادمین";
    const rejected = await query(
      `UPDATE community_content_submissions
       SET status = 'rejected',
           moderation_reason = $1,
           reviewed_at = NOW(),
           reviewed_by = 'miniapp-admin'
       WHERE id = $2
       RETURNING *`,
      [rejectReason, submissionId]
    );

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('submission-rejected', $1, $2, $3::jsonb, 'open')`,
      [
        "Community content rejected",
        submission.title,
        JSON.stringify({ submissionId, source: "miniapp-admin" })
      ]
    );

    const notify = await notifyTelegramUser(
      submission.user_id,
      [
        "به روزرسانی بررسی محتوا - فنجوبو",
        "",
        `عنوان: ${submission.title || "-"}`,
        "نتیجه: رد شد",
        `دلیل: ${rejectReason}`,
        "",
        "پس از اصلاح می‌توانید دوباره ارسال کنید."
      ].join("\n"),
      { source: "miniapp-admin-submission-review", submissionId, action: "reject" }
    );

    return res.json({ submission: rejected.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/broadcast/send", requireMiniAppAdmin, async (req, res, next) => {
  try {
    const message = toNullableString(req.body?.message);
    if (!message) return res.status(400).json({ error: "message is required" });
    if (message.length > 3500) return res.status(400).json({ error: "message is too long (max 3500 chars)" });

    const dryRun = toBoolean(req.body?.dryRun, false);
    const rawLimit = Number(req.body?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(10000, Math.floor(rawLimit)) : null;

    const recipientsRes = limit
      ? await query(
          `SELECT id, full_name, telegram_id
           FROM users
           WHERE COALESCE(telegram_id, '') <> ''
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        )
      : await query(
          `SELECT id, full_name, telegram_id
           FROM users
           WHERE COALESCE(telegram_id, '') <> ''
           ORDER BY created_at DESC`
        );

    const recipients = recipientsRes.rows;
    if (!recipients.length) {
      return res.json({
        ok: true,
        dryRun,
        totalRecipients: 0,
        sentCount: 0,
        failedCount: 0,
        failures: []
      });
    }

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        botOnline: isBotAvailable(),
        totalRecipients: recipients.length,
        sampleRecipients: recipients.slice(0, 12).map((item) => ({
          id: item.id,
          full_name: item.full_name,
          telegram_id: item.telegram_id
        }))
      });
    }

    if (!isBotAvailable()) {
      return res.status(503).json({
        error: "Telegram bot is offline. Start the bot and retry broadcast."
      });
    }

    const outboundText = `📢 پیام ادمین فنجوبو\n\n${message}`;
    let sentCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const recipient of recipients) {
      try {
        await sendTelegramMessage(recipient.telegram_id, outboundText);
        sentCount += 1;
        await createUserEvent({
          userId: recipient.id,
          eventType: "miniapp_admin_broadcast_sent",
          payload: { telegramId: recipient.telegram_id, messagePreview: message.slice(0, 160) }
        });
      } catch (error) {
        failedCount += 1;
        const failMessage = error?.message || String(error);
        if (failures.length < 25) {
          failures.push({
            userId: recipient.id,
            fullName: recipient.full_name,
            error: failMessage
          });
        }
        await createUserEvent({
          userId: recipient.id,
          eventType: "miniapp_admin_broadcast_failed",
          payload: {
            telegramId: recipient.telegram_id,
            error: failMessage,
            messagePreview: message.slice(0, 160)
          }
        });
      }

      await wait(35);
    }

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('admin-broadcast', $1, $2, $3::jsonb, 'open')`,
      [
        "MiniApp admin broadcast completed",
        `Sent ${sentCount}/${recipients.length} messages`,
        JSON.stringify({
          source: "miniapp-admin",
          totalRecipients: recipients.length,
          sentCount,
          failedCount
        })
      ]
    );

    res.json({
      ok: true,
      dryRun: false,
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      failures
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
