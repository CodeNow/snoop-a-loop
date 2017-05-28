'use strict'
const common = require('../lib/utils/common')
const expect = require('chai').expect
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
  const reqOpts = {
    headers: {
      'User-Agent': 'runnable-integration-test'
    }
  }

  describe('3. New Repository Containers created using a mirrored docker file', function () {
    let githubOrg
    let githubRepo
    let githubBranch
    let sourceContext
    let sourceContextVersion
    let sourceInfraCodeVersion
    let context
    let contextVersion
    let mirroredDockerfileRepoInstance
    let mirroredDockerfileBuild

    describe('Create A Container', () => {
      describe('Github', () => {
        it('should create a github org', () => {
          githubOrg = Promise.promisifyAll(client.newGithubOrg(opts.GITHUB_USERNAME))
        })

        it('should fetch a github branch', (done) => {
          return githubOrg.fetchRepoAsync(opts.GITHUB_REPO_NAME, reqOpts)
            .then((_githubRepo) => {
              githubRepo = Promise.promisifyAll(client.newGithubRepo(_githubRepo))
            })
            .asCallback(done)
        })

        it('should fetch a github repo branch', (done) => {
          return githubRepo.fetchBranchAsync('master', reqOpts)
            .then((_branch) => {
              githubBranch = _branch
            })
            .asCallback(done)
        })
      })

      describe('Source Context', (done) => {
        it('should fetch the source context', (done) => {
          return client.fetchContextsAsync({ isSource: true })
            .then((sourceContexts) => {
              sourceContext = sourceContexts.models.find((x) => x.attrs.lowerName.match(/nodejs/i))
              promisifyClientModel(sourceContext)
            })
            .asCallback(done)
        })

        it('should fetch the source context versions', (done) => {
          return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' } })
            .then((versions) => {
              sourceContextVersion = versions.models[ 0 ]
              promisifyClientModel(sourceContextVersion)
              sourceInfraCodeVersion = sourceContextVersion.attrs.infraCodeVersion
              promisifyClientModel(sourceInfraCodeVersion)
            })
            .asCallback(done)
        })
      })

      describe('Context & Context Versions', () => {
        it('should create a context', (done) => {
          client.createContextAsync({
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
            .asCallback(done)
        })

        it('should create a context version', (done) => {
          return context.createVersionAsync({
            source: sourceContextVersion.attrs.id
          })
            .then((returned) => {
              contextVersion = returned
              promisifyClientModel(contextVersion)
              return contextVersion.fetchAsync()
            })
            .asCallback(done)
        })

        it('should update the context version when the dockerfile is mirrored', (done) => {
          let contextVersionId = contextVersion.attrs._id
          let contextId = contextVersion.attrs.context

          return contextVersion.updateAsync({
            advanced: true,
            buildDockerfilePath: '/Dockerfile'
          })
            .then((returned) => {
              let newContext = returned.response.body
              expect(newContext.buildDockerfilePath).to.equal('/Dockerfile')
              return contextVersion.deepCopyAsync()
            })
            .then((returned) => {
              let newContext = returned.attrs
              expect(newContext._id).to.not.equal(contextVersionId)
              expect(newContext.context).to.equal(contextId)
            })
            .asCallback(done)
        })

        it('should copy the files', (done) => {
          return contextVersion.copyFilesFromSourceAsync(sourceInfraCodeVersion)
            .asCallback(done)
        })

        it('should create an AppCodeVersion', (done) => {
          return contextVersion.createAppCodeVersionAsync({
            repo: githubRepo.attrs.full_name,
            branch: githubBranch.name,
            commit: githubBranch.commit.sha
          })
            .asCallback(done)
        })
      })

      describe('Builds & Instances', () => {
        it('should create a build for a context version', (done) => {
          return client.createBuildAsync({
            contextVersions: [ contextVersion.id() ],
            owner: {
              github: opts.GITHUB_OAUTH_ID
            }
          })
            .then((rtn) => {
              mirroredDockerfileBuild = rtn
              promisifyClientModel(mirroredDockerfileBuild)
              mirroredDockerfileBuild.contextVersion = contextVersion
              return mirroredDockerfileBuild.fetchAsync()
            })
            .asCallback(done)
        })

        it('should build the build', (done) => {
          return mirroredDockerfileBuild.buildAsync({
            message: 'Initial Build'
          })
            .asCallback(done)
        })

        it('should create an instance', (done) => {
          let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + common.serviceInstance.getContainerHostname()
          return client.createInstanceAsync({
            masterPod: true,
            name: opts.GITHUB_REPO_NAME + '-mirrored-dockerfile-container-' + common.randInt,
            env: [
              serviceLink
            ],
            ipWhitelist: {
              enabled: false
            },
            owner: {
              github: opts.GITHUB_OAUTH_ID
            },
            build: mirroredDockerfileBuild.id()
          })
            .tap((mirroredDockerfileRepoInstance) => {
              promisifyClientModel(mirroredDockerfileRepoInstance)
              return mirroredDockerfileRepoInstance.updateAsync({
                shouldNotAutofork: false
              })
            })
            .then((rtn) => {
              mirroredDockerfileRepoInstance = rtn
              promisifyClientModel(mirroredDockerfileRepoInstance)
              return mirroredDockerfileRepoInstance.fetchAsync()
            })
            .asCallback(done)
        })
      })
    })

    describe('Working Container', () => {
      it('should have a dockerContainer', () => {
        return assertInstanceHasContainer(mirroredDockerfileRepoInstance)
      })

      it('should get build logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testBuildLogs(mirroredDockerfileRepoInstance)
      })

      it('should get CMD logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(mirroredDockerfileRepoInstance, common.REPO_CMD_REGEX)
      })

      it('should be successfully built', () => {
        return assertInstanceIsRunning(mirroredDockerfileRepoInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(mirroredDockerfileRepoInstance)
      })

      it('should reflect the mirrored dockerfile configuration', () => {
        let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER)
        let container = mirroredDockerfileRepoInstance.attrs.container
        let testMirroredDockerfile = socketUtils.createTestTerminal(socket, container, 'sleep 1 && printenv\n', /IS_MIRRORED_DOCKERFILE/)
        return testMirroredDockerfile()
      })
    })
  })
}
