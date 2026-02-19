const express = require("express");
const multer = require("multer");
const { uploadBufferToDrive } = require("../services/googleDrive");
const { query } = require("../db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    const { contentId, contentType, makePublic } = req.body;

    if (!contentId || !contentType) {
      return res.status(400).json({ error: "contentId and contentType are required" });
    }

    const drive = await uploadBufferToDrive({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      contentType,
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
