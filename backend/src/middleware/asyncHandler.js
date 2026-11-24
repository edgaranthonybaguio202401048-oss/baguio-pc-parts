'use strict';
/**
 * DECORATOR.
 * Wraps an async controller and adds one behaviour – forwarding rejected
 * promises to Express's error pipeline – without editing the controller.
 * Express 4 does not catch async errors by itself; without this every
 * controller would need its own try/catch.
 */
module.exports = function asyncHandler(handler) {
  return function decorated(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
