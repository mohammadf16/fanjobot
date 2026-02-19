const express = require("express");
const { query } = require("../db");
const { contentSchema } = require("../services/validation");

const router = express.Router();
const DEFAULT_LIMIT = 20;

function toLimit(raw, fallback = DEFAULT_LIMIT, max = 100) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

async function loadUniversityItems({ major, term, limit = 100 }) {
  const result = await query(
    `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
     FROM contents c
     LEFT JOIN content_files cf ON cf.content_id = c.id
     WHERE c.type = 'university'
       AND c.is_published = TRUE
       AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
       AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
     ORDER BY c.created_at DESC
     LIMIT $3`,
    [major || null, term || null, toLimit(limit, 100, 200)]
  );

  return result.rows;
}

function groupUniversityItems(items) {
  const grouped = {
    courses: [],
    professors: [],
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
    else if (item.kind === "professor") grouped.professors.push(item);
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

async function resolveMajorTerm({ userId, major, term }) {
  let resolvedMajor = major || null;
  let resolvedTerm = term || null;

  if (userId && (!resolvedMajor || !resolvedTerm)) {
    const profileResult = await query(
      `SELECT major, term
       FROM user_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (profileResult.rows.length) {
      resolvedMajor = resolvedMajor || profileResult.rows[0].major || null;
      resolvedTerm = resolvedTerm || profileResult.rows[0].term || null;
    }
  }

  return { major: resolvedMajor, term: resolvedTerm };
}

router.post("/content", async (req, res, next) => {
  try {
    const payload = contentSchema.parse(req.body);

    const inserted = await query(
      `INSERT INTO contents
      (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
      RETURNING *`,
      [
        payload.createdByUserId,
        payload.title,
        payload.description,
        payload.type,
        payload.kind,
        payload.major || null,
        payload.term || null,
        payload.skillLevel,
        JSON.stringify(payload.tags),
        payload.estimatedHours || null,
        payload.isPublished
      ]
    );

    res.status(201).json({ content: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/courses", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT *
       FROM contents
       WHERE type = 'university'
         AND kind = 'course'
         AND is_published = TRUE
         AND ($1::text IS NULL OR major = $1 OR major IS NULL)
         AND ($2::text IS NULL OR term = $2 OR term IS NULL)
       ORDER BY created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/professors", async (req, res, next) => {
  try {
    const major = req.query.major;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT *
       FROM contents
       WHERE type = 'university'
         AND kind = 'professor'
         AND is_published = TRUE
         AND ($1::text IS NULL OR major = $1 OR major IS NULL)
       ORDER BY created_at DESC
       LIMIT $2`,
      [major || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/notes", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'note'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/books", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'book'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/resources", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'resource'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/videos", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'video'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/sample-questions", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'sample-question'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/summaries", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'summary'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/exam-tips", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const limit = toLimit(req.query.limit);

    const result = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind = 'exam-tip'
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [major || null, term || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/modules", async (req, res, next) => {
  try {
    const major = req.query.major;
    const term = req.query.term;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const limit = toLimit(req.query.limit, 100, 200);
    const resolved = await resolveMajorTerm({ userId, major, term });

    const items = await loadUniversityItems({
      major: resolved.major,
      term: resolved.term,
      limit
    });

    res.json({
      major: resolved.major,
      term: resolved.term,
      modules: groupUniversityItems(items)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/my/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const limit = toLimit(req.query.limit, 60, 120);
    const resolved = await resolveMajorTerm({ userId });

    if (!resolved.major) {
      return res.status(404).json({ error: "Profile major not found for this user" });
    }

    const items = await loadUniversityItems({
      major: resolved.major,
      term: resolved.term,
      limit
    });

    const modules = groupUniversityItems(items);

    res.json({
      userId,
      major: resolved.major,
      term: resolved.term,
      summary: {
        courses: modules.courses.length,
        professors: modules.professors.length,
        notes: modules.notes.length,
        books: modules.books.length,
        resources: modules.resources.length,
        examTips: modules.examTips.length
      },
      modules
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
