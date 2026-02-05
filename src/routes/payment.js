const express = require("express");
const { createToken } = require("../utils/tokens");

const router = express.Router();

router.get("/success", (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "session_id manquant" });
  }

  const token = createToken(session_id);

  res.json({ token });
});

module.exports = router;
