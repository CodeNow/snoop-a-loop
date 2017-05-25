'use strict'
const common = require('../lib/utils/common')
const InstanceUtils = require('../lib/instance/util.js')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
const socketUtils = require('../lib/socket/utils.js')
const uuid = require('uuid')

const assertInstanceHasContainer = InstanceUtils.assertInstanceHasContainer
const assertInstanceIsRunning = InstanceUtils.assertInstanceIsRunning
const testBuildLogs = socketUtils.testBuildLogs
const testCMDLogs = socketUtils.testCMDLogs
const testTerminal = socketUtils.testTerminal

module.exports = (config) => {
  const client = config.client
  const opts = config.opts

  describe('9. New Service Containers with custom dockerfile', () => {
    let build
    let context
    let contextVersion
    let contextVersionDockerfile
    let repoInstance
    let sourceContext
    let sourceContextVersion
    let sourceInfraCodeVersion

    describe('Create A Container', () => {
      describe('Source Context', () => {
        it('should fetch the source context', () => {
          return client.fetchContextsAsync({ isSource: true })
            .then((sourceContexts) => {
              sourceContext = sourceContexts.models.find((x) => x.attrs.lowerName.match(/nodejs/i))
              promisifyClientModel(sourceContext)
            })
        })

        it('should fetch the source context versions', () => {
          return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' } })
            .then((versions) => {
              sourceContextVersion = versions.models[ 0 ]
              promisifyClientModel(sourceContextVersion)
              sourceInfraCodeVersion = sourceContextVersion.attrs.infraCodeVersion
              promisifyClientModel(sourceInfraCodeVersion)
            })
        })
      })

      describe('Context & Context Versions', () => {
        it('should create a context', () => {
          return client.createContextAsync({
            name: uuid.v4(),
            'owner.github': opts.GITHUB_OAUTH_ID,
            owner: {
              github: opts.GITHUB_OAUTH_ID
            }
          })
            .then((results) => {
              context = results
              promisifyClientModel(context)
            })
        })

        it('should create a context version', () => {
          return context.createVersionAsync({
            source: sourceContextVersion.attrs.id
          })
            .then((returned) => {
              contextVersion = returned
              promisifyClientModel(contextVersion)
              return contextVersion.fetchAsync()
            })
        })

        it('should copy the files', () => {
          return contextVersion.copyFilesFromSourceAsync(sourceInfraCodeVersion)
            .then(() => {
              return sourceContextVersion.fetchFileAsync('/Dockerfile')
            })
            .then((dockerfile) => {
              contextVersionDockerfile = Promise.promisifyAll(contextVersion.newFile(dockerfile))
              return contextVersionDockerfile.updateAsync({
                json: {
                  body: 'FROM rethinkdb'
                }
              })
            })
        })
      })

      describe('Builds & Instances', () => {
        it('should create a build for a context version', () => {
          return client.createBuildAsync({
            contextVersions: [ contextVersion.id() ],
            owner: {
              github: opts.GITHUB_OAUTH_ID
            }
          })
            .then((rtn) => {
              build = rtn
              promisifyClientModel(build)
              build.contextVersion = contextVersion
              return build.fetchAsync()
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
            name: opts.GITHUB_REPO_NAME + '-docker-' + common.randInt,
            env: [
              'WOW=YEYE'
            ],
            ipWhitelist: {
              enabled: false
            },
            owner: {
              github: opts.GITHUB_OAUTH_ID
            },
            build: build.id()
          })
            .then((rtn) => {
              repoInstance = rtn
              promisifyClientModel(repoInstance)
              return repoInstance.fetchAsync()
            })
        })
      })
    })

    describe('Working Container', () => {
      it('should have a dockerContainer', () => {
        return assertInstanceHasContainer(repoInstance)
      })

      it('should get build logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testBuildLogs(repoInstance)
      })

      it('should get build logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(repoInstance, /server.*ready/i)
      })

      it('should be successfully built', () => {
        return assertInstanceIsRunning(repoInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(repoInstance)
      })
    })
  })
}
