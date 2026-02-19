const express = require("express");
const { query } = require("../db");
const { config } = require("../config");
const { getLogs } = require("../services/logger");
const { testDriveReadWrite } = require("../services/googleDrive");
const { isBotAvailable, sendTelegramMessage } = require("../bot");
const { ensureSupportTables } = require("../services/supportTickets");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!config.adminApiKey) {
    return res.status(503).json({ error: "ADMIN_API_KEY is not configured" });
  }

  const token = req.headers["x-admin-key"];
  if (!token || token !== config.adminApiKey) {
    return res.status(401).json({ error: "Unauthorized admin request" });
  }

  if (config.adminUserId) {
    const adminId = String(req.headers["x-admin-id"] || "").trim();
    if (!adminId || adminId !== String(config.adminUserId)) {
      return res.status(401).json({ error: "Unauthorized admin id" });
    }
  }

  return next();
}

function toLimit(raw, fallback = 50, max = 200) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSkillsArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      if (!name) return null;
      const parsedScore = Number(item.score);
      const score = Number.isFinite(parsedScore) ? Math.min(10, Math.max(1, parsedScore)) : 5;
      return { name, score };
    })
    .filter(Boolean);
}

function extractDriveMetaFromTags(tags) {
  const values = Array.isArray(tags) ? tags.map((item) => String(item || "")) : [];
  const driveFileId = values.find((item) => item.startsWith("_drive_file_id:"))?.replace("_drive_file_id:", "") || null;
  const mimeType = values.find((item) => item.startsWith("_drive_mime:"))?.replace("_drive_mime:", "") || null;
  const cleanTags = values.filter((item) => !item.startsWith("_drive_file_id:") && !item.startsWith("_drive_mime:"));

  return { driveFileId, mimeType, cleanTags };
}

async function createNotification({ type, title, message, payload }) {
  await query(
    `INSERT INTO admin_notifications
     (type, title, message, payload, status)
     VALUES ($1, $2, $3, $4::jsonb, 'open')`,
    [type, title, message, JSON.stringify(payload || {})]
  );
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

function toBoolean(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSubmissionDecisionMessage(submission, action, reason) {
  const approved = action === "approve";
  const lines = [
    "به روزرسانی بررسی محتوا - فنجوبو",
    "",
    `عنوان: ${submission.title || "-"}`,
    `نتیجه: ${approved ? "تایید شد" : "رد شد"}`
  ];

  const normalizedReason = toNullableString(reason);
  if (normalizedReason) {
    lines.push(`دلیل: ${normalizedReason}`);
  }

  lines.push("", "برای مشاهده جزئیات وارد ربات فنجوبو شوید.");
  return lines.join("\n");
}

async function notifyTelegramUser(userId, text, metadata = {}) {
  const userRes = await query(
    `SELECT id, full_name, telegram_id
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  const user = userRes.rows[0];
  if (!user) {
    return { delivered: false, reason: "user-not-found" };
  }

  const telegramId = toNullableString(user.telegram_id);
  if (!telegramId) {
    await createUserEvent({
      userId,
      eventType: "admin_telegram_notification_skipped",
      payload: { reason: "missing-telegram-id", ...metadata }
    });
    return { delivered: false, reason: "missing-telegram-id" };
  }

  if (!isBotAvailable()) {
    await createUserEvent({
      userId,
      eventType: "admin_telegram_notification_failed",
      payload: { reason: "bot-offline", ...metadata }
    });
    return { delivered: false, reason: "bot-offline" };
  }

  try {
    await sendTelegramMessage(telegramId, text);
    await createUserEvent({
      userId,
      eventType: "admin_telegram_notification_sent",
      payload: { telegramId, ...metadata }
    });
    return { delivered: true, telegramId };
  } catch (error) {
    const message = error?.message || String(error);
    await createUserEvent({
      userId,
      eventType: "admin_telegram_notification_failed",
      payload: { telegramId, error: message, ...metadata }
    });
    return { delivered: false, reason: message };
  }
}

async function notifySubmissionDecision(submission, action, reason) {
  return notifyTelegramUser(
    submission.user_id,
    buildSubmissionDecisionMessage(submission, action, reason),
    {
      submissionId: submission.id,
      action,
      reason: toNullableString(reason)
    }
  );
}

function formatSupportStatus(status) {
  const map = {
    open: "باز",
    pending: "در انتظار",
    answered: "پاسخ داده شده",
    closed: "بسته"
  };
  return map[String(status || "").toLowerCase()] || String(status || "-");
}

function formatIndustryApplicationStatus(status) {
  const map = {
    draft: "پیش نویس",
    submitted: "ارسال شده",
    viewed: "بررسی اولیه",
    interview: "مصاحبه",
    rejected: "رد شده",
    accepted: "پذیرفته شده"
  };
  return map[String(status || "").toLowerCase()] || String(status || "-");
}

function formatGenericStatusFa(status) {
  const map = {
    open: "باز",
    closed: "بسته",
    pending: "در انتظار",
    approved: "تایید شده",
    rejected: "رد شده",
    answered: "پاسخ داده شده",
    submitted: "ارسال شده",
    viewed: "بررسی اولیه",
    interview: "مصاحبه",
    accepted: "پذیرفته شده",
    draft: "پیش نویس",
    in_progress: "در حال انجام",
    completed: "تکمیل شده",
    paused: "متوقف"
  };
  return map[String(status || "").toLowerCase()] || String(status || "-");
}

function buildSupportStatusUpdateMessage(ticket, status, note) {
  const lines = [
    "به روزرسانی تیکت پشتیبانی",
    "",
    `تیکت #${ticket.id}`,
    `موضوع: ${ticket.subject || "-"}`,
    `وضعیت: ${formatSupportStatus(status)}`
  ];

  const normalizedNote = toNullableString(note);
  if (normalizedNote) {
    lines.push("", `یادداشت ادمین: ${normalizedNote}`);
  }

  lines.push("", "برای جزئیات بیشتر وارد پنل پشتیبانی ربات شوید.");
  return lines.join("\n");
}

function buildIndustryApplicationStatusMessage(application, status) {
  return [
    "به روزرسانی درخواست صنعتی",
    "",
    `درخواست #${application.id}`,
    `فرصت: ${application.opportunity_title || "-"}`,
    `وضعیت: ${formatIndustryApplicationStatus(status)}`,
    "",
    "برای مشاهده جزئیات وارد پنل صنعت در ربات شوید."
  ].join("\n");
}

function buildIndustryOpportunityUpdateMessage(opportunity, status, approvalStatus) {
  const lines = [
    "به روزرسانی فرصت صنعتی",
    "",
    `فرصت #${opportunity.id}`,
    `عنوان: ${opportunity.title || "-"}`,
    `وضعیت: ${formatGenericStatusFa(status || opportunity.status || "-")}`,
    `وضعیت تایید: ${formatGenericStatusFa(approvalStatus || opportunity.approval_status || "-")}`,
    "",
    "برای دیدن وضعیت جدید وارد پنل صنعت ربات شوید."
  ];
  return lines.join("\n");
}

function buildIndustryProjectUpdateMessage(project, status) {
  return [
    "به روزرسانی پروژه صنعتی",
    "",
    `پروژه #${project.id}`,
    `عنوان: ${project.title || "-"}`,
    `وضعیت: ${formatGenericStatusFa(status || project.status || "-")}`,
    "",
    "برای پیگیری پروژه وارد پنل صنعت ربات شوید."
  ].join("\n");
}

function buildSupportAdminReplyMessage(ticketId, subject, status, message) {
  return [
    "پاسخ پشتیبانی فنجوبو",
    "",
    `تیکت #${ticketId}`,
    `موضوع: ${subject || "-"}`,
    `وضعیت: ${formatSupportStatus(status)}`,
    "",
    message
  ].join("\n");
}

function buildUserBroadcastText(message) {
  return `📢 پیام ادمین فنجوبو\n\n${message}`;
}

function buildContentPublishStatusMessage(contentId, title, isPublished) {
  return [
    "به روزرسانی وضعیت محتوا",
    "",
    `محتوا #${contentId}`,
    `عنوان: ${title || "-"}`,
    `انتشار: ${isPublished ? "منتشر شد" : "از انتشار خارج شد"}`,
    "",
    "برای دیدن آخرین وضعیت وارد ربات فنجوبو شوید."
  ].join("\n");
}

async function notifyUsersByIdList(userIds, text, metadata = {}) {
  const uniqueIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((value) => Number(value)).filter((value) => value > 0))];
  if (!uniqueIds.length) {
    return { total: 0, delivered: 0, failed: 0, results: [] };
  }

  const results = [];
  for (const userId of uniqueIds) {
    const notify = await notifyTelegramUser(userId, text, metadata);
    results.push({ userId, ...notify });
  }

  const delivered = results.filter((item) => item.delivered).length;
  return {
    total: uniqueIds.length,
    delivered,
    failed: uniqueIds.length - delivered,
    results
  };
}

