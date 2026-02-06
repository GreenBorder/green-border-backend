const express = require("express");
const { createToken } = require("../utils/tokens");
const { addCredits } = require("../utils/credits");

const router = express.Router();

router.get("/success", (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "session_id manquant" });
  }

  // Création du token client
  const token = createToken(session_id);

  // AJOUT DES CRÉDITS (exemple : 10 crédits)
  // ⚠️ À adapter ensuite selon le pack
  addCredits(token, 10);

  res.json({ token });
});

module.exports = router;
