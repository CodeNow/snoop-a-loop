'use strict'
const AuthenticatedRequest = require('../lib/request/authenticated-request.js')
const common = require('../lib/utils/common')
const InstanceUtils = require('../lib/instance/util')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
require('chai').use(require('dirty-chai'))

module.exports = (config) => {
  const opts = config.opts
  const client = config.client

  describe('12. Compose Extends', function () {
    if (opts.NO_COMPOSE_EXTENDS) this.pending = true

    describe('create new instance from a compose file with extends', () => {
      let testInstance
      let testPath = 'compose-extends'
      before(function () {
        this.timeout(50000)
        const myParams = {
          method: 'POST',
          uri: opts.API_URL + '/docker-compose-cluster/',
          json: {
            repo: `${opts.GITHUB_USERNAME}/${opts.SNOOP_TESTS_REPO}`,
            branch: 'master',
            filePath: 'compose-extends-compose.yml',
            name: `${testPath}-test-${common.randInt}`,
            githubId: opts.GITHUB_OAUTH_ID
          }
        }
        return AuthenticatedRequest.apiRequest(myParams)
          .then(() => {
            const waitForInstance = () => {
              return Promise.delay(500)
                .then(() => {
                  return client.fetchInstancesAsync({ githubUsername: opts.GITHUB_USERNAME })
                })
                .then((instances) => {
                  const foundInstance = instances.models.find((instance) => {
                    return instance.attrs.name === `${testPath}-test-${common.randInt}-web`
                  })
                  if (!foundInstance) {
                    return waitForInstance()
                  }
                  console.log('Instance created', `${testPath}-test-${common.randInt}-web`)
                  testInstance = promisifyClientModel(foundInstance)
                })
            }
            return waitForInstance()
          })
      })

      after(() => {
        return testInstance.destroyAsync()
      })

      it('should build and start properly', () => {
        return InstanceUtils.assertInstanceIsRunning(testInstance)
      })
    })
  })
}
