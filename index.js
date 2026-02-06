require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand
} = require("@aws-sdk/client-s3");

const validateRoute = require("./src/routes/validate");
const exportRoute = require("./src/routes/export");
const checkoutRoute = require("./src/routes/checkout");
const webhookRoute = require("./src/routes/webhook");
const paymentRoute = require("./src/routes/payment");

const app = express();

/* =========================
   CORS — SUFFISANT À LUI SEUL
   ========================= */
app.use(
  cors({
    origin: [
      "https://green-border-frontend.vercel.app",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
  "Content-Type",
  "Authorization",
  "x-api-key"
],
    exposedHeaders: ["Content-Disposition", "Content-Length"]
  })
);

// ✅ CORS PREFLIGHT — VERSION ROBUSTE
app.options(/.*/, cors());

/* ❌ SUPPRIMÉ DÉFINITIVEMENT
app.options("/*", cors());
*/

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const PORT = process.env.PORT || 3000;
const FILE_TTL_HOURS = 48;

const s3 = new S3Client({
  region: process.env.SPACES_REGION,
  endpoint: process.env.SPACES_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

/* =========================
   UPLOAD
   ========================= */
app.post("/upload", upload.single("file"), async (req, res) => {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return res.status(415).json({
      error: "Invalid content type",
      message: "Only multipart/form-data is accepted."
    });
  }

  if (!req.file) {
    return res.status(400).json({
      error: "No file provided",
      message: "A single file is required."
    });
  }

  const allowedExtensions = [".json", ".geojson"];
  const allowedMimeTypes = [
    "application/json",
    "application/geo+json",
    "application/octet-stream"
  ];

  const filename = req.file.originalname.toLowerCase();
  const mimeType = req.file.mimetype;

  const hasValidExtension = allowedExtensions.some(ext =>
    filename.endsWith(ext)
  );

  if (!hasValidExtension || !allowedMimeTypes.includes(mimeType)) {
    return res.status(415).json({
      error: "Unsupported file type",
      message: "Only .json and .geojson files are allowed."
    });
  }

  const fileId = uuidv4();
  const objectKey = `uploads/${fileId}/source.geojson`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: objectKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    })
  );

  return res.status(200).json({
    status: "stored",
    file_id: fileId,
    expires_in_hours: 48
  });
});

/* =========================
   FILE CHECK
   ========================= */
app.get("/files/:file_id", async (req, res) => {
  const { file_id } = req.params;
  const objectKey = `uploads/${file_id}/source.geojson`;

  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: objectKey
      })
    );

    const lastModified = new Date(head.LastModified);
    const expiresAt = new Date(
      lastModified.getTime() + FILE_TTL_HOURS * 60 * 60 * 1000
    );

    if (Date.now() > expiresAt.getTime()) {
      return res.status(410).json({
        file_id,
        status: "expired"
      });
    }

    return res.status(200).json({
      file_id,
      status: "available",
      size: head.ContentLength,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({
        file_id,
        status: "not_found"
      });
    }

    return res.status(500).json({
      error: "internal_error"
    });
  }
});

/* =========================
   STRIPE WEBHOOK (AVANT JSON)
   ========================= */
app.use("/webhook", webhookRoute);

/* =========================
   ROUTES JSON
   ========================= */
app.use(express.json({ limit: "10kb" }));

app.use("/validate", validateRoute);
app.use("/export", exportRoute);
app.use("/checkout", checkoutRoute);
app.use("/payment", paymentRoute);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
