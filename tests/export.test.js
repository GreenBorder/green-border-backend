const request = require('supertest');
const express = require('express');
const { Readable } = require('stream');
const exportRoute = require('../src/routes/export');

/* -------- MOCK S3 -------- */

jest.mock('../src/s3', () => {
  const { Readable } = require('stream');

  const sourceFileContent = `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[2.352200, 48.856600], [2.362200, 48.856600], [2.362200, 48.866600], [2.352200, 48.866600], [2.352200, 48.856600]]]
      },
      "properties": {
        "id": "parcel_001",
        "custom_field": "user_data"
      }
    }
  ]
}`;

  return {
    s3: {
      send: jest.fn((command) => {
        const key = command?.input?.Key || '';

        if (key.includes('file-not-found')) {
          const error = new Error('NoSuchKey');
          error.code = 'NoSuchKey';
          return Promise.reject(error);
        }

        return Promise.resolve({
          Body: Readable.from([Buffer.from(sourceFileContent)])
        });
      })
    }
  };
});

/* -------- APP -------- */

const app = express();
app.use(express.json());
app.use('/export', exportRoute);

/* -------- TESTS -------- */

describe('POST /export/:file_id', () => {

  it('should export file with original content unchanged', async () => {
    const res = await request(app).post('/export/file-exists');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('geojson_export_file-exists.geojson');

    const exportedContent = res.text;
    const parsedExported = JSON.parse(exportedContent);

    expect(parsedExported.type).toBe('FeatureCollection');
    expect(parsedExported.features.length).toBe(1);
    expect(parsedExported.features[0].properties.id).toBe('parcel_001');
    expect(parsedExported.features[0].properties.custom_field).toBe('user_data');
  });

  it('should preserve user custom properties', async () => {
    const res = await request(app).post('/export/file-exists');
    const exported = JSON.parse(res.text);

    expect(exported.features[0].properties.custom_field).toBe('user_data');
  });

  it('should NOT add Green-Border metadata', async () => {
    const res = await request(app).post('/export/file-exists');
    const exported = JSON.parse(res.text);

    expect(exported.green_border_version).toBeUndefined();
    expect(exported.export_timestamp).toBeUndefined();
    expect(exported.validation_status).toBeUndefined();
    expect(exported.warnings).toBeUndefined();
  });

  it('should return 404 if file not found', async () => {
    const res = await request(app).post('/export/file-not-found');

    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('non trouvé');
  });

  it('should set correct content headers', async () => {
    const res = await request(app).post('/export/file-exists');

    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="geojson_export_.*\.geojson"$/);
    expect(res.headers['content-length']).toBeDefined();
  });

  it('should return raw buffer, not re-serialized JSON', async () => {
    const res = await request(app).post('/export/file-exists');
    const exportedText = res.text;

    expect(exportedText).toContain('  "type": "FeatureCollection"');
    expect(exportedText).toContain('    "type": "Feature"');
  });

});
