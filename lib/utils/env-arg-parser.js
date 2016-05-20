'use strict'
const argv = require('yargs').argv
const _ = require('lodash')

const opts = {}

const environments = {
  'staging': 'api-staging-codenow.runnableapp.com',
  'stage': 'api-staging-codenow.runnableapp.com',
  'gamma': 'https://api.runnable-gamma.com',
  'epsilon': 'https://api.runnable-beta.com',
  'beta': 'https://api.runnable-beta.com',
  'delta': 'https://api.runnable.io'
}
const environmentNames = Object.keys(environments)
let url
if (_.intersection(Object.keys(argv), environmentNames)) {
  url = _.find(environments, function (url, env) {
    if(_.includes(Object.keys(argv), env)) {
      return environments[env]
    }
    return null
  })
}
opts.API_URL = url || process.env.API_URL || environments.gamma
if (opts.API_URL === environments.staging) {
  opts.API_SOCKET_SERVER = process.env.API_SOCKET_SERVER || opts.API_URL
} else {
  opts.API_SOCKET_SERVER = process.env.API_SOCKET_SERVER || opts.API_URL.replace('api', 'apisock')
}
opts.ACCESS_TOKEN = argv['auth-token'] || process.env.AUTH_TOKEN || '186215ea8d079e6cb8d012f89d061c2527357a37'
opts.GITHUB_OAUTH_ID = 2828361 // Runnable
opts.GITHUB_REPO_NAME = 'hello-node-rethinkdb'
opts.GITHUB_USERNAME = 'Runnable'
opts.SERVICE_NAME = 'RethinkDB'
opts.TIMEOUT = argv.timeout || process.env.TIMEOUT || 20000
const userContentDomains = {
  'runnableapp': 'runnable-staging.com',
  'runnable-beta': 'runnablecloud.com',
  'runnable-gamma': 'runnable.ninja',
  'runnable': 'runnableapp.com' // runnable.io
}
opts.USER_CONTENT_DOMAIN = userContentDomains[opts.API_URL.match(/runnable[\-A-z]*/i)]
opts.REPO_CONTAINER_MATCH = /succesfully.*connected.*to.*db/i
opts.SERVICE_CONTAINER_MATCH = /rethinkdb.*administration.*console/i

opts.NO_LOGS = (argv['no_logs']) ? true : false;
opts.NO_CLEANUP = (argv['no_cleanup']) ? true : false;
opts.NO_REBUILD = (argv['no_rebuild']) ? true : false;
opts.NO_WEBHOOKS = (argv['no_webhooks']) ? true : false;
opts.NO_DNS = (argv['no_dns']) ? true : false;
opts.NO_NAVI = (argv['no_navi']) ? true : false;

module.exports = opts;
