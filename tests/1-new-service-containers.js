'use strict'

const common = require('../lib/utils/common')
const InstanceUtils = require('../lib/instance/util.js')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
const socketUtils = require('../lib/socket/utils.js')

const assertInstanceHasContainer = InstanceUtils.assertInstanceHasContainer
const assertInstanceIsRunning = InstanceUtils.assertInstanceIsRunning
const testBuildLogs = socketUtils.testBuildLogs
const testCMDLogs = socketUtils.testCMDLogs
const testTerminal = socketUtils.testTerminal

module.exports = (config) => {
  const client = config.client
  const opts = config.opts

  describe('1. New Service Containers', () => {
    let sourceInstance
    let contextVersion
    let build
    let serviceInstance

    describe('Creating Container', () => {
      it('should fetch all template containers', () => {
        return client.fetchInstancesAsync({ githubUsername: 'HelloRunnable' })
          .then((instances) => {
            sourceInstance = instances.models.filter((x) => x.attrs.name === opts.SERVICE_NAME)[ 0 ]
            promisifyClientModel(sourceInstance)
          })
      })

      it('should copy the source instance', () => {
        sourceInstance.contextVersion = Promise.promisifyAll(sourceInstance.contextVersion)
        return Promise.fromCallback((cb) => {
          contextVersion = sourceInstance.contextVersion.deepCopy({
            owner: {
              github: opts.GITHUB_OAUTH_ID
            }
          }, cb)
        })
          .then(() => {
            Promise.promisifyAll(contextVersion)
            return contextVersion
              .updateAsync({
                advanced: true
              })
          })
      })

      it('should create the build', () => {
        return client.createBuildAsync({
          contextVersions: [ contextVersion.id() ],
          owner: {
            github: opts.GITHUB_OAUTH_ID
          }
        })
          .then((buildResponse) => {
            build = buildResponse
            promisifyClientModel(build)
          })
      })

      it('should build the build', () => {
        return build.buildAsync({
          message: 'Initial Build'
        })
      })

      it('should create an instance', () => {
        return client.createInstanceAsync({
          masterPod: true,
          name: opts.SERVICE_NAME,
          env: [
            'TIME=' + (new Date()).getTime()
          ],
          ipWhitelist: {
            enabled: false
          },
          owner: {
            github: opts.GITHUB_OAUTH_ID
          },
          build: build.id()
        })
          .tap((instance) => {
            promisifyClientModel(instance)
            return instance.updateAsync({
              shouldNotAutofork: false
            })
          })
          .then((instance) => {
            serviceInstance = common.serviceInstance = instance
            promisifyClientModel(serviceInstance)
            return serviceInstance
          })
      })
    })

    describe('Working Container', () => {
      it('should have a dockerContainer', () => {
        return assertInstanceHasContainer(serviceInstance)
      })

      it('should get build logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testBuildLogs(serviceInstance)
      })

      it('should get CMD logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(serviceInstance, common.SERVICE_CMD_REGEX)
      })

      it('should be succsefully built', () => {
        return assertInstanceIsRunning(serviceInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(serviceInstance)
      })
    })
  })
}
