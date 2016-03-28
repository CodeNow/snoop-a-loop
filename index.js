'use strict';
var Promise = require('bluebird')
var branchesConstructor = require('./branches')
var Browser = require('./browser')
require('string.prototype.includes');

var token = process.env.AUTH_TOKEN || 'c3031013be7b9543dcb36b92ec2885fae4e63714'
var repoPath = process.env.REPO_PATH || 'Runnable/nightmare'
var sha = process.env.REPO_SHA || '8745fb0b5eebab8a1f578ae03401595cdc4849c0'
var host = process.env.HOST || 'https://runnable-beta.com/'
var LIMIT = process.env.LIMIT || 20

var branches = branchesConstructor({
  token: token,
  repoPath: repoPath,
  sha: sha,
  LIMIT: LIMIT
})
var log = function (...args) {
  console.log.apply(console, [new Date() + ': '].concat(args));
}
var startCreatingBranchesTime;
var finishCreatingBranchesTime;

before(() => {

})

before(() => {

})

describe('New Repository Containers', () => {

  describe('Create A Container', () => {
    before(() => {

    })

    it('should create the container', () => {

    })
  })

})

if (process.argv[1].includes('index.js') && process.argv[2].includes('--test')) {
  var browser = new Browser({
    host: host
  });
  log('Attempt login to Runnable', token)
  browser.setup()
    .then(() => {
      console.log('LoginToRunnable')
      return browser.loginToRunnable(token)
    })
    .then(() => {
       console.log('REFRSkkkH')
      return browser.refresh()
    })
    .then(() => {
      console.log('Logged In')
      return browser.alertConfigAPIHost()
    })

    function exitHandler (a, b, c) {
      console.log('Exit Handler', a, b, c)
      browser.close()
      process.exit()
    }

  process.on('exit', exitHandler.bind(null,{cleanup:true}));
  process.on('SIGINT', exitHandler.bind(null, {exit:true}));
  process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
}
