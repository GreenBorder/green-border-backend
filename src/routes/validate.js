const express = require('express');

const router = express.Router();

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const turf = require('@turf/turf');

// Configuration Spaces (à adapter selon votre .env)

const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT, // ex: https://fra1.digitaloceanspaces.com
  region: process.env.SPACES_REGION, // ex: fra1
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET
  }
});

const BUCKET_NAME = process.env.SPACES_BUCKET; // ex: green-border-files

// POST /validate/:file_id

router.post('/:file_id', async (req, res) => {
  const { file_id } = req.params;

  try {

    // ÉTAPE 2 : TÉLÉCHARGEMENT FICHIER (voir ci-dessous)
    const fileContent = await downloadFileFromSpaces(file_id);
    
    // ÉTAPE 3 : CONTRÔLES BLOQUANTS (voir ci-dessous)
    const validationResult = validateGeoJSON(fileContent, file_id);
    
    if (!validationResult.valid) {
      return res.status(422).json({
        status: 'invalid',
        error_code: validationResult.error_code,
        message: validationResult.message,
        feature_id: validationResult.feature_id || null
      });
    }

    // Tous les contrôles passés
    return res.status(200).json({
      status: 'valid'
    });

  } catch (error) {

    // Gestion erreurs système (fichier absent, etc.)
    if (error.code === 'NoSuchKey') {
      return res.status(404).json({
        status: 'error',
        message: 'Fichier non trouvé'
      });
    }
    
    if (error.name === 'SyntaxError') {
      return res.status(422).json({
        status: 'invalid',
        error_code: 'INVALID_JSON',
        message: 'Format invalide. GeoJSON requis (RFC 7946)'
      });
    }

    // Erreur interne serveur
    console.error('Validation error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne serveur'
    });
  }
});

// PLACEHOLDER - Fonctions à implémenter ci-dessous

async function downloadFileFromSpaces(file_id) {
  const key = `uploads/${file_id}/source.geojson`;

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  const response = await s3Client.send(command);

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  return JSON.parse(buffer.toString('utf-8'));
}

function validateGeoJSON(content, file_id) {

  if (!content || typeof content !== 'object') {
    return {
      valid: false,
      error_code: 'INVALID_JSON',
      message: 'Format invalide. GeoJSON requis (RFC 7946)'
    };
  }

  if (content.type !== 'FeatureCollection') {
    return {
      valid: false,
      error_code: 'INVALID_GEOJSON_TYPE',
      message: 'Le GeoJSON doit être de type FeatureCollection'
    };
  }

  if (!Array.isArray(content.features)) {
    return {
      valid: false,
      error_code: 'INVALID_FEATURES',
      message: 'Le champ features doit être un tableau'
    };
  }

  for (let i = 0; i < content.features.length; i++) {
    const feature = content.features[i];

    if (!feature.type || feature.type !== 'Feature') {
      return {
        valid: false,
        error_code: 'INVALID_FEATURE_TYPE',
        message: 'Chaque élément doit être un Feature',
        feature_id: i
      };
    }

    if (!feature.geometry) {
      return {
        valid: false,
        error_code: 'MISSING_GEOMETRY',
        message: 'Chaque Feature doit contenir une géométrie',
        feature_id: i
      };
    }

    try {
      turf.booleanValid(feature);
    } catch (e) {
      return {
        valid: false,
        error_code: 'INVALID_GEOMETRY',
        message: 'Géométrie invalide',
        feature_id: i
      };
    }
  }

  return {
    valid: true
  };
}

module.exports = router;
