const express = require("express");
const { query } = require("../db");

const router = express.Router();

const allowedSections = new Set(["university", "industry"]);
const allowedKindsBySection = {
  university: new Set([
    "course",
    "professor",
    "note",
    "book",
    "resource",
    "video",
    "sample-question",
    "summary",
    "exam-tip"
  ]),
  industry: new Set([
    "project",
    "roadmap",
    "resource",
    "video"
  ])
};

const blockedWords = [
  "bet",
  "casino",
  "porn",
  "spam",
  "تبلیغ کانال",
  "قمار",
  "فروش اکانت",
  "خرید فالوور"
];

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return String(tags)
    .split(/[,،]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function looksLikeValidUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function runSubmissionFilters(payload) {
  const errors = [];
  const title = String(payload.title || "").trim();
  const description = String(payload.description || "").trim();
  const fullText = `${title} ${description}`.toLowerCase();

  if (title.length < 6) errors.push("عنوان باید حداقل 6 کاراکتر باشد.");
  if (description.length < 20) errors.push("توضیح باید حداقل 20 کاراکتر باشد.");
  if (!looksLikeValidUrl(payload.externalLink)) errors.push("لینک ارسالی معتبر نیست.");

  for (const word of blockedWords) {
    if (fullText.includes(word.toLowerCase())) {
      errors.push("متن شامل عبارت غیرمجاز است.");
      break;
    }
  }

  const tags = normalizeTags(payload.tags);
  if (tags.length > 10) errors.push("حداکثر 10 تگ مجاز است.");

  return { errors, tags };
}

async function createAdminNotification(payload) {
  await query(
    `INSERT INTO admin_notifications
     (type, title, message, payload, status)
     VALUES ('submission-pending', $1, $2, $3::jsonb, 'open')`,
    [payload.title, payload.message, JSON.stringify(payload.data || {})]
  );
}

async function handleSubmission(req, res, next) {
  try {
    const payload = {
      userId: Number(req.body?.userId),
      section: req.body?.section || "university",
      contentKind: req.body?.contentKind,
      title: req.body?.title,
      description: req.body?.description,
      major: req.body?.major || null,
      term: req.body?.term || null,
      tags: req.body?.tags || [],
      externalLink: req.body?.externalLink || null
    };

    if (!payload.userId || !payload.contentKind || !payload.title || !payload.description) {
      return res.status(400).json({ error: "userId, contentKind, title and description are required" });
    }

    if (!allowedSections.has(payload.section)) {
      return res.status(400).json({ error: "section must be university or industry" });
    }

    const allowedKinds = allowedKindsBySection[payload.section] || new Set();
    if (!allowedKinds.has(payload.contentKind)) {
      return res.status(400).json({
        error: "Unsupported content kind for selected section",
        allowedKinds: [...allowedKinds]
      });
    }

    const filterResult = runSubmissionFilters(payload);
    if (filterResult.errors.length) {
      return res.status(400).json({
        error: "Submission blocked by quality filter",
        reasons: filterResult.errors
      });
    }

    const inserted = await query(
      `INSERT INTO community_content_submissions
       (user_id, section, content_kind, title, description, major, term, tags, external_link, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'pending')
       RETURNING *`,
      [
        payload.userId,
        payload.section,
        payload.contentKind,
        payload.title,
        payload.description,
        payload.major,
        payload.term,
        JSON.stringify(filterResult.tags),
        payload.externalLink
      ]
    );

    await createAdminNotification({
      title: "New student content submission",
      message: `${payload.contentKind} submitted by user ${payload.userId}`,
      data: { submissionId: inserted.rows[0].id, userId: payload.userId }
    });

    res.status(201).json({
      submission: inserted.rows[0],
      message: "Submission received and sent to admin for review"
    });
  } catch (error) {
    next(error);
  }
}

router.post("/", handleSubmission);
router.post("/university", handleSubmission);
router.post("/industry", handleSubmission);

router.get("/meta", async (req, res) => {
  return res.json({
    sections: {
      university: [...allowedKindsBySection.university],
      industry: [...allowedKindsBySection.industry]
    }
  });
});

router.get("/my/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const rows = await query(
      `SELECT *
       FROM community_content_submissions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, 100]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
