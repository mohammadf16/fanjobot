const express = require("express");
const { query } = require("../db");
const { rankContents } = require("../services/recommendation");

const router = express.Router();

router.get("/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    const profileRes = await query(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!profileRes.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const profile = profileRes.rows[0];

    const contentRes = await query(
      `SELECT * FROM contents WHERE is_published = TRUE`
    );

    const ranked = rankContents(
      {
        major: profile.major,
        term: profile.term,
        interests: profile.interests || [],
        skillLevel: profile.skill_level,
        shortTermGoal: profile.short_term_goal,
        weeklyHours: profile.weekly_hours
      },
      contentRes.rows.map((item) => ({
        ...item,
        skillLevel: item.skill_level,
        tags: item.tags || []
      }))
    );

    res.json({
      recommendations: ranked.slice(0, 10)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
