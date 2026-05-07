import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { config } from "./config.js";
import documentsRouter from "./routes/documents.js";

await mkdir(config.uploadDir, { recursive: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "..", "..", "frontend", "dist");

console.log(`[Production] Serving frontend from: ${frontendDist}`);
const app = express();

app.set("trust proxy", 1);
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

if (config.nodeEnv === "production") {
  app.use(express.static(frontendDist));
}

app.use(
  cors({
    origin(origin, callback) {
      if (config.nodeEnv !== "production" || !origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("This origin is not allowed by CORS.");
      error.status = 403;
      callback(error);
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "doc-reader-backend" });
});

app.use("/", documentsRouter);

if (config.nodeEnv === "production") {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `File is too large. Maximum size is ${config.maxFileSizeMb} MB.` });
    return;
  }

  const status = err.status || 500;
  const message = status >= 500 ? "Something went wrong on the server." : err.message;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
});

const server = app.listen(config.port, () => {
  console.log(`Doc Reader API listening on http://localhost:${config.port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Stop the other backend process or set PORT to another value, for example: PORT=4001 npm run dev`
    );
    process.exit(1);
  }

  throw error;
});
