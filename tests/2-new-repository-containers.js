'use strict'
const common = require('../lib/utils/common')
const fs = require('fs')
const InstanceUtils = require('../lib/instance/util.js')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
const socketUtils = require('../lib/socket/utils.js')
const uuid = require('uuid')

const assertInstanceHasContainer = InstanceUtils.assertInstanceHasContainer
const assertInstanceIsRunning = InstanceUtils.assertInstanceIsRunning
const DOCKERFILE_BODY = fs.readFileSync('./lib/build/source-dockerfile-body.txt').toString()
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

  describe('2. New Repository Containers', () => {
    let build
    let repoInstance
    let githubOrg
    let githubRepo
    let githubBranch
    let sourceContext
    let sourceContextVersion
    let sourceInfraCodeVersion
    let context
    let contextVersion
    let contextVersionDockerfile

    describe('Create A Container', () => {
      describe('Github', () => {
        it('should create a github org', () => {
          githubOrg = Promise.promisifyAll(client.newGithubOrg(opts.GITHUB_USERNAME))
        })

        it('should fetch a github branch', () => {
          return githubOrg.fetchRepoAsync(opts.GITHUB_REPO_NAME, reqOpts)
            .then((_githubRepo) => {
              githubRepo = Promise.promisifyAll(client.newGithubRepo(_githubRepo))
            })
        })

        it('should fetch a github repo branch', () => {
          return githubRepo.fetchBranchAsync('master', reqOpts)
            .then((_branch) => {
              githubBranch = _branch
            })
        })
      })

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

        it('should fetch the stack analysis', () => {
          let fullRepoName = opts.GITHUB_USERNAME + '/' + opts.GITHUB_REPO_NAME
          client.client = Promise.promisifyAll(client.client)
          return client.client.getAsync('/actions/analyze?repo=' + fullRepoName)
            .then((stackAnalysis) => {
              githubRepo.stackAnalysis = stackAnalysis
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
                  body: DOCKERFILE_BODY.replace(new RegExp('GITHUB_REPO_NAME', 'g'), opts.GITHUB_REPO_NAME)
                }
              })
            })
        })

        it('should create an AppCodeVersion', () => {
          return contextVersion.createAppCodeVersionAsync({
            repo: githubRepo.attrs.full_name,
            branch: githubBranch.name,
            commit: githubBranch.commit.sha
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
              build = common.build = rtn
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
          let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + common.serviceInstance.getContainerHostname()
          return client.createInstanceAsync({
            masterPod: true,
            name: opts.GITHUB_REPO_NAME + '-' + common.randInt,
            env: [
              serviceLink
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
              repoInstance = common.repoInstance = rtn
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

      it('should get CMD logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(repoInstance, /server.*running/i)
      })

      it('should be running', () => {
        return assertInstanceIsRunning(repoInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(repoInstance)
      })
    })
  })
}
