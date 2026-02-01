const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const PORT = process.env.PORT || 3000;

const s3 = new S3Client({
  region: process.env.SPACES_REGION,
  endpoint: process.env.SPACES_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

/* ROUTE UPLOAD — SANS express.json */
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

/* ROUTES JSON — express.json APPLIQUÉ ICI */
app.use(express.json({ limit: "10kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
