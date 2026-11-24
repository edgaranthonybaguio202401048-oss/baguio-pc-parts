'use strict';
const express = require('express');
const webhooks = require('../controllers/webhookController');

/**
 * Mounted BEFORE express.json() so the body stays a raw Buffer –
 * signature verification must run on the exact bytes the gateway sent.
 */
const router = express.Router();
const raw = express.raw({ type: '*/*', limit: '256kb' });

router.post('/maya', raw, webhooks.maya);
router.post('/paymongo', raw, webhooks.paymongo);

module.exports = router;
