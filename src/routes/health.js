const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "ok", service: "fanjobo", endpoint: "/health" });
});

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "fanjobo", timestamp: new Date().toISOString() });
});

module.exports = router;
