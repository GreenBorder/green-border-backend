jest.mock('@turf/turf', () => ({
  booleanValid: () => true,
}));

jest.mock('@aws-sdk/client-s3');

const { describe, it, expect } = require('@jest/globals');

const request = require('supertest');
const express = require('express');

const validateRoute = require('../src/routes/validate');

const app = express();
app.use(express.json());
app.use('/validate', validateRoute);

describe('POST /validate/:file_id', () => {

  it('should return 404 when file does not exist', async () => {
    const res = await request(app).post('/validate/does-not-exist');
    expect(res.statusCode).toBe(404);
  });

  it('should return invalid when GeoJSON is malformed', async () => {
    const res = await request(app).post('/validate/invalid-json');
    expect(res.statusCode).toBe(422);
    expect(res.body.status).toBe('invalid');
  });

});
