'use strict'
require('loadenv')()

const client = require('./lib/client.js')
const opts = require('./lib/utils/env-arg-parser')
const promisifyClientModel = require('./lib/utils/promisify-client-model')

before(() => {
  return promisifyClientModel(client).githubLoginAsync(opts.ACCESS_TOKEN)
    .then(() => {
      opts.connectSid = client.connectSid
    })
})

after((done) => {
  client.logout(done)
})

const testConfiguration = {
  client,
  opts
}

require('./tests/0-cleanup')(testConfiguration)
require('./tests/1-new-service-containers')(testConfiguration)
require('./tests/2-new-repository-containers')(testConfiguration)
require('./tests/3-new-repository-containers-mirroring')(testConfiguration)
require('./tests/4-rebuild-repo-container')(testConfiguration)
require('./tests/5-github-webhooks')(testConfiguration)
require('./tests/6-isolation')(testConfiguration)
require('./tests/7-container-to-container-dns')(testConfiguration)
require('./tests/8-navi-urls')(testConfiguration)
require('./tests/9-new-service-containers-with-custom-dockerfile')(testConfiguration)
require('./tests/10-private-docker-registry')(testConfiguration)
