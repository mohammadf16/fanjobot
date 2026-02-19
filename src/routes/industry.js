const express = require("express");
const { query } = require("../db");

const router = express.Router();

function toLimit(raw, fallback = 20, max = 100) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

router.get("/paths", async (req, res, next) => {
  try {
    const result = await query(
      `SELECT *
       FROM industry_career_paths
       WHERE is_active = TRUE
       ORDER BY created_at DESC
       LIMIT $1`,
      [toLimit(req.query.limit, 30)]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/opportunities", async (req, res, next) => {
  try {
    const limit = toLimit(req.query.limit, 30);
    const result = await query(
      `SELECT o.*, c.name AS company_name
       FROM industry_opportunities o
       LEFT JOIN industry_companies c ON c.id = o.company_id
       WHERE o.approval_status = 'approved'
         AND o.status = 'open'
         AND ($1::text IS NULL OR o.opportunity_type = $1)
         AND ($2::text IS NULL OR o.level = $2)
         AND ($3::text IS NULL OR o.location_mode = $3)
       ORDER BY o.created_at DESC
       LIMIT $4`,
      [req.query.type || null, req.query.level || null, req.query.locationMode || null, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/projects", async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*, c.name AS company_name
       FROM industry_projects p
       LEFT JOIN industry_companies c ON c.id = p.company_id
       WHERE p.status = 'open'
         AND ($1::text IS NULL OR p.type = $1)
         AND ($2::text IS NULL OR p.level = $2)
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [req.query.type || null, req.query.level || null, toLimit(req.query.limit, 30)]
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
