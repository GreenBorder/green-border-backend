jest.mock('@turf/turf', () => ({
  area: jest.fn((feature) => {
    const coords = feature.geometry.coordinates[0];
    if (!coords || coords.length < 4) return 0;

    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);

    const widthMeters = (Math.max(...lons) - Math.min(...lons)) * 111000;
    const heightMeters = (Math.max(...lats) - Math.min(...lats)) * 111000;

    return widthMeters * heightMeters;
  }),

  bbox: jest.fn((feature) => {
    const coords = feature.geometry.coordinates[0];
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    return [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats)
    ];
  }),

  intersect: jest.fn((f1, f2) => {
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[1,1],[1,2],[2,2],[2,1],[1,1]]]
      }
    };
  }),

  feature: jest.fn(g => ({ type: 'Feature', geometry: g }))
}));


const request = require('supertest');
const express = require('express');
const { Readable } = require('stream');

const validateRoute = require('../src/routes/validate');

/* ---------- MOCK S3 ---------- */
jest.mock('../src/s3', () => {
  const { Readable } = require('stream');

  const streamFromJSON = (obj) =>
    Readable.from([Buffer.from(JSON.stringify(obj))]);

  return {
    s3: {
      send: jest.fn((command) => {
        const key = command?.input?.Key || '';

        if (key.includes('invalid-json')) {
  return Promise.resolve({
    Body: Readable.from([Buffer.from('{ invalid json')])
  });
}

        if (key.includes('file-size-large')) {
          return Promise.resolve({ Body: streamFromJSON(mockGeoJSONFileSizeLarge()) });
        }
        if (key.includes('precision-excess')) {
          return Promise.resolve({ Body: streamFromJSON(mockGeoJSONPrecisionExcess()) });
        }
        if (key.includes('degenerate-micro')) {
          return Promise.resolve({ Body: streamFromJSON(mockGeoJSONDegenerateMicro()) });
        }
        if (key.includes('degenerate-sliver')) {
          return Promise.resolve({ Body: streamFromJSON(mockGeoJSONDegenerateSliver()) });
        }
        if (key.includes('internal-overlap')) {
          return Promise.resolve({ Body: streamFromJSON(mockGeoJSONInternalOverlap()) });
        }
        if (key.includes('too-many-features')) {
          return Promise.resolve({ Body: streamFromJSON(mockGeoJSONTooManyFeatures()) });
        }

        return Promise.resolve({ Body: streamFromJSON(mockGeoJSONValid()) });
      })
    }
  };
});

/* ---------- APP ---------- */
const app = express();
app.use(express.json());
app.use('/validate', validateRoute);

/* ---------- TESTS ---------- */
describe('POST /validate/:file_id — WARNINGS', () => {

  it('should return valid with no warnings', async () => {
    const res = await request(app).post('/validate/valid-no-warning');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('valid');
    expect(res.body.warnings).toEqual([]);
  });

  it('should return warning FILE_SIZE_LARGE', async () => {
    const res = await request(app).post('/validate/file-size-large');
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings.some(w => w.code === 'FILE_SIZE_LARGE')).toBe(true);
  });

  it('should return warning PRECISION_EXCESS', async () => {
    const res = await request(app).post('/validate/precision-excess');
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings.some(w => w.code === 'PRECISION_EXCESS')).toBe(true);
  });

  it('should return warning DEGENERATE_MICRO_SURFACE', async () => {
    const res = await request(app).post('/validate/degenerate-micro');
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings.some(w => w.code === 'DEGENERATE_MICRO_SURFACE')).toBe(true);
  });

  it('should return warning DEGENERATE_SLIVER', async () => {
    const res = await request(app).post('/validate/degenerate-sliver');
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings.some(w => w.code === 'DEGENERATE_SLIVER')).toBe(true);
  });

  it('should return warning INTERNAL_OVERLAP', async () => {
    const res = await request(app).post('/validate/internal-overlap');
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings.some(w => w.code === 'INTERNAL_OVERLAP')).toBe(true);
  });

  it('should return warning OVERLAP_CHECK_SKIPPED', async () => {
    const res = await request(app).post('/validate/too-many-features');
    expect(res.statusCode).toBe(200);
    expect(res.body.warnings.some(w => w.code === 'OVERLAP_CHECK_SKIPPED')).toBe(true);
  });

  it('should not return warnings when blocking error occurs', async () => {
    const res = await request(app).post('/validate/invalid-json');
    expect(res.statusCode).toBe(422);
    expect(res.body.warnings).toBeUndefined();
  });

});

/* ---------- FIXTURES ---------- */
function mockGeoJSONValid() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [2.352200, 48.856600],
          [2.362200, 48.856600],
          [2.362200, 48.866600],
          [2.352200, 48.866600],
          [2.352200, 48.856600]
        ]]
      },
      properties: { id: 'normal_parcel' }
    }]
  };
}

function mockGeoJSONFileSizeLarge() {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: 5 }, () => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0,0],[0,1],[1,1],[1,0],[0,0]]]
      },
      properties: {
        payload: 'x'.repeat(6 * 1024 * 1024)
      }
    }))
  };
}

function mockGeoJSONPrecisionExcess() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0.123456789,0.123456789],[0,1],[1,1],[1,0],[0.123456789,0.123456789]]]
      },
      properties: {}
    }]
  };
}

function mockGeoJSONDegenerateMicro() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0,0],[0,0.000001],[0.000001,0.000001],[0.000001,0],[0,0]]]
      },
      properties: {}
    }]
  };
}

function mockGeoJSONDegenerateSliver() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0,0],[0,100],[0.001,100],[0.001,0],[0,0]]]
      },
      properties: {}
    }]
  };
}

function mockGeoJSONInternalOverlap() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0,0],[0,2],[2,2],[2,0],[0,0]]]
        },
        properties: {}
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[1,1],[1,3],[3,3],[3,1],[1,1]]]
        },
        properties: {}
      }
    ]
  };
}

function mockGeoJSONTooManyFeatures() {
  return {
    type: 'FeatureCollection',
    features: new Array(1500).fill({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0,0],[0,1],[1,1],[1,0],[0,0]]]
      },
      properties: {}
    })
  };
}
