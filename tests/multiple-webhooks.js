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

  describe('Multiple Webhooks', function () {
    if (opts.NO_MULTIPLE_WEBHOOKS) this.pending = true

    describe('create multiple instances for multiple webhooks', () => {
      let testInstance1
      let testInstance2
      let testPath = 'multiple-webhooks'
      let serviceName = 'test1'
      let serviceName2 = 'test2'
      before(function () {
        this.timeout(50000)
        const myParams = {
          method: 'POST',
          uri: opts.API_URL + '/docker-compose-cluster/',
          json: {
            repo: `${opts.GITHUB_USERNAME}/${opts.SNOOP_TESTS_REPO}`,
            branch: 'master',
            filePath: `${testPath}-compose.yml`,
            name: `${testPath}-test-${common.randInt}`,
            githubId: opts.GITHUB_OAUTH_ID
          }
        }
        return AuthenticatedRequest.apiRequest(myParams)
          .then(() => {
            const waitForInstance = (instanceName) => {
              return Promise.delay(500)
                .then(() => {
                  return client.fetchInstancesAsync({ githubUsername: opts.GITHUB_USERNAME })
                })
                .then((instances) => {
                  const foundInstance = instances.models.find((instance) => {
                    return instance.attrs.name === instanceName
                  })
                  if (!foundInstance) {
                    return waitForInstance(instanceName)
                  }
                  console.log('Instance created', instanceName)
                  return promisifyClientModel(foundInstance)
                })
            }
            return Promise.all([
              waitForInstance(`${testPath}-test-${common.randInt}-${serviceName}`)
                .then((instance) => {
                  testInstance1 = instance
                }),
              waitForInstance(`${testPath}-test-${common.randInt}-${serviceName2}`)
                .then((instance) => {
                  testInstance2 = instance
                })
            ])
          })
      })

      after(() => {
        return Promise.all([
          testInstance1.destroyAsync(),
          testInstance2.destroyAsync()
        ])
      })

      it('should build and start properly for all instances', () => {
        return Promise.all([
          InstanceUtils.assertInstanceIsRunning(testInstance1),
          InstanceUtils.assertInstanceIsRunning(testInstance2)
        ])
      })
    })
  })
}
