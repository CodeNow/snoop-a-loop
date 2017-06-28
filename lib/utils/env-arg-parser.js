'use strict'
const argv = require('yargs').argv
const _ = require('lodash')

const possibleEnvs = [
  'staging',
  'stage',
  'gamma',
  'epsilon',
  'beta',
  'delta',
  'bear',
  'grizzly',
  'local'
]

const environments = {
  'staging': 'api-staging-codenow.runnableapp.com',
  'stage': 'api-staging-codenow.runnableapp.com',
  'gamma': 'https://api.runnable-gamma.com',
  'epsilon': 'https://api.runnable-beta.com',
  'beta': 'https://api.runnable-beta.com',
  'delta': 'https://api.runnable.io',
  'bear': 'https://api.runnable.rocks',
  'grizzly': 'https://api.runnablecloud.com',
  'local': 'http://localhost:3030'
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

const sshKeyPrefixMap = {
  gamma: 'RunnableGamma',
  delta: 'Runnable'
}

const opts = {}

const env = _.intersection(Object.keys(argv), possibleEnvs)[0] || 'gamma'

const getSocketServerUrl = (apiUrl) => {
  if (env === 'staging') {
    return apiUrl
  }
  return apiUrl.replace('api', 'apisock')
}

opts.ACCESS_TOKEN = argv['auth-token'] || process.env.AUTH_TOKEN
opts.API_URL = environments[env] || argv.url || process.env.API_URL || environments.gamma
opts.GITHUB_USERNAME = argv['org'] || 'Runnable'
opts.GITHUB_REPO_NAME = 'hello-node-rethinkdb'
opts.REPO_CONTAINER_MATCH = /succesfully.*connected.*to.*db/i
opts.SERVICE_CONTAINER_MATCH = /rethinkdb.*administration.*console/i
opts.SERVICE_NAME = 'RethinkDB'
opts.SNOOP_TESTS_REPO = 'snoop-tests'
opts.SSH_KEY_PREFIX = sshKeyPrefixMap[env] || 'Runnable'
opts.TIMEOUT = argv.timeout || process.env.TIMEOUT || 20000

// Requires previous vars to be handled
opts.GITHUB_OAUTH_ID = argv['org-id'] || GITHUB_IDS[opts.GITHUB_USERNAME]
opts.USER_CONTENT_DOMAIN = argv['user-content-domain'] || userContentDomains[opts.API_URL.match(/runnable[-A-z.]*/i)]
opts.API_SOCKET_SERVER = process.env.API_SOCKET_SERVER || getSocketServerUrl(opts.API_URL)

// Application access token scopes are read, admin:org
// Generated from the generate token tab in the application snoop in quay
opts.QUAY_API_TOKEN = 'YhLUDmefqQdmTK5BiRUdMJ50ia0R8W2VhLUJ5Sxn'

opts.NO_LOGS = !!(argv['no_logs'])
opts.NO_CLEANUP = !!(argv['no_cleanup'])
opts.NO_REBUILD = !!(argv['no_rebuild'])
opts.NO_WEBHOOKS = !!(argv['no_webhooks'])
opts.NO_DNS = !!(argv['no_dns'])
opts.NO_NAVI = !!(argv['no_navi'])
opts.ISOLATION = !!(argv['isolation'])
opts.NO_PRIVATE_REGISTRY = !!(argv['no_private_registry'])

if (!opts.GITHUB_OAUTH_ID) {
  throw new Error('Github ID not found for org `' + opts.GITHUB_USERNAME + '`')
}

module.exports = opts
