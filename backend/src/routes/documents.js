import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { unlink } from "node:fs/promises";
import { config } from "../config.js";
import { processUploadedFile, supportedMimeTypes } from "../services/extractors.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (supportedMimeTypes.has(file.mimetype) || /\.(pdf|docx|txt|csv|xlsx?|xlsm|png|jpe?g)$/i.test(file.originalname)) {
      cb(null, true);
      return;
    }
    cb(Object.assign(new Error("Unsupported file type."), { status: 415 }));
  }
});

router.post("/upload", upload.single("file"), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  try {
    const result = await processUploadedFile({
      id: crypto.randomUUID(),
      originalName: req.file.originalname,
      path: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  } finally {
    await unlink(req.file.path).catch(() => {});
  }
});

export default router;
