'use strict'
const common = require('../lib/utils/common')
const expect = require('chai').expect
const fs = require('fs')
const InstanceUtils = require('../lib/instance/util.js')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
const socketUtils = require('../lib/socket/utils.js')
const uuid = require('uuid')
const regexpQuote = require('regexp-quote')

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

  describe('6. Isolation', function () {
    if (!opts.ISOLATION) this.pending = true
    let repoInstanceForIsolation

    before(() => {
      if (!common.repoInstance) {
        return client.fetchInstancesAsync({
          githubUsername: opts.GITHUB_USERNAME
        })
          .then((allInstances) => {
            const regex = new RegExp(regexpQuote(opts.GITHUB_REPO_NAME) + '-\\d+')
            return allInstances.models.find((instance) => {
              return regex.test(instance.attrs.name)
            })
          })
          .then((instance) => {
            common.repoInstance = instance
            promisifyClientModel(common.repoInstance)
          })
      }
    })
    before(() => {
      if (!common.serviceInstance) {
        return client.fetchInstancesAsync({
          githubUsername: opts.GITHUB_USERNAME
        })
          .then((allInstances) => {
            return allInstances.models.find((instance) => {
              return instance.attrs.name === opts.SERVICE_NAME
            })
          })
          .then((instance) => {
            common.serviceInstance = instance
            promisifyClientModel(common.serviceInstance)
          })
      }
    })
    describe('Create Container To Isolate', () => {
      let githubOrg
      let githubRepo
      let githubBranch
      let sourceContext
      let sourceContextVersion
      let sourceInfraCodeVersion
      let context
      let contextVersion
      let contextVersionDockerfile
      let build

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
            let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + common.serviceInstance.getContainerHostname()
            return client.createInstanceAsync({
              masterPod: true,
              name: opts.GITHUB_REPO_NAME + '-for-isolation-' + common.randInt,
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
              .tap((instance) => {
                promisifyClientModel(instance)
                return instance.updateAsync({
                  shouldNotAutofork: false
                })
              })
              .then((rtn) => {
                repoInstanceForIsolation = rtn
                promisifyClientModel(repoInstanceForIsolation)
                return repoInstanceForIsolation.fetchAsync()
              })
          })
        })
      })

      describe('Working Container', () => {
        it('should have a dockerContainer', () => {
          return assertInstanceHasContainer(repoInstanceForIsolation)
        })

        it('should get build logs for that container', function () {
          if (opts.NO_LOGS) return this.skip()
          return testBuildLogs(repoInstanceForIsolation)
        })

        it('should get CMD logs for that container', function () {
          if (opts.NO_LOGS) return this.skip()
          return testCMDLogs(repoInstanceForIsolation, /server.*running/i)
        })

        it('should be successfully built', () => {
          return assertInstanceIsRunning(repoInstanceForIsolation)
        })

        it('should have a working terminal', () => {
          return testTerminal(repoInstanceForIsolation)
        })
      })
    })

    describe('Create Isolation', () => {
      let isolatedServiceInstance
      let isolatedRepoInstance
      let isolation

      it('should create the isolation', () => {
        let acv = repoInstanceForIsolation.contextVersion.attrs.appCodeVersions[ 0 ]
        return client.createIsolationAsync({
          master: common.repoBranchInstance.id(),
          // TODO: Add new repo
          children: [ {
            instance: common.serviceInstance.id()
          }, {
            instance: repoInstanceForIsolation.id(),
            branch: acv.branch
          } ]
        })
          .then((_isolation) => {
            isolation = client.newIsolation(_isolation)
          })
          .then(() => {
            promisifyClientModel(isolation)
            expect(isolation.attrs._id).to.not.equal(undefined)
          })
      })

      it('should create the instances for that isolation', () => {
        return client.fetchInstancesAsync({
          githubUsername: opts.GITHUB_USERNAME,
          isolated: isolation.attrs._id,
          isIsolationGroupMaster: false
        })
          .then((instances) => {
            let isolatedServiceContainers = instances.models.filter((x) => x.attrs.name.includes(opts.SERVICE_NAME))
            let isolatedRepoContainers = instances.models.filter((x) => x.attrs.name.includes(repoInstanceForIsolation.attrs.name))
            expect(isolatedServiceContainers).to.have.lengthOf(1)
            expect(isolatedRepoContainers).to.have.lengthOf(1)
            isolatedServiceInstance = isolatedServiceContainers[ 0 ]
            isolatedRepoInstance = isolatedRepoContainers[ 0 ]
            promisifyClientModel(isolatedServiceInstance)
            promisifyClientModel(isolatedRepoInstance)
          })
      })

      describe('Isolated Service Container', () => {
        it('should have a dockerContainer', () => {
          return assertInstanceHasContainer(isolatedServiceInstance)
        })

        it('should get build logs for that container', function () {
          if (opts.NO_LOGS) return this.skip()
          return testBuildLogs(isolatedServiceInstance)
        })

        it('should get CMD logs for that container', function () {
          if (opts.NO_LOGS) return this.skip()
          return testCMDLogs(isolatedServiceInstance, /running.*rethinkdb/i)
        })

        it('should be successfully built', () => {
          return assertInstanceIsRunning(isolatedServiceInstance)
        })

        it('should have a working terminal', () => {
          return testTerminal(isolatedServiceInstance)
        })
      })

      describe('Isolated Repo Container', () => {
        it('should have a dockerContainer', () => {
          return assertInstanceHasContainer(isolatedRepoInstance)
        })

        it('should get build logs for that container', function () {
          if (opts.NO_LOGS) return this.skip()
          return testBuildLogs(isolatedRepoInstance)
        })

        it('should get logs for that container', function () {
          if (opts.NO_LOGS) return this.skip()
          return testCMDLogs(isolatedRepoInstance, common.REPO_CMD_REGEX)
        })

        it('should be successfully built', () => {
          return assertInstanceIsRunning(isolatedRepoInstance)
        })

        it('should have a working terminal', () => {
          return testTerminal(isolatedRepoInstance)
        })
      })
    })
  })
}
