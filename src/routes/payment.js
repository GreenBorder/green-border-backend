const express = require("express");
const { createToken } = require("../utils/tokens");

const router = express.Router();

/**
 * GET /payment/success
 *
 * Rôle :
 * - Générer un token client
 * - Le token est le sessionId Stripe (mode stateless)
 * - AUCUNE gestion de crédits ici
 */
router.get("/success", (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "session_id manquant" });
  }

  // Le token EST le sessionId (mode stateless)
  const token = createToken(session_id);

  res.json({ token });
});

module.exports = router;
