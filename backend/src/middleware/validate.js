'use strict';
const { Errors } = require('../utils/errors');

/**
 * DECORATOR-style validation middleware.
 * validate({ body, query, params }) parses each part with a Zod schema.
 * Schemas are declared `.strict()` so unknown fields are rejected, and
 * every string field is typed – so an injection object such as
 * { "$ne": null } in place of an email fails with 422 (S-05).
 * Parsed (coerced, defaulted) values replace the raw input.
 */
module.exports = function validate(schemas) {
  return function validator(req, _res, next) {
    const details = [];
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            location: part,
            field: issue.path.join('.') || (issue.keys ? issue.keys.join(',') : part),
            message: issue.message,
          });
        }
      } else if (part === 'query') {
        // req.query is a getter in some Express versions – store separately
        req.validatedQuery = result.data;
      } else {
        req[part] = result.data;
      }
    }
    if (details.length) return next(Errors.validation('VALIDATION_ERROR', 'Request validation failed', details));
    return next();
  };
};
