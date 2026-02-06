const express = require('express');
const router = express.Router();
const cors = require("cors");

router.options(
  "/:file_id",
  cors({
    origin: [
      "https://green-border-frontend.vercel.app",
      "http://localhost:3000",
    ],
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    exposedHeaders: ["Content-Disposition", "Content-Length"],
  })
);


const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../s3');
const { consumeCredit, getCredits } = require("../utils/credits");

const BUCKET_NAME = process.env.SPACES_BUCKET;

/**
 * POST /export/:file_id
 *
 * Exporte le fichier GeoJSON validé.
 *
 * PRINCIPE : Export neutre, fichier source INCHANGÉ.
 *
 * Pré-requis :
 * - Fichier doit avoir été validé (POST /validate/:file_id)
 * - Validation bloquante doit être OK (pas de 422)
 *
 * Warnings : N'empêchent PAS l'export
 */
router.post('/:file_id', async (req, res) => {
  const { file_id } = req.params;

    // === CONTRÔLE CRÉDITS (OBLIGATOIRE) ===
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(403).json({
      status: "error",
      message: "Token manquant"
    });
  }

  const sessionId = token;

const remainingCredits = getCredits(sessionId);

if (remainingCredits <= 0) {
  console.error("[EXPORT] Crédits épuisés pour session:", sessionId);
  return res.status(403).json({
    status: "error",
    message: "Crédits épuisés"
  });
}

  try {
    // ÉTAPE 1 : Vérifier que le fichier existe
    const fileExists = await checkFileExists(file_id);
    if (!fileExists) {
      return res.status(404).json({
        status: 'error',
        message: 'Fichier non trouvé'
      });
    }

    // ÉTAPE 2 : Vérifier que le fichier a été validé
    // Note : En production, vérifier via DB (table validation_results)
    // Pour V1 simplifiée : si le fichier existe, on assume qu'il a été validé
    // TODO V2 : Ajouter vérification DB stricte

    // ÉTAPE 3 : Télécharger le fichier SOURCE (non modifié)
    const fileBuffer = await downloadFileBuffer(file_id);

    // ÉTAPE 4 : Retourner le fichier TEL QUEL
    const filename = `geojson_export_${file_id}.geojson`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);

        // Décrémenter UN crédit après export réussi
    const ok = consumeCredit(sessionId);
    if (!ok) {
      return res.status(403).json({
        status: "error",
        message: "Crédits épuisés"
      });
    }

    // CRITIQUE : Envoyer le buffer BRUT, pas JSON.stringify()
    return res.send(fileBuffer);

  } catch (error) {
    console.error('Export error:', error);

    if (error.code === 'NoSuchKey') {
      return res.status(404).json({
        status: 'error',
        message: 'Fichier non trouvé'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne serveur'
    });
  }
});

/**
 * Vérifie si un fichier existe dans Spaces
 */
async function checkFileExists(file_id) {
  try {
    const key = `uploads/${file_id}/source.geojson`;
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3.send(command);
    return true;
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

/**
 * Télécharge le fichier source en tant que Buffer
 *
 * CRITIQUE : Ne pas parser en JSON, retourner le Buffer brut
 */
async function downloadFileBuffer(file_id) {
  const key = `uploads/${file_id}/source.geojson`;
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  const response = await s3.send(command);

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

module.exports = router;
