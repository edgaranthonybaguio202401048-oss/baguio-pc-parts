'use strict';
// Loads .env.test for each test worker (dotenv-cli already does this when run via `npm test`).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });
process.env.NODE_ENV = 'test';
