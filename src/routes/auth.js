const express = require("express");
const { query } = require("../db");
const { registerSchema } = require("../services/validation");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);

    const insert = await query(
      `INSERT INTO users (full_name, phone_or_email, telegram_id)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, phone_or_email, telegram_id, created_at`,
      [payload.fullName, payload.phoneOrEmail, payload.telegramId || null]
    );

    res.status(201).json({ user: insert.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
