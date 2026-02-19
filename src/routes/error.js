const express = require("express");

const router = express.Router();

router.use((error, req, res, next) => {
  const isValidation = error?.name === "ZodError";

  if (isValidation) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.issues
    });
  }

  if (error?.code === "23505" || error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return res.status(409).json({ error: "Duplicate value" });
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = router;
