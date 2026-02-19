const express = require("express");
const multer = require("multer");
const { uploadBufferToDrive } = require("../services/googleDrive");
const { query } = require("../db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function sanitizeDriveFolderSegment(value, fallback = null) {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);

  return normalized || fallback;
}

function resolveFolderPathSegments(body = {}) {
  const explicit = String(body.folderPath || "")
    .split(/[,|>]/)
    .map((segment) => sanitizeDriveFolderSegment(segment))
    .filter(Boolean);
  if (explicit.length) return explicit;

  const contentType = String(body.contentType || "").trim();
  const contentKind = sanitizeDriveFolderSegment(body.contentKind, "general");
  const major = sanitizeDriveFolderSegment(body.major, "unknown-major");
  const term = sanitizeDriveFolderSegment(body.term, "unknown-term");
  const userId = sanitizeDriveFolderSegment(body.userId, null);

  if (contentType === "university") {
    return [contentKind, major, `term-${term}`, userId ? `user-${userId}` : null].filter(Boolean);
  }

  if (contentType === "industry") {
    return [contentKind, userId ? `user-${userId}` : null].filter(Boolean);
  }

  return [];
}

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    const { contentId, contentType, contentKind, makePublic } = req.body;

    if (!contentId || !contentType) {
      return res.status(400).json({ error: "contentId and contentType are required" });
    }

    const drive = await uploadBufferToDrive({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      contentType,
      contentKind,
      folderPathSegments: resolveFolderPathSegments(req.body || {}),
      makePublic: makePublic === "true"
    });

    const linked = await query(
      `INSERT INTO content_files (content_id, drive_file_id, drive_link, mime_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [Number(contentId), drive.fileId, drive.webViewLink || drive.webContentLink, req.file.mimetype]
    );

    res.status(201).json({
      file: {
        ...linked.rows[0],
        webViewLink: drive.webViewLink,
        webContentLink: drive.webContentLink
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
