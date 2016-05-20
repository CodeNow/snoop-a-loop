'use strict'

const _describe = require('mocha').describe;
const _it = require('mocha').it;

const describe = (message, func, shouldRun) => {
  if (shouldRun === undefined || shouldRun) {
    return _describe(message, func)
  }
  return _describe.skip(message, func)
}

const it = (message, func, shouldRun) => {
  if (shouldRun === undefined || shouldRun) {
    return _it(message, func)
  }
  return _it.skip(message, func)
}

module.exports = {
  describe: describe,
  it: it
};
