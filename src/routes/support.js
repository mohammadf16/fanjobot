const express = require("express");
const { query } = require("../db");
const { config } = require("../config");
const { isBotAvailable, sendTelegramMessage } = require("../bot");
const { ensureSupportTables } = require("../services/supportTickets");

const router = express.Router();

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toLimit(raw, fallback = 50, max = 200) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

async function updateTicketStatusForUser(userId, ticketId, status) {
  const updated = await query(
    `UPDATE support_tickets
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2
       AND user_id = $3
     RETURNING *`,
    [status, ticketId, userId]
  );

  return updated.rows[0] || null;
}

async function ensureUserExists(userId) {
  const userRes = await query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return Boolean(userRes.rows.length);
}

function adminChatId() {
  return String(config.telegramAdminChatId || config.adminUserId || "").trim();
}

async function notifyAdminNewTicket(ticket, userId, messageText) {
  const chatId = adminChatId();
  if (!chatId || !isBotAvailable()) return { delivered: false, reason: "admin-chat-or-bot-missing" };

  const lines = [
    "🎫 تیکت جدید پشتیبانی",
    `شماره: #${ticket.id}`,
    `کاربر: #${userId}`,
    `موضوع: ${ticket.subject || "-"}`,
    "",
    "برای مشاهده در بات:",
    `/ticket ${ticket.id}`,
    "برای پاسخ در بات:",
    `/replyticket ${ticket.id} <متن پاسخ>`
  ];
  if (messageText) {
    lines.push("", `پیام اولیه: ${String(messageText).slice(0, 400)}`);
  }

  try {
    await sendTelegramMessage(chatId, lines.join("\n"));
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error?.message || String(error) };
  }
}

async function notifyAdminUserReply(ticket, userId, messageText) {
  const chatId = adminChatId();
  if (!chatId || !isBotAvailable()) return { delivered: false, reason: "admin-chat-or-bot-missing" };

  const lines = [
    "💬 پاسخ جدید کاربر در تیکت",
    `شماره: #${ticket.id}`,
    `کاربر: #${userId}`,
    `موضوع: ${ticket.subject || "-"}`,
    "",
    "برای مشاهده در بات:",
    `/ticket ${ticket.id}`,
    "برای پاسخ در بات:",
    `/replyticket ${ticket.id} <متن پاسخ>`
  ];
  if (messageText) {
    lines.push("", `متن پیام: ${String(messageText).slice(0, 500)}`);
  }

  try {
    await sendTelegramMessage(chatId, lines.join("\n"));
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error?.message || String(error) };
  }
}

router.use(async (_req, _res, next) => {
  try {
    await ensureSupportTables();
    next();
  } catch (error) {
    next(error);
  }
});

router.post("/tickets", async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const subject = toNullableString(req.body?.subject);
    const message = toNullableString(req.body?.message);
    const priority = toNullableString(req.body?.priority) || "normal";
    const category = toNullableString(req.body?.category);

    if (!userId || !subject || !message) {
      return res.status(400).json({ error: "userId, subject and message are required" });
    }
    if (subject.length < 4) return res.status(400).json({ error: "subject must be at least 4 chars" });
    if (message.length < 8) return res.status(400).json({ error: "message must be at least 8 chars" });
    if (!["low", "normal", "high", "urgent"].includes(priority)) {
      return res.status(400).json({ error: "priority must be low/normal/high/urgent" });
    }

    const exists = await ensureUserExists(userId);
    if (!exists) return res.status(404).json({ error: "User not found" });

    const insertedTicket = await query(
      `INSERT INTO support_tickets
       (user_id, subject, status, priority, category, last_user_message_at, updated_at)
       VALUES ($1, $2, 'open', $3, $4, NOW(), NOW())
       RETURNING *`,
      [userId, subject, priority, category]
    );

    const ticket = insertedTicket.rows[0];
    const insertedMessage = await query(
      `INSERT INTO support_ticket_messages
       (ticket_id, sender_role, sender_user_id, message_text)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [ticket.id, userId, message]
    );

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('support-ticket-opened', $1, $2, $3::jsonb, 'open')`,
      [
        "New support ticket",
        `${subject} (user #${userId})`,
        JSON.stringify({ ticketId: ticket.id, userId, priority, category })
      ]
    );

    const adminNotify = await notifyAdminNewTicket(ticket, userId, message);

    return res.status(201).json({
      ticket,
      message: insertedMessage.rows[0],
      adminNotify
    });
  } catch (error) {
    next(error);
  }
});

