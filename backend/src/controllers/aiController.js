'use strict';
const wrapAll = require('./_wrap');
const { aiAdvisorService } = require('../services');
const { ok } = require('../utils/response');

module.exports = wrapAll({
  async buildAdvisor(req, res) {
    ok(res, await aiAdvisorService.advise(req.body));
  },
});
