const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    const profileResult = await query(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!profileResult.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const profile = profileResult.rows[0];

    const roadmapResult = await query(
      `SELECT * FROM contents
       WHERE is_published = TRUE
         AND kind = 'roadmap'
         AND (major = $1 OR major IS NULL)
       ORDER BY created_at DESC
       LIMIT 3`,
      [profile.major]
    );

    const weeklyPlan = [
      `2h: Core course study for term ${profile.term}`,
      `2h: Practice project aligned with ${profile.short_term_goal}`,
      `1h: Review notes and flashcards`,
      `1h: Industry reading / job prep`
    ];

    res.json({
      roadmap: roadmapResult.rows,
      weeklyPlan
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
