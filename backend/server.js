require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { reportSchema } = require("./validation");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Demo-only storage: reports disappear when the server restarts.
const reports = [];
let nextId = 1;

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Allow tools such as curl/Postman (no Origin header), plus local dev servers.
    const allowed = new Set([
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ]);
    if (!origin || allowed.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error("Photo must be a PNG, JPEG, or WebP image."));
    }
    callback(null, true);
  }
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "CampusCare API" });
});

app.get("/api/reports", (_req, res) => {
  res.status(200).json({ count: reports.length, reports });
});

app.post("/api/reports", (req, res, next) => {
  // Supports both JSON requests and multipart/form-data (for an optional photo).
  if (req.is("multipart/form-data")) {
    return upload.single("photo")(req, res, (uploadError) => {
      if (uploadError) return next(uploadError);
      handleReport(req, res);
    });
  }
  handleReport(req, res);
});

function handleReport(req, res) {
  const input = { ...req.body };

  // HTML multipart forms commonly send checkbox values as "on".
  if (input.agreement === "on" || input.agreement === "true" || input.agreement === "1") {
    input.agreement = true;
  }

  const result = reportSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message,
      code: issue.code
    }));

    return res.status(422).type("application/problem+json").json({
      type: "https://example.com/problems/validation-error",
      title: "Request validation failed",
      status: 422,
      detail: "One or more fields are invalid. Correct the listed fields and try again.",
      errors
    });
  }

  const report = {
    id: nextId++,
    ...result.data,
    photo: req.file
      ? { originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size }
      : null,
    createdAt: new Date().toISOString()
  };
  reports.push(report);

  return res.status(201).json({
    message: "Report submitted successfully.",
    report
  });
}

// Consistent structured errors for malformed JSON, uploads, and unexpected failures.
app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  const status = err.status || (err instanceof multer.MulterError ? 400 : 400);
  res.status(status).type("application/problem+json").json({
    type: "https://example.com/problems/bad-request",
    title: status === 413 ? "Request too large" : "Bad request",
    status,
    detail: err.message || "The request could not be processed."
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CampusCare API running at http://localhost:${PORT}`);
    console.log("Health check: GET /api/health");
  });
}

module.exports = { app, reports };
