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
      let testInstances
      let testPath = 'multiple-webhooks'
      let serviceName = 'test1'
      let serviceName2 = 'test2'
      before(function () {
        this.timeout(50000)
        testInstances = []
        const myParams = {
          method: 'POST',
          uri: opts.API_URL + '/docker-compose-cluster/multi',
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
            const waitForInstances = () => {
              return Promise.delay(500)
                .then(() => {
                  return client.fetchInstancesAsync({ githubUsername: opts.GITHUB_USERNAME })
                })
                .then((instances) => {
                  let foundInstances = []
                  let instanceName = `${testPath}-test-${common.randInt}-${serviceName}`
                  let instanceName2 = `${testPath}-test-${common.randInt}-${serviceName2}`
                  instances.models.forEach((instance) => {
                    if (instance.attrs.name.indexOf(instanceName) > 0 || instance.attrs.name.indexOf(instanceName2) > 0) {
                      foundInstances.push(instance)
                    }
                  })
                  if (foundInstances.length !== 4) {
                    return waitForInstances()
                  }
                  console.log('All test instances created', foundInstances.map((instance) => {
                    return instance.attrs.name
                  }))
                  testInstances = foundInstances.map((instance) => {
                    return promisifyClientModel(instance)
                  })
                })
            }
            return waitForInstances()
          })
      })

      after(() => {
        return Promise.each(testInstances, (instance) => {
          return instance.destroyAsync()
        })
      })

      it('should build and start properly for all instances', () => {
        return Promise.all(testInstances.forEach((instance) => {
          return InstanceUtils.assertInstanceIsRunning(instance)
        }))
      })
    })
  })
}
