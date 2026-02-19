const express = require("express");
const { query } = require("../db");
const { profileSchema } = require("../services/validation");

const router = express.Router();

router.post("/upsert", async (req, res, next) => {
  try {
    const payload = profileSchema.parse(req.body);

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
        payload.userId,
        payload.university || null,
        payload.city || null,
        payload.major,
        payload.level,
        payload.term,
        JSON.stringify(payload.interests),
        payload.skillLevel,
        payload.shortTermGoal,
        payload.weeklyHours,
        payload.resumeUrl || null,
        payload.githubUrl || null,
        payload.portfolioUrl || null,
        JSON.stringify(payload.skills),
        JSON.stringify(payload.passedCourses)
      ]
    );

    res.json({ profile: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    const result = await query(
      `SELECT u.id as user_id, u.full_name, u.phone_or_email, u.telegram_id, p.*
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ profile: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
