const express = require("express");

const app = express();

app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/upload", (req, res) => {
  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("multipart/form-data")) {
    return res.status(415).json({
      error: "Upload not enabled",
      message: "File upload is not active in this version."
    });
  }

  return res.status(501).json({
    error: "Upload not enabled",
    message: "File upload is not active in this version."
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