router.get("/my/:userId/tickets", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const status = toNullableString(req.query.status);
    const rows = await query(
      `SELECT t.*,
              (
                SELECT m.message_text
                FROM support_ticket_messages m
                WHERE m.ticket_id = t.id
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT 1
              ) AS last_message
       FROM support_tickets t
       WHERE t.user_id = $1
         AND ($2::text IS NULL OR t.status = $2)
       ORDER BY t.updated_at DESC, t.id DESC
       LIMIT $3`,
      [userId, status, toLimit(req.query.limit, 50, 150)]
    );

    return res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/my/:userId/tickets/:ticketId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const ticketId = Number(req.params.ticketId);
    if (!userId || !ticketId) return res.status(400).json({ error: "Invalid userId or ticketId" });

    const ticketRes = await query(
      `SELECT *
       FROM support_tickets
       WHERE id = $1
         AND user_id = $2
       LIMIT 1`,
      [ticketId, userId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });

    const messagesRes = await query(
      `SELECT *
       FROM support_ticket_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC, id ASC`,
      [ticketId]
    );

    return res.json({
      ticket: ticketRes.rows[0],
      messages: messagesRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post("/my/:userId/tickets/:ticketId/reply", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const ticketId = Number(req.params.ticketId);
    const message = toNullableString(req.body?.message);

    if (!userId || !ticketId || !message) {
      return res.status(400).json({ error: "Invalid userId/ticketId or empty message" });
    }
    if (message.length < 2) return res.status(400).json({ error: "Message is too short" });

    const ticketRes = await query(
      `SELECT *
       FROM support_tickets
       WHERE id = $1
         AND user_id = $2
       LIMIT 1`,
      [ticketId, userId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketRes.rows[0];
    if (ticket.status === "closed") {
      return res.status(400).json({ error: "Ticket is closed" });
    }

    const insertedMessage = await query(
      `INSERT INTO support_ticket_messages
       (ticket_id, sender_role, sender_user_id, message_text)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [ticketId, userId, message]
    );

    const updatedTicket = await query(
      `UPDATE support_tickets
       SET status = 'open',
           last_user_message_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [ticketId]
    );

    await query(
      `INSERT INTO admin_notifications
       (type, title, message, payload, status)
       VALUES ('support-ticket-user-reply', $1, $2, $3::jsonb, 'open')`,
      [
        "Support ticket user reply",
        `Ticket #${ticketId} has a new user reply`,
        JSON.stringify({ ticketId, userId })
      ]
    );

    const adminNotify = await notifyAdminUserReply(
      { id: ticketId, subject: ticket.subject },
      userId,
      message
    );

    return res.json({
      ticket: updatedTicket.rows[0],
      message: insertedMessage.rows[0],
      adminNotify
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/my/:userId/tickets/:ticketId/status", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const ticketId = Number(req.params.ticketId);
    const status = toNullableString(req.body?.status);
    if (!userId || !ticketId || !status) return res.status(400).json({ error: "Invalid input" });
    if (!["open", "closed"].includes(status)) {
      return res.status(400).json({ error: "status must be open or closed" });
    }

    const ticket = await updateTicketStatusForUser(userId, ticketId, status);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    return res.json({ ticket });
  } catch (error) {
    next(error);
  }
});

router.post("/my/:userId/tickets/:ticketId/close", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const ticketId = Number(req.params.ticketId);
    if (!userId || !ticketId) return res.status(400).json({ error: "Invalid userId or ticketId" });

    const ticket = await updateTicketStatusForUser(userId, ticketId, "closed");
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    return res.json({ ticket });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