async function resolveAdminSenderUserId(adminIdRaw) {
  const normalized = toNullableString(adminIdRaw);
  if (!normalized) return null;

  const maybeNumeric = Number(normalized);
  if (Number.isFinite(maybeNumeric) && maybeNumeric > 0) {
    const byId = await query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [Math.floor(maybeNumeric)]);
    if (byId.rows.length) return Number(byId.rows[0].id);
  }

  const byTelegram = await query(`SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`, [normalized]);
  if (byTelegram.rows.length) return Number(byTelegram.rows[0].id);

  return null;
}

function normalizeProfileForUpsert(rawInput, fallback = null) {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }

  const base = fallback || {};
  const major = toNullableString(rawInput.major ?? base.major);
  const level = toNullableString(rawInput.level ?? base.level);
  const term = toNullableString(rawInput.term ?? base.term);
  const skillLevel = toNullableString(rawInput.skillLevel ?? rawInput.skill_level ?? base.skill_level ?? base.skillLevel);
  const shortTermGoal = toNullableString(rawInput.shortTermGoal ?? rawInput.short_term_goal ?? base.short_term_goal ?? base.shortTermGoal);
  const weeklyRaw = rawInput.weeklyHours ?? rawInput.weekly_hours ?? base.weekly_hours ?? base.weeklyHours;
  const weeklyHours = Number(weeklyRaw);

  if (!major || !level || !term || !skillLevel || !shortTermGoal || !Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    throw new Error(
      "Profile requires major, level, term, skillLevel, shortTermGoal and weeklyHours (> 0)."
    );
  }

  return {
    university: toNullableString(rawInput.university ?? base.university),
    city: toNullableString(rawInput.city ?? base.city),
    major,
    level,
    term,
    interests: toStringArray(rawInput.interests ?? base.interests),
    skillLevel,
    shortTermGoal,
    weeklyHours: Math.floor(weeklyHours),
    resumeUrl: toNullableString(rawInput.resumeUrl ?? rawInput.resume_url ?? base.resume_url ?? base.resumeUrl),
    githubUrl: toNullableString(rawInput.githubUrl ?? rawInput.github_url ?? base.github_url ?? base.githubUrl),
    portfolioUrl: toNullableString(rawInput.portfolioUrl ?? rawInput.portfolio_url ?? base.portfolio_url ?? base.portfolioUrl),
    skills: toSkillsArray(rawInput.skills ?? base.skills),
    passedCourses: toStringArray(rawInput.passedCourses ?? rawInput.passed_courses ?? base.passed_courses ?? base.passedCourses)
  };
}

