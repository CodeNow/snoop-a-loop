'use strict'
const argv = require('yargs').argv
const _ = require('lodash')


const environments = {
  'staging': 'api-staging-codenow.runnableapp.com',
  'stage': 'api-staging-codenow.runnableapp.com',
  'gamma': 'https://api.runnable-gamma.com',
  'epsilon': 'https://api.runnable-beta.com',
  'beta': 'https://api.runnable-beta.com',
  'delta': 'https://api.runnable.io',
  'bear': 'https://api.runnable.rocks',
  'grizzly': 'https://api.runnablecloud.com'
}

const userContentDomains = {
  'runnableapp.com': 'runnable-staging.com',
  'runnable-beta.com': 'runnablecloud.com',
  'runnable-gamma.com': 'runnablecloud.com',
  'runnable.rocks': 'runnable-beta.com',
  'runnablecloud.com': 'runnabae.com',
  'runnable.io': 'runnableapp.com' // runnable.io
}

const GITHUB_IDS = {
  'Runnable': 2828361,
  'thejsj': 1981198,
  'CodeNow': 2335750
}

const opts = {}

const getUrl = (environments, argv) => {
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
  return url
}

const getSocketServerUrl = (apiUrl) => {
  if (apiUrl  === environments.staging) {
    return apiUrl
  }
  return apiUrl.replace('api', 'apisock')
}

opts.API_URL = getUrl(environments, argv) || argv.url || process.env.API_URL || environments.gamma
opts.API_SOCKET_SERVER = process.env.API_SOCKET_SERVER || getSocketServerUrl(opts.API_URL)

opts.ACCESS_TOKEN = argv['auth-token'] || process.env.AUTH_TOKEN
opts.GITHUB_USERNAME = argv['org'] || 'Runnable'

opts.GITHUB_OAUTH_ID = argv['org-id'] || GITHUB_IDS[opts.GITHUB_USERNAME]
opts.GITHUB_REPO_NAME = 'hello-node-rethinkdb'
opts.SERVICE_NAME = 'RethinkDB'
opts.TIMEOUT = argv.timeout || process.env.TIMEOUT || 20000

opts.USER_CONTENT_DOMAIN = argv['user-content-domain'] || userContentDomains[opts.API_URL.match(/runnable[\-A-z.]*/i)]
opts.REPO_CONTAINER_MATCH = /succesfully.*connected.*to.*db/i
opts.SERVICE_CONTAINER_MATCH = /rethinkdb.*administration.*console/i

opts.QUAY_API_TOKEN = 'YhLUDmefqQdmTK5BiRUdMJ50ia0R8W2VhLUJ5Sxn'

opts.NO_LOGS = (argv['no_logs']) ? true : false;
opts.NO_CLEANUP = (argv['no_cleanup']) ? true : false;
opts.NO_REBUILD = (argv['no_rebuild']) ? true : false;
opts.NO_WEBHOOKS = (argv['no_webhooks']) ? true : false;
opts.NO_DNS = (argv['no_dns']) ? true : false;
opts.NO_NAVI = (argv['no_navi']) ? true : false;
opts.ISOLATION = (argv['isolation']) ? true : false;
opts.NO_PRIVATE_REGISTRY = (argv['no_private_registry']) ? true : false;

if (!opts.GITHUB_OAUTH_ID) {
  throw new Error('Github ID not found for org `' + opts.GITHUB_USERNAME + '`')
}

module.exports = opts;
