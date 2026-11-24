'use strict';
const asyncHandler = require('../middleware/asyncHandler');

/** Applies the asyncHandler DECORATOR to every handler of a controller object. */
module.exports = function wrapAll(handlers) {
  return Object.fromEntries(Object.entries(handlers).map(([k, fn]) => [k, asyncHandler(fn)]));
};