router.use(requireAdmin);
router.use(async (_req, _res, next) => {
  try {
    await ensureSupportTables();
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const rows = await query(
      `SELECT *
       FROM admin_notifications
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [status, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:notificationId", async (req, res, next) => {
  try {
    const notificationId = Number(req.params.notificationId);
    const status = req.body?.status || "resolved";
    const updated = await query(
      `UPDATE admin_notifications
       SET status = $1,
           resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
       WHERE id = $2
       RETURNING *`,
      [status, notificationId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/support/tickets", async (req, res, next) => {
  try {
    const status = toNullableString(req.query.status);
    const priority = toNullableString(req.query.priority);
    const searchText = toNullableString(req.query.q);
    const search = searchText ? `%${searchText.toLowerCase()}%` : null;
    const limit = toLimit(req.query.limit, 80, 250);

    const ticketsRes = await query(
      `SELECT t.*,
              u.full_name,
              u.phone_or_email,
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
         AND ($2::text IS NULL OR t.priority = $2)
         AND (
           $3::text IS NULL
           OR LOWER(t.subject) LIKE $3
           OR LOWER(COALESCE(u.full_name, '')) LIKE $3
           OR LOWER(COALESCE(u.phone_or_email, '')) LIKE $3
           OR CAST(t.id AS TEXT) LIKE $3
         )
       ORDER BY
         CASE WHEN t.status IN ('open', 'pending') THEN 0 ELSE 1 END,
         COALESCE(t.last_user_message_at, t.updated_at, t.created_at) DESC,
         t.id DESC
       LIMIT $4`,
      [status, priority, search, limit]
    );

    const statusSummaryRes = await query(
      `SELECT status, COUNT(*) AS total
       FROM support_tickets
       GROUP BY status
       ORDER BY COUNT(*) DESC`
    );

    res.json({
      items: ticketsRes.rows,
      summary: statusSummaryRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.get("/support/tickets/:ticketId", async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    if (!ticketId) return res.status(400).json({ error: "Invalid ticketId" });

    const ticketRes = await query(
      `SELECT t.*, u.full_name, u.phone_or_email, u.telegram_id
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1
       LIMIT 1`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });

    const messagesRes = await query(
      `SELECT m.*,
              u.full_name AS sender_full_name
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC, m.id ASC`,
      [ticketId]
    );

    res.json({
      ticket: ticketRes.rows[0],
      messages: messagesRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/support/tickets/:ticketId/status", async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const status = toNullableString(req.body?.status);
    const note = toNullableString(req.body?.note);
    if (!ticketId || !status) return res.status(400).json({ error: "ticketId and status are required" });
    if (!["open", "pending", "answered", "closed"].includes(status)) {
      return res.status(400).json({ error: "Invalid ticket status" });
    }

    const currentTicketRes = await query(
      `SELECT id, user_id, subject, status
       FROM support_tickets
       WHERE id = $1
       LIMIT 1`,
      [ticketId]
    );
    if (!currentTicketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });
    const currentTicket = currentTicketRes.rows[0];

    const updated = await query(
      `UPDATE support_tickets
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, ticketId]
    );
    if (!updated.rows.length) return res.status(404).json({ error: "Ticket not found" });

    if (note) {
      const senderUserId = await resolveAdminSenderUserId(req.headers["x-admin-id"]);
      await query(
        `INSERT INTO support_ticket_messages
         (ticket_id, sender_role, sender_user_id, message_text)
         VALUES ($1, 'admin', $2, $3)`,
        [ticketId, senderUserId, note]
      );
    }

    await createNotification({
      type: "support-ticket-status-updated",
      title: "Support ticket status updated",
      message: `Ticket #${ticketId} status changed to ${status}`,
      payload: { ticketId, userId: currentTicket.user_id, previousStatus: currentTicket.status, status, note }
    });

    const notify = await notifyTelegramUser(
      currentTicket.user_id,
      buildSupportStatusUpdateMessage(
        { id: currentTicket.id, subject: currentTicket.subject },
        status,
        note
      ),
      {
        ticketId,
        source: "support-admin-status",
        previousStatus: currentTicket.status,
        status
      }
    );

    res.json({ ticket: updated.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.post("/support/tickets/:ticketId/reply", async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const message = toNullableString(req.body?.message);
    const requestedStatus = toNullableString(req.body?.status);
    if (!ticketId || !message) return res.status(400).json({ error: "ticketId and message are required" });

    const status = requestedStatus || "answered";
    if (!["open", "pending", "answered", "closed"].includes(status)) {
      return res.status(400).json({ error: "Invalid ticket status" });
    }

    const ticketRes = await query(`SELECT * FROM support_tickets WHERE id = $1 LIMIT 1`, [ticketId]);
    if (!ticketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketRes.rows[0];

    const senderUserId = await resolveAdminSenderUserId(req.headers["x-admin-id"]);

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

    await createNotification({
      type: "support-ticket-admin-reply",
      title: "Support ticket replied",
      message: `Ticket #${ticketId} received an admin reply`,
      payload: { ticketId, userId: ticket.user_id, status }
    });

    const notifyText = buildSupportAdminReplyMessage(ticketId, ticket.subject, status, message);

    const notify = await notifyTelegramUser(ticket.user_id, notifyText, {
      ticketId,
      source: "support-admin-reply",
      status
    });

    res.json({
      ticket: updatedTicket.rows[0],
      message: insertedMessage.rows[0],
      notify
    });
  } catch (error) {
    next(error);
  }
});

router.get("/logs", async (req, res, next) => {
  try {
    const result = getLogs({
      level: req.query.level || null,
      search: req.query.search || null,
      limit: req.query.limit || 300
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/integrations/drive/check", async (req, res, next) => {
  try {
    const folderId = toNullableString(req.body?.folderId);
    const result = await testDriveReadWrite({ folderId });

    res.json({
      ok: true,
      message: "Drive read/write check passed.",
      result
    });
  } catch (error) {
    next(error);
  }
});

router.get("/broadcast/audience", async (req, res, next) => {
  try {
    const limit = toLimit(req.query.limit, 20, 200);

    const totalsRes = await query(
      `SELECT COUNT(*) AS total_started_users
       FROM users
       WHERE COALESCE(telegram_id, '') <> ''`
    );

    const recentUsersRes = await query(
      `SELECT id, full_name, telegram_id, created_at
       FROM users
       WHERE COALESCE(telegram_id, '') <> ''
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      audience: {
        totalStartedUsers: Number(totalsRes.rows[0]?.total_started_users || 0),
        botOnline: isBotAvailable()
      },
      recentUsers: recentUsersRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post("/broadcast/send", async (req, res, next) => {
  try {
    const message = toNullableString(req.body?.message);
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    if (message.length > 3500) {
      return res.status(400).json({ error: "message is too long (max 3500 chars)" });
    }

    const dryRun = toBoolean(req.body?.dryRun, false);
    const rawLimit = Number(req.body?.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(10000, Math.floor(rawLimit)) : null;

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

    const outboundText = buildUserBroadcastText(message);
    let sentCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const recipient of recipients) {
      try {
        await sendTelegramMessage(recipient.telegram_id, outboundText);
        sentCount += 1;
        await createUserEvent({
          userId: recipient.id,
          eventType: "admin_broadcast_sent",
          payload: {
            messagePreview: message.slice(0, 160),
            telegramId: recipient.telegram_id
          }
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
          eventType: "admin_broadcast_failed",
          payload: {
            messagePreview: message.slice(0, 160),
            telegramId: recipient.telegram_id,
            error: failMessage
          }
        });
      }

      // Light throttle to avoid Telegram flood limits on big blasts.
      await wait(35);
    }

    await createNotification({
      type: "admin-broadcast",
      title: "Admin broadcast completed",
      message: `Sent ${sentCount}/${recipients.length} messages`,
      payload: {
        totalRecipients: recipients.length,
        sentCount,
        failedCount
      }
    });

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

router.get("/dashboard/overview", async (req, res, next) => {
  try {
    const totalsRes = await query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM user_profiles) AS total_profiles,
         (SELECT COUNT(*) FROM contents) AS total_contents,
         (SELECT COUNT(*) FROM contents WHERE is_published = TRUE) AS published_contents,
         (SELECT COUNT(*) FROM industry_opportunities) AS total_opportunities,
         (SELECT COUNT(*) FROM industry_opportunities WHERE approval_status = 'pending') AS pending_opportunities,
         (SELECT COUNT(*) FROM industry_projects) AS total_projects,
         (SELECT COUNT(*) FROM industry_applications) AS total_applications,
         (SELECT COUNT(*) FROM community_content_submissions) AS total_submissions,
         (SELECT COUNT(*) FROM community_content_submissions WHERE status = 'pending') AS pending_submissions,
         (SELECT COUNT(*) FROM support_tickets) AS total_support_tickets,
         (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'pending')) AS open_support_tickets,
         (SELECT COUNT(*) FROM users WHERE COALESCE(telegram_id, '') <> '') AS bot_started_users,
         (SELECT COUNT(*) FROM admin_notifications WHERE status = 'open') AS open_notifications`
    );

    const recentUsersRes = await query(
      `SELECT u.id, u.full_name, u.phone_or_email, u.telegram_id, u.created_at,
              CASE WHEN p.user_id IS NULL THEN FALSE ELSE TRUE END AS has_profile
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 8`
    );

    const totalsRaw = totalsRes.rows[0] || {};
    const totals = Object.fromEntries(
      Object.entries(totalsRaw).map(([key, value]) => [key, Number(value || 0)])
    );

    res.json({
      overview: totals,
      recentUsers: recentUsersRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/analytics", async (req, res, next) => {
  try {
    const [profilesByMajorRes, submissionsByStatusRes, contentsByTypeKindRes, appsByStatusRes, projectsByStatusRes] =
      await Promise.all([
        query(
          `SELECT COALESCE(major, 'unknown') AS major, COUNT(*) AS total
           FROM user_profiles
           GROUP BY COALESCE(major, 'unknown')
           ORDER BY COUNT(*) DESC
           LIMIT 25`
        ),
        query(
          `SELECT status, section, content_kind, COUNT(*) AS total
           FROM community_content_submissions
           GROUP BY status, section, content_kind
           ORDER BY COUNT(*) DESC
           LIMIT 100`
        ),
        query(
          `SELECT type, kind,
                  COUNT(*) AS total,
                  SUM(CASE WHEN is_published = TRUE THEN 1 ELSE 0 END) AS published
           FROM contents
           GROUP BY type, kind
           ORDER BY COUNT(*) DESC
           LIMIT 100`
        ),
        query(
          `SELECT status, COUNT(*) AS total
           FROM industry_applications
           GROUP BY status
           ORDER BY COUNT(*) DESC`
        ),
        query(
          `SELECT status, COUNT(*) AS total
           FROM industry_projects
           GROUP BY status
           ORDER BY COUNT(*) DESC`
        )
      ]);

    res.json({
      analytics: {
        profilesByMajor: profilesByMajorRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        submissionsByStatus: submissionsByStatusRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        contentsByTypeKind: contentsByTypeKindRes.rows.map((row) => ({
          ...row,
          total: Number(row.total || 0),
          published: Number(row.published || 0)
        })),
        applicationsByStatus: appsByStatusRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) })),
        projectsByStatus: projectsByStatusRes.rows.map((row) => ({ ...row, total: Number(row.total || 0) }))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const searchText = String(req.query.q || "").trim().toLowerCase();
    const search = searchText ? `%${searchText}%` : null;
    const hasProfile = req.query.hasProfile === undefined ? null : String(req.query.hasProfile).toLowerCase();
    const limit = toLimit(req.query.limit, 100, 300);

    const rows = await query(
      `SELECT u.id, u.full_name, u.phone_or_email, u.telegram_id, u.created_at,
              p.major, p.level, p.term, p.skill_level, p.updated_at AS profile_updated_at,
              CASE WHEN p.user_id IS NULL THEN FALSE ELSE TRUE END AS has_profile
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE ($1::text IS NULL
              OR LOWER(u.full_name) LIKE $1
              OR LOWER(u.phone_or_email) LIKE $1
              OR LOWER(COALESCE(u.telegram_id, '')) LIKE $1)
         AND ($2::text IS NULL
              OR ($2 = 'true' AND p.user_id IS NOT NULL)
              OR ($2 = 'false' AND p.user_id IS NULL))
       ORDER BY u.created_at DESC
       LIMIT $3`,
      [search, hasProfile, limit]
    );

    const count = await query(
      `SELECT COUNT(*) AS total
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE ($1::text IS NULL
              OR LOWER(u.full_name) LIKE $1
              OR LOWER(u.phone_or_email) LIKE $1
              OR LOWER(COALESCE(u.telegram_id, '')) LIKE $1)
         AND ($2::text IS NULL
              OR ($2 = 'true' AND p.user_id IS NOT NULL)
              OR ($2 = 'false' AND p.user_id IS NULL))`,
      [search, hasProfile]
    );

    res.json({
      items: rows.rows,
      total: Number(count.rows[0]?.total || 0),
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const userRes = await query(
      `SELECT u.id AS user_id,
              u.full_name,
              u.phone_or_email,
              u.telegram_id,
              u.created_at AS user_created_at,
              CASE WHEN p.user_id IS NULL THEN FALSE ELSE TRUE END AS has_profile,
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
              p.updated_at AS profile_created_at,
              p.updated_at AS profile_updated_at
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    if (!userRes.rows.length) return res.status(404).json({ error: "User not found" });

    const [eventsRes, applicationsRes, projectsRes, submissionsRes, supportTicketsRes, contentsRes] = await Promise.all([
      query(
        `SELECT id, event_type, payload, created_at
         FROM user_events
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT a.*, o.title AS opportunity_title
         FROM industry_applications a
         LEFT JOIN industry_opportunities o ON o.id = a.opportunity_id
         WHERE a.user_id = $1
         ORDER BY a.updated_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT sp.*, p.title AS project_title
         FROM industry_student_projects sp
         LEFT JOIN industry_projects p ON p.id = sp.project_id
         WHERE sp.user_id = $1
         ORDER BY sp.updated_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT id, section, content_kind, title, status, moderation_reason, created_at, reviewed_at
         FROM community_content_submissions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT t.id,
                t.subject,
                t.status,
                t.priority,
                t.category,
                t.created_at,
                t.updated_at,
                t.last_user_message_at,
                t.last_admin_reply_at,
                (
                  SELECT m.message_text
                  FROM support_ticket_messages m
                  WHERE m.ticket_id = t.id
                  ORDER BY m.created_at DESC, m.id DESC
                  LIMIT 1
                ) AS last_message
         FROM support_tickets t
         WHERE t.user_id = $1
         ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.id DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT id, title, type, kind, is_published, created_at
         FROM contents
         WHERE created_by_user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      )
    ]);

    res.json({
      user: userRes.rows[0],
      activity: {
        events: eventsRes.rows,
        applications: applicationsRes.rows,
        studentProjects: projectsRes.rows,
        submissions: submissionsRes.rows,
        supportTickets: supportTicketsRes.rows,
        contents: contentsRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/profiles", async (req, res, next) => {
  try {
    const searchText = String(req.query.q || "").trim().toLowerCase();
    const search = searchText ? `%${searchText}%` : null;
    const major = toNullableString(req.query.major);
    const level = toNullableString(req.query.level);
    const limit = toLimit(req.query.limit, 120, 300);

    const rows = await query(
      `SELECT p.*, u.full_name, u.phone_or_email, u.telegram_id, u.created_at AS user_created_at
       FROM user_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE ($1::text IS NULL
              OR LOWER(u.full_name) LIKE $1
              OR LOWER(u.phone_or_email) LIKE $1
              OR LOWER(COALESCE(u.telegram_id, '')) LIKE $1)
         AND ($2::text IS NULL OR p.major = $2)
         AND ($3::text IS NULL OR p.level = $3)
       ORDER BY p.updated_at DESC
       LIMIT $4`,
      [search, major, level, limit]
    );

    const totalRes = await query(
      `SELECT COUNT(*) AS total
       FROM user_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE ($1::text IS NULL
              OR LOWER(u.full_name) LIKE $1
              OR LOWER(u.phone_or_email) LIKE $1
              OR LOWER(COALESCE(u.telegram_id, '')) LIKE $1)
         AND ($2::text IS NULL OR p.major = $2)
         AND ($3::text IS NULL OR p.level = $3)`,
      [search, major, level]
    );

    res.json({
      items: rows.rows,
      total: Number(totalRes.rows[0]?.total || 0),
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.post("/users/register", async (req, res, next) => {
  try {
    const fullName = toNullableString(req.body?.fullName);
    const phoneOrEmail = toNullableString(req.body?.phoneOrEmail);
    const telegramId = toNullableString(req.body?.telegramId);

    if (!fullName || !phoneOrEmail) {
      return res.status(400).json({ error: "fullName and phoneOrEmail are required" });
    }

    const inserted = await query(
      `INSERT INTO users (full_name, phone_or_email, telegram_id)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, phone_or_email, telegram_id, created_at`,
      [fullName, phoneOrEmail, telegramId]
    );

    const user = inserted.rows[0];
    let profile = null;

    if (req.body?.profile) {
      const normalized = normalizeProfileForUpsert(req.body.profile);
      const profileRes = await query(
        `INSERT INTO user_profiles
         (user_id, university, city, major, level, term, interests, skill_level, short_term_goal, weekly_hours, resume_url, github_url, portfolio_url, skills, passed_courses)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
         RETURNING *`,
        [
          user.id,
          normalized.university,
          normalized.city,
          normalized.major,
          normalized.level,
          normalized.term,
          JSON.stringify(normalized.interests),
          normalized.skillLevel,
          normalized.shortTermGoal,
          normalized.weeklyHours,
          normalized.resumeUrl,
          normalized.githubUrl,
          normalized.portfolioUrl,
          JSON.stringify(normalized.skills),
          JSON.stringify(normalized.passedCourses)
        ]
      );

      profile = profileRes.rows[0];
    }

    res.status(201).json({ user, profile });
  } catch (error) {
    if (String(error?.message || "").includes("Profile requires")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.patch("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const existingUser = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (!existingUser.rows.length) return res.status(404).json({ error: "User not found" });

    const fields = [];
    const values = [];
    const fullName = req.body?.fullName;
    const phoneOrEmail = req.body?.phoneOrEmail;
    const telegramId = req.body?.telegramId;

    if (fullName !== undefined) {
      const normalized = toNullableString(fullName);
      if (!normalized) return res.status(400).json({ error: "fullName cannot be empty" });
      fields.push(`full_name = $${fields.length + 1}`);
      values.push(normalized);
    }
    if (phoneOrEmail !== undefined) {
      const normalized = toNullableString(phoneOrEmail);
      if (!normalized) return res.status(400).json({ error: "phoneOrEmail cannot be empty" });
      fields.push(`phone_or_email = $${fields.length + 1}`);
      values.push(normalized);
    }
    if (telegramId !== undefined) {
      fields.push(`telegram_id = $${fields.length + 1}`);
      values.push(toNullableString(telegramId));
    }

    let user = existingUser.rows[0];
    if (fields.length) {
      const updated = await query(
        `UPDATE users
         SET ${fields.join(", ")}
         WHERE id = $${fields.length + 1}
         RETURNING id, full_name, phone_or_email, telegram_id, created_at`,
        [...values, userId]
      );
      user = updated.rows[0];
    }

    let profile = null;
    if (req.body?.profile) {
      const existingProfile = await query(`SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
      const normalized = normalizeProfileForUpsert(req.body.profile, existingProfile.rows[0] || null);

      const upsert = await query(
        `INSERT INTO user_profiles
         (user_id, university, city, major, level, term, interests, skill_level, short_term_goal, weekly_hours, resume_url, github_url, portfolio_url, skills, passed_courses)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
         ON CONFLICT (user_id)
         DO UPDATE SET
           university = EXCLUDED.university,
           city = EXCLUDED.city,
           major = EXCLUDED.major,
           level = EXCLUDED.level,
           term = EXCLUDED.term,
           interests = EXCLUDED.interests,
           skill_level = EXCLUDED.skill_level,
           short_term_goal = EXCLUDED.short_term_goal,
           weekly_hours = EXCLUDED.weekly_hours,
           resume_url = EXCLUDED.resume_url,
           github_url = EXCLUDED.github_url,
           portfolio_url = EXCLUDED.portfolio_url,
           skills = EXCLUDED.skills,
           passed_courses = EXCLUDED.passed_courses,
           updated_at = NOW()
         RETURNING *`,
        [
          userId,
          normalized.university,
          normalized.city,
          normalized.major,
          normalized.level,
          normalized.term,
          JSON.stringify(normalized.interests),
          normalized.skillLevel,
          normalized.shortTermGoal,
          normalized.weeklyHours,
          normalized.resumeUrl,
          normalized.githubUrl,
          normalized.portfolioUrl,
          JSON.stringify(normalized.skills),
          JSON.stringify(normalized.passedCourses)
        ]
      );

      profile = upsert.rows[0];
    } else {
      const current = await query(`SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
      profile = current.rows[0] || null;
    }

    res.json({ user, profile });
  } catch (error) {
    if (String(error?.message || "").includes("Profile requires")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.delete("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    if (config.adminUserId && String(userId) === String(config.adminUserId)) {
      return res.status(400).json({ error: "Configured admin user cannot be deleted" });
    }

    const removed = await query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]);
    if (!removed.rows.length) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true, userId });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/companies", async (req, res, next) => {
  try {
    const {
      name,
      domain,
      size,
      city,
      websiteUrl,
      linkedinUrl,
      isVerified = false
    } = req.body || {};

    if (!name) return res.status(400).json({ error: "name is required" });

    const inserted = await query(
      `INSERT INTO industry_companies
       (name, domain, size, city, website_url, linkedin_url, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, domain || null, size || null, city || null, websiteUrl || null, linkedinUrl || null, Boolean(isVerified)]
    );

    res.status(201).json({ company: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/companies/:companyId/contacts", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { fullName, email, phone, role } = req.body || {};

    const inserted = await query(
      `INSERT INTO industry_company_contacts
       (company_id, full_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [companyId, fullName || null, email || null, phone || null, role || null]
    );

    res.status(201).json({ contact: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/opportunities", async (req, res, next) => {
  try {
    const {
      companyId,
      opportunityType,
      title,
      description,
      locationMode,
      city,
      level,
      requiredSkills = [],
      hoursPerWeek,
      salaryMin,
      salaryMax,
      startDate,
      deadlineAt
    } = req.body || {};

    if (!title || !opportunityType) {
      return res.status(400).json({ error: "title and opportunityType are required" });
    }

    const inserted = await query(
      `INSERT INTO industry_opportunities
       (company_id, opportunity_type, title, description, location_mode, city, level, required_skills, hours_per_week, salary_min, salary_max, start_date, deadline_at, approval_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, 'pending', 'open')
       RETURNING *`,
      [
        companyId ? Number(companyId) : null,
        opportunityType,
        title,
        description || "",
        locationMode || "remote",
        city || null,
        level || "Intern",
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        hoursPerWeek ? Number(hoursPerWeek) : null,
        salaryMin ? Number(salaryMin) : null,
        salaryMax ? Number(salaryMax) : null,
        startDate || null,
        deadlineAt || null
      ]
    );

    await createNotification({
      type: "industry-opportunity-pending",
      title: "Opportunity requires approval",
      message: `${title} submitted for moderation`,
      payload: { opportunityId: inserted.rows[0].id }
    });

    res.status(201).json({ opportunity: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/opportunities/:opportunityId/approval", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const approvalStatus = req.body?.approvalStatus || "approved";

    const beforeRes = await query(
      `SELECT id, title, status, approval_status
       FROM industry_opportunities
       WHERE id = $1
       LIMIT 1`,
      [opportunityId]
    );
    if (!beforeRes.rows.length) return res.status(404).json({ error: "Opportunity not found" });
    const before = beforeRes.rows[0];

    const updated = await query(
      `UPDATE industry_opportunities
       SET approval_status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvalStatus, opportunityId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Opportunity not found" });

    const affectedUsersRes = await query(
      `SELECT DISTINCT user_id
       FROM (
         SELECT user_id FROM industry_applications WHERE opportunity_id = $1
         UNION ALL
         SELECT user_id FROM industry_saved_opportunities WHERE opportunity_id = $1
       ) AS affected`,
      [opportunityId]
    );

    const notify = await notifyUsersByIdList(
      affectedUsersRes.rows.map((row) => row.user_id),
      buildIndustryOpportunityUpdateMessage(updated.rows[0], updated.rows[0].status, approvalStatus),
      {
        source: "industry-opportunity-approval",
        opportunityId,
        previousApprovalStatus: before.approval_status,
        approvalStatus
      }
    );

    res.json({ opportunity: updated.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/opportunities/:opportunityId/status", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const status = req.body?.status || "open";

    const beforeRes = await query(
      `SELECT id, title, status, approval_status
       FROM industry_opportunities
       WHERE id = $1
       LIMIT 1`,
      [opportunityId]
    );
    if (!beforeRes.rows.length) return res.status(404).json({ error: "Opportunity not found" });
    const before = beforeRes.rows[0];

    const updated = await query(
      `UPDATE industry_opportunities
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, opportunityId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Opportunity not found" });

    const affectedUsersRes = await query(
      `SELECT DISTINCT user_id
       FROM (
         SELECT user_id FROM industry_applications WHERE opportunity_id = $1
         UNION ALL
         SELECT user_id FROM industry_saved_opportunities WHERE opportunity_id = $1
       ) AS affected`,
      [opportunityId]
    );

    const notify = await notifyUsersByIdList(
      affectedUsersRes.rows.map((row) => row.user_id),
      buildIndustryOpportunityUpdateMessage(updated.rows[0], status, updated.rows[0].approval_status),
      {
        source: "industry-opportunity-status",
        opportunityId,
        previousStatus: before.status,
        status
      }
    );

    res.json({ opportunity: updated.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/projects", async (req, res, next) => {
  try {
    const {
      companyId,
      type,
      title,
      brief,
      domain,
      level,
      estimatedHours,
      requiredSkills = [],
      deliverables = [],
      evaluationCriteria = [],
      resumeReady = true
    } = req.body || {};

    if (!type || !title || !brief) return res.status(400).json({ error: "type, title and brief are required" });

    const inserted = await query(
      `INSERT INTO industry_projects
       (company_id, type, title, brief, domain, level, estimated_hours, required_skills, deliverables, evaluation_criteria, resume_ready, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, 'open')
       RETURNING *`,
      [
        companyId ? Number(companyId) : null,
        type,
        title,
        brief,
        domain || null,
        level || "Intern",
        estimatedHours ? Number(estimatedHours) : null,
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        JSON.stringify(Array.isArray(deliverables) ? deliverables : []),
        JSON.stringify(Array.isArray(evaluationCriteria) ? evaluationCriteria : []),
        Boolean(resumeReady)
      ]
    );

    res.status(201).json({ project: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/opportunities", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT o.*, c.name AS company_name
       FROM industry_opportunities o
       LEFT JOIN industry_companies c ON c.id = o.company_id
       WHERE ($1::text IS NULL OR o.approval_status = $1)
         AND ($2::text IS NULL OR o.status = $2)
       ORDER BY o.created_at DESC
       LIMIT $3`,
      [req.query.approvalStatus || null, req.query.status || null, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/projects", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.*, c.name AS company_name
       FROM industry_projects p
       LEFT JOIN industry_companies c ON c.id = p.company_id
       WHERE ($1::text IS NULL OR p.status = $1)
         AND ($2::text IS NULL OR p.type = $2)
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [req.query.status || null, req.query.type || null, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/projects/:projectId/detail", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: "Invalid projectId" });

    const projectRes = await query(
      `SELECT p.*, c.name AS company_name
       FROM industry_projects p
       LEFT JOIN industry_companies c ON c.id = p.company_id
       WHERE p.id = $1
       LIMIT 1`,
      [projectId]
    );

    if (!projectRes.rows.length) return res.status(404).json({ error: "Project not found" });

    const [milestonesRes, tasksRes, studentProjectsRes] = await Promise.all([
      query(
        `SELECT *
         FROM industry_project_milestones
         WHERE project_id = $1
         ORDER BY COALESCE(week_no, 999999), id ASC`,
        [projectId]
      ),
      query(
        `SELECT t.*, m.title AS milestone_title
         FROM industry_project_tasks t
         JOIN industry_project_milestones m ON m.id = t.milestone_id
         WHERE m.project_id = $1
         ORDER BY m.id ASC, t.id ASC`,
        [projectId]
      ),
      query(
        `SELECT sp.*, u.full_name, u.phone_or_email
         FROM industry_student_projects sp
         JOIN users u ON u.id = sp.user_id
         WHERE sp.project_id = $1
         ORDER BY sp.updated_at DESC`,
        [projectId]
      )
    ]);

    res.json({
      project: projectRes.rows[0],
      milestones: milestonesRes.rows,
      tasks: tasksRes.rows,
      studentProjects: studentProjectsRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/projects/:projectId/status", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const status = req.body?.status || "open";

    const beforeRes = await query(
      `SELECT id, title, status
       FROM industry_projects
       WHERE id = $1
       LIMIT 1`,
      [projectId]
    );
    if (!beforeRes.rows.length) return res.status(404).json({ error: "Project not found" });
    const before = beforeRes.rows[0];

    const updated = await query(
      `UPDATE industry_projects
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, projectId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Project not found" });

    const affectedUsersRes = await query(
      `SELECT DISTINCT user_id
       FROM industry_student_projects
       WHERE project_id = $1`,
      [projectId]
    );

    const notify = await notifyUsersByIdList(
      affectedUsersRes.rows.map((row) => row.user_id),
      buildIndustryProjectUpdateMessage(updated.rows[0], status),
      {
        source: "industry-project-status",
        projectId,
        previousStatus: before.status,
        status
      }
    );

    res.json({ project: updated.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/projects/:projectId/milestones", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const { title, description, weekNo } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_project_milestones
       (project_id, title, description, week_no)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, title, description || null, weekNo ? Number(weekNo) : null]
    );

    res.status(201).json({ milestone: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/milestones/:milestoneId/tasks", async (req, res, next) => {
  try {
    const milestoneId = Number(req.params.milestoneId);
    const { title, description, isRequired = true } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_project_tasks
       (milestone_id, title, description, is_required)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [milestoneId, title, description || null, Boolean(isRequired)]
    );

    res.status(201).json({ task: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/career-paths", async (req, res, next) => {
  try {
    const { name, description, requiredSkills = [], sampleProjects = [], juniorReadyChecklist = [] } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const inserted = await query(
      `INSERT INTO industry_career_paths
       (name, description, required_skills, sample_projects, junior_ready_checklist, is_active)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, TRUE)
       RETURNING *`,
      [
        name,
        description || "",
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        JSON.stringify(Array.isArray(sampleProjects) ? sampleProjects : []),
        JSON.stringify(Array.isArray(juniorReadyChecklist) ? juniorReadyChecklist : [])
      ]
    );

    res.status(201).json({ careerPath: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/skills", async (req, res, next) => {
  try {
    const { name, category, isActive = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const inserted = await query(
      `INSERT INTO industry_skills
       (name, category, is_active)
       VALUES ($1, $2, $3)
       ON CONFLICT (name)
       DO UPDATE SET
         category = EXCLUDED.category,
         is_active = EXCLUDED.is_active
       RETURNING *`,
      [name, category || null, Boolean(isActive)]
    );

    res.status(201).json({ skill: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/skill-requirements", async (req, res, next) => {
  try {
    const { targetType, targetId, skillId, requiredLevel = 1, weight = 1 } = req.body || {};
    if (!targetType || !targetId || !skillId) {
      return res.status(400).json({ error: "targetType, targetId and skillId are required" });
    }

    const inserted = await query(
      `INSERT INTO industry_skill_requirements
       (target_type, target_id, skill_id, required_level, weight)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [targetType, Number(targetId), Number(skillId), Number(requiredLevel), Number(weight)]
    );

    res.status(201).json({ requirement: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/roadmaps", async (req, res, next) => {
  try {
    const { careerPathId, title, description, isActive = true } = req.body || {};
    if (!careerPathId || !title) return res.status(400).json({ error: "careerPathId and title are required" });

    const inserted = await query(
      `INSERT INTO industry_roadmaps
       (career_path_id, title, description, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [Number(careerPathId), title, description || "", Boolean(isActive)]
    );

    res.status(201).json({ roadmap: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/roadmaps/:roadmapId/steps", async (req, res, next) => {
  try {
    const roadmapId = Number(req.params.roadmapId);
    const { stepOrder, title, skillName, contentRef, projectRef } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_roadmap_steps
       (roadmap_id, step_order, title, skill_name, content_ref, project_ref)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roadmapId, Number(stepOrder || 1), title, skillName || null, contentRef || null, projectRef || null]
    );

    res.status(201).json({ step: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/roadmaps/:roadmapId/checklist", async (req, res, next) => {
  try {
    const roadmapId = Number(req.params.roadmapId);
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_checklist_items
       (roadmap_id, title, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING *`,
      [roadmapId, title]
    );

    res.status(201).json({ checklistItem: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/applications", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT a.*, o.title AS opportunity_title, o.opportunity_type, o.level, u.full_name, u.phone_or_email
       FROM industry_applications a
       JOIN industry_opportunities o ON o.id = a.opportunity_id
       JOIN users u ON u.id = a.user_id
       WHERE ($1::text IS NULL OR a.status = $1)
       ORDER BY a.updated_at DESC
       LIMIT $2`,
      [req.query.status || null, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/applications/:applicationId/status", async (req, res, next) => {
  try {
    const applicationId = Number(req.params.applicationId);
    const status = String(req.body?.status || "viewed").toLowerCase();
    const allowed = new Set(["draft", "submitted", "viewed", "interview", "rejected", "accepted"]);
    if (!allowed.has(status)) return res.status(400).json({ error: "Invalid application status" });

    const currentRes = await query(
      `SELECT a.id, a.user_id, a.status, o.title AS opportunity_title
       FROM industry_applications a
       JOIN industry_opportunities o ON o.id = a.opportunity_id
       WHERE a.id = $1
       LIMIT 1`,
      [applicationId]
    );
    if (!currentRes.rows.length) return res.status(404).json({ error: "Application not found" });
    const current = currentRes.rows[0];

    const updated = await query(
      `UPDATE industry_applications
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, applicationId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Application not found" });

    await createNotification({
      type: "industry-application-status-updated",
      title: "Industry application status updated",
      message: `Application #${applicationId} updated to ${status}`,
      payload: {
        applicationId,
        userId: current.user_id,
        previousStatus: current.status,
        status
      }
    });

    const notify = await notifyTelegramUser(
      current.user_id,
      buildIndustryApplicationStatusMessage(
        { id: current.id, opportunity_title: current.opportunity_title },
        status
      ),
      {
        source: "industry-application-status",
        applicationId,
        previousStatus: current.status,
        status
      }
    );

    res.json({ application: updated.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.get("/content", async (req, res, next) => {
  try {
    const rawPublished = req.query.isPublished;
    const isPublishedFilter =
      rawPublished === undefined
        ? null
        : String(rawPublished).toLowerCase() === "true"
        ? true
        : String(rawPublished).toLowerCase() === "false"
        ? false
        : null;

    const rows = await query(
      `SELECT *
       FROM contents
       WHERE ($1::text IS NULL OR type = $1)
         AND ($2::text IS NULL OR kind = $2)
         AND ($3::boolean IS NULL OR is_published = $3::boolean)
       ORDER BY created_at DESC
       LIMIT $4`,
      [
        req.query.type || null,
        req.query.kind || null,
        isPublishedFilter,
        toLimit(req.query.limit, 150)
      ]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/content/:contentId", async (req, res, next) => {
  try {
    const contentId = Number(req.params.contentId);
    if (!contentId) return res.status(400).json({ error: "Invalid contentId" });

    const contentRes = await query(
      `SELECT c.*, u.full_name, u.phone_or_email
       FROM contents c
       JOIN users u ON u.id = c.created_by_user_id
       WHERE c.id = $1
       LIMIT 1`,
      [contentId]
    );
    if (!contentRes.rows.length) return res.status(404).json({ error: "Content not found" });

    const filesRes = await query(
      `SELECT *
       FROM content_files
       WHERE content_id = $1
       ORDER BY created_at DESC`,
      [contentId]
    );

    res.json({
      content: contentRes.rows[0],
      files: filesRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/content/:contentId/publish", async (req, res, next) => {
  try {
    const contentId = Number(req.params.contentId);
    const isPublished = String(req.body?.isPublished || "true").toLowerCase() === "true";

    const beforeRes = await query(
      `SELECT id, title, created_by_user_id, is_published
       FROM contents
       WHERE id = $1
       LIMIT 1`,
      [contentId]
    );
    if (!beforeRes.rows.length) return res.status(404).json({ error: "Content not found" });
    const before = beforeRes.rows[0];

    const updated = await query(
      `UPDATE contents
       SET is_published = $1
       WHERE id = $2
       RETURNING *`,
      [isPublished, contentId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Content not found" });

    const notifyText = buildContentPublishStatusMessage(contentId, before.title, isPublished);

    const notify = await notifyTelegramUser(before.created_by_user_id, notifyText, {
      source: "content-publish-status",
      contentId,
      previousPublished: Boolean(before.is_published),
      isPublished
    });

    res.json({ content: updated.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

router.get("/moderation/submissions", async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const section = req.query.section || null;
    const contentKind = req.query.contentKind || null;
    const rows = await query(
      `SELECT *
       FROM community_content_submissions
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR section = $2)
         AND ($3::text IS NULL OR content_kind = $3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [status, section, contentKind, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/moderation/submissions/:submissionId", async (req, res, next) => {
  try {
    const submissionId = Number(req.params.submissionId);
    if (!submissionId) return res.status(400).json({ error: "Invalid submissionId" });

    const submissionRes = await query(
      `SELECT s.*, u.full_name, u.phone_or_email, u.telegram_id
       FROM community_content_submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1
       LIMIT 1`,
      [submissionId]
    );
    if (!submissionRes.rows.length) return res.status(404).json({ error: "Submission not found" });

    const submission = submissionRes.rows[0];
    const driveMeta = extractDriveMetaFromTags(submission.tags);

    const relatedContentRes = await query(
      `SELECT c.*
       FROM contents c
       WHERE c.created_by_user_id = $1
         AND c.title = $2
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [submission.user_id, submission.title]
    );

    const relatedContent = relatedContentRes.rows[0] || null;
    let relatedFiles = [];
    if (relatedContent?.id) {
      const filesRes = await query(
        `SELECT *
         FROM content_files
         WHERE content_id = $1
         ORDER BY created_at DESC`,
        [relatedContent.id]
      );
      relatedFiles = filesRes.rows;
    }

    res.json({
      submission,
      driveMeta,
      relatedContent,
      relatedFiles
    });
  } catch (error) {
    next(error);
  }
});

router.post("/moderation/submissions/:submissionId/review", async (req, res, next) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const action = String(req.body?.action || "approve").toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be approve or reject" });
    }
    const reason = toNullableString(req.body?.reason);

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
             reviewed_by = 'admin'
         WHERE id = $2
         RETURNING *`,
        [reason, submissionId]
      );

      await createNotification({
        type: "submission-approved",
        title: "Community content approved",
        message: submission.title,
        payload: { submissionId, contentId: insertedContent.rows[0].id }
      });

      const notify = await notifySubmissionDecision(submission, "approve", reason);
      return res.json({ submission: updated.rows[0], content: insertedContent.rows[0], notify });
    }

    const rejectReason = reason || "Rejected by admin moderation";
    const rejected = await query(
      `UPDATE community_content_submissions
       SET status = 'rejected',
           moderation_reason = $1,
           reviewed_at = NOW(),
           reviewed_by = 'admin'
       WHERE id = $2
       RETURNING *`,
      [rejectReason, submissionId]
    );

    await createNotification({
      type: "submission-rejected",
      title: "Community content rejected",
      message: submission.title,
      payload: { submissionId }
    });

    const notify = await notifySubmissionDecision(submission, "reject", rejectReason);
    return res.json({ submission: rejected.rows[0], notify });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

