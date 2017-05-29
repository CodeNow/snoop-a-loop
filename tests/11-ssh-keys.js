'use strict'
const AuthenticatedRequest = require('../lib/request/authenticated-request.js')
const common = require('../lib/utils/common')
const expect = require('chai').expect
const InstanceUtils = require('../lib/instance/util')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
const sshKeys = require('../lib/ssh-keys/ssh-keys')
require('chai').use(require('dirty-chai'))

module.exports = (config) => {
  const opts = config.opts
  const client = config.client

  describe('11. SSH Keys', function () {
    if (opts.NO_SSH_KEYS) this.pending = true

    before(() => {
      return sshKeys.cleanupGithubKeys()
    })

    after(() => {
      return sshKeys.cleanupGithubKeys()
    })

    describe('create ssh key using api', () => {
      it('should return successful', () => {
        return sshKeys.createRunnableKey()
      })
      it('should return keys when fetched from the API', () => {
        return sshKeys.getRunnableSSHKeys()
          .then((keys) => {
            const key = keys.find((key) => {
              return key.keyName.endsWith(opts.GITHUB_USERNAME)
            })
            expect(key, 'ssh key').to.exist()
          })
      })
    })

    describe('create new instance requiring ssh keys', () => {
      let sshKeysInstance
      before(function () {
        this.timeout(50000)
        const myParams = {
          method: 'POST',
          uri: opts.API_URL + '/docker-compose-cluster/',
          json: {
            repo: `${opts.GITHUB_USERNAME}/${opts.SNOOP_TESTS_REPO}`,
            branch: 'master',
            filePath: '/ssh-keys/docker-compose.yml',
            name: `ssh-key-test-${common.randInt}`,
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
                    return instance.attrs.name === `ssh-key-test-${common.randInt}-web`
                  })
                  if (!foundInstance) {
                    return waitForInstance()
                  }
                  console.log('Instance created', `ssh-key-test-${common.randInt}-web`)
                  sshKeysInstance = promisifyClientModel(foundInstance)
                })
            }
            return waitForInstance()
          })
      })

      after(() => {
        return sshKeysInstance.destroyAsync()
      })

      it('should build and start properly', () => {
        return InstanceUtils.assertInstanceIsRunning(sshKeysInstance)
      })
    })
  })
}
