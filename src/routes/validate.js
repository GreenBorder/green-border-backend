const express = require('express');

const router = express.Router();

const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../s3');

const turf = require('@turf/turf');

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

    // Tous les contrôles bloquants passés
    // Détecter les warnings NON bloquants
    const warnings = computeWarnings(fileContent);

    return res.status(200).json({
     status: 'valid',
    warnings: warnings
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

  const response = await s3.send(command);

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

  if (content.features.length === 0) {
  return {
    valid: false,
    error_code: 'EMPTY_COLLECTION',
    message: 'Fichier vide. Aucune parcelle détectée'
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
  }

  // VALIDATION BLOQUANTE MINIMALE UNIQUEMENT
  // Les validations topologiques non-bloquantes sont dans computeWarnings()

  return {
    valid: true
  };
}

function computeWarnings(geojson) {
  const warnings = [];

  const fileSizeWarning = checkFileSize(geojson);
  if (fileSizeWarning) warnings.push(fileSizeWarning);

  const precisionWarnings = checkPrecisionExcess(geojson);
  warnings.push(...precisionWarnings);

  const degenerateWarnings = checkDegenerateGeometries(geojson);
  warnings.push(...degenerateWarnings);

  const overlapWarnings = checkInternalOverlaps(geojson);
  warnings.push(...overlapWarnings);

  return warnings;
}

function checkFileSize(geojson) {
  const jsonString = JSON.stringify(geojson);
  const sizeInBytes = Buffer.byteLength(jsonString, 'utf-8');
  const sizeInMB = sizeInBytes / (1024 * 1024);

  const THRESHOLD_MB = 25;

  if (sizeInMB > THRESHOLD_MB) {
    return {
      code: 'FILE_SIZE_LARGE',
      message: `Fichier volumineux (${sizeInMB.toFixed(2)} MB). Export risque rejet TRACES (limite 25 MB)`,
      severity: 'medium'
    };
  }

  return null;
}

function checkPrecisionExcess(geojson) {
  const warnings = [];
  const MAX_DECIMALS = 6;

  for (let i = 0; i < geojson.features.length; i++) {
    const feature = geojson.features[i];
    const featureId = feature.id || feature.properties?.id || `feature_${i}`;

    const coords = extractAllCoordinates(feature.geometry);
    let hasExcessPrecision = false;

    for (const coord of coords) {
      const [lon, lat] = coord;

      const lonDecimals = countDecimals(lon);
      const latDecimals = countDecimals(lat);

      if (lonDecimals > MAX_DECIMALS || latDecimals > MAX_DECIMALS) {
        hasExcessPrecision = true;
        break;
      }
    }

    if (hasExcessPrecision) {
      warnings.push({
        code: 'PRECISION_EXCESS',
        message: `Précision excessive détectée (> 6 décimales). Parcelle ID: ${featureId}`,
        feature_id: featureId,
        severity: 'low'
      });
    }
  }

  return warnings;
}

function countDecimals(value) {
  const str = value.toString();
  const parts = str.split('.');
  return parts.length > 1 ? parts[1].length : 0;
}

function extractAllCoordinates(geometry) {
  const coords = [];

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      coords.push(...ring);
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        coords.push(...ring);
      }
    }
  }

  return coords;
}

function checkDegenerateGeometries(geojson) {
  const warnings = [];

  for (let i = 0; i < geojson.features.length; i++) {
    const feature = geojson.features[i];
    const featureId = feature.id || feature.properties?.id || `feature_${i}`;

    try {
      const area = turf.area(feature);

      const bbox = turf.bbox(feature);
      const widthDeg = bbox[2] - bbox[0];
      const heightDeg = bbox[3] - bbox[1];

      const widthMeters =
        widthDeg * 111000 * Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180);
      const heightMeters = heightDeg * 111000;

      const longerSide = Math.max(widthMeters, heightMeters);
      const shorterSide = Math.min(widthMeters, heightMeters);

      const ratio = shorterSide > 0 ? longerSide / shorterSide : Infinity;

      // MICRO-SURFACE : très petite surface, mais PAS un sliver
      if (area < 1 && ratio < 50) {
        warnings.push({
          code: 'DEGENERATE_MICRO_SURFACE',
          message: `Géométrie suspecte détectée : micro-surface (${area.toFixed(
            4
          )} m²). Parcelle ID: ${featureId}`,
          feature_id: featureId,
          severity: 'medium'
        });
        continue;
      }

      // SLIVER : très allongé, mais PAS microscopique
      if (area >= 1 && ratio > 100) {
        warnings.push({
          code: 'DEGENERATE_SLIVER',
          message: `Géométrie suspecte détectée : polygone ultra-fin (ratio ${ratio.toFixed(
            0
          )}:1). Parcelle ID: ${featureId}`,
          feature_id: featureId,
          severity: 'medium'
        });
      }
    } catch (e) {
      // silence volontaire
    }
  }

  return warnings;
}

function checkInternalOverlaps(geojson) {
  const warnings = [];
  const features = geojson.features;

  const MAX_FEATURES_FOR_OVERLAP_CHECK = 1000;
  if (features.length > MAX_FEATURES_FOR_OVERLAP_CHECK) {
    warnings.push({
      code: 'OVERLAP_CHECK_SKIPPED',
      message: `Vérification chevauchements ignorée (trop de parcelles : ${features.length})`,
      severity: 'low'
    });
    return warnings;
  }

  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const feature1 = features[i];
      const feature2 = features[j];

      const id1 = feature1.id || feature1.properties?.id || `feature_${i}`;
      const id2 = feature2.id || feature2.properties?.id || `feature_${j}`;

      try {
        const intersection = turf.intersect(
          turf.feature(feature1.geometry),
          turf.feature(feature2.geometry)
        );

        if (intersection) {
          const overlapArea = turf.area(intersection);

          if (overlapArea > 0.1) {
            warnings.push({
              code: 'INTERNAL_OVERLAP',
              message: `Chevauchement détecté entre parcelles ${id1} et ${id2} (${overlapArea.toFixed(2)} m²)`,
              feature_id: id1,
              related_feature_id: id2,
              severity: 'high'
            });
          }
        }
      } catch (e) {}
    }
  }

  return warnings;
}

module.exports = router;
