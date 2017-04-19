'use strict';
require('loadenv')()

const delay = require('delay')
const expect = require('chai').expect
const fs = require('fs')
const GitHubApi = require('github')
const keypather = require('keypather')()
const objectId = require('objectid')
const Promise = require('bluebird')
const request = Promise.promisifyAll(require('request'))
const uuid = require('uuid')
require('string.prototype.includes');

const PrimusClient = require('@runnable/api-client/lib/external/primus-client')
const Runnable = require('@runnable/api-client')

const socketUtils = require('./lib/socket/utils.js')
const testBuildLogs = socketUtils.testBuildLogs
const testCMDLogs = socketUtils.testCMDLogs
const testTerminal = socketUtils.testTerminal
const InstanceUtils = require('./lib/instance/util.js')
const assertInstanceHasContainer = InstanceUtils.assertInstanceHasContainer
const assertInstanceIsRunning = InstanceUtils.assertInstanceIsRunning
const promisifyClientModel = require('./lib/utils/promisify-client-model')

// Parse ENVs and passed args
const opts = require('./lib/utils/env-arg-parser')

const DOCKERFILE_BODY = fs.readFileSync('./lib/build/source-dockerfile-body.txt').toString()
const randInt = Math.floor(Math.random() * 1000)

let client

let serviceInstance
let repoInstance
let repoBranchInstance
let repoInstanceForIsolation

let isolation
let isolatedServiceInstance
let isolatedRepoInstance

let build
let ref

const reqOpts = {
  headers: {
    'User-Agent': 'runnable-integration-test'
  }
}

before(() => {
  client = new Runnable(opts.API_URL, { userContentDomain: opts.USER_CONTENT_DOMAIN })
  promisifyClientModel(client)
  return client.githubLoginAsync(opts.ACCESS_TOKEN)
    .then(() => opts.connectSid = client.connectSid)
})

after((done) => {
  client.logout(done)
})

describe('Cleanup', function () {
  if (opts.NO_CLEANUP) this.pending = true

  let repoInstances
  let serviceInstances

  it('should fetch the instances', () => {
    return client.fetchInstancesAsync({ githubUsername: opts.GITHUB_USERNAME })
      .then((instances) => {
        serviceInstances = instances.models
          .filter((x) => x.attrs.name.includes(opts.SERVICE_NAME))
          .map((x) => promisifyClientModel(x))
        repoInstances = instances.models
          .filter((x) => x.attrs.name.includes(opts.GITHUB_REPO_NAME))
          .map((x) => promisifyClientModel(x))
      })
  })

  it('should delete/destroy the non-repo container', () => {
    if (!serviceInstances.length === 0) return Promise.resolve()
    return Promise.all(serviceInstances.map((x) => x.destroyAsync()))
  })

  it('should delete/destroy the repo container', () => {
    if (!repoInstances.length === 0) return Promise.resolve()
    return Promise.all(repoInstances.map((x) => x.destroyAsync()))
  })
})

describe('1. New Service Containers', () => {
  let sourceInstance
  let contextVersion
  let build

  describe('Creating Container', () => {
    it('should fetch all template containers', () => {
      return client.fetchInstancesAsync({ githubUsername: 'HelloRunnable' })
        .then((instances) => {
          sourceInstance = instances.models.filter((x) => x.attrs.name === opts.SERVICE_NAME)[0]
          promisifyClientModel(sourceInstance)
        })
    })

    it('should copy the source instance', () => {
      sourceInstance.contextVersion = Promise.promisifyAll(sourceInstance.contextVersion)
      return Promise.fromCallback((cb) =>{
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
        contextVersions: [contextVersion.id()],
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
          serviceInstance = instance
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
      return testCMDLogs(serviceInstance, /running.*rethinkdb/i)
    })

    it('should be succsefully built', () => {
      return assertInstanceIsRunning(serviceInstance)
    })

    it('should have a working terminal', () => {
      return testTerminal(serviceInstance)
    })
  })
})

describe('2. New Repository Containers', () => {
  let githubOrg
  let githubRepo
  let githubBranch
  let sourceContext
  let sourceContextVersion
  let sourceInfraCodeVersion
  let context
  let contextVersion
  let contextVersionDockerfile
  let appCodeVersion

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
        return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' }})
          .then((versions) => {
            sourceContextVersion = versions.models[0]
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
        .then((acv) => {
          appCodeVersion = acv
        })
      })
    })

    describe('Builds & Instances', () => {
      it('should create a build for a context version', () => {
        return client.createBuildAsync({
          contextVersions: [contextVersion.id()],
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
        let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + serviceInstance.getContainerHostname()
        return client.createInstanceAsync({
          masterPod: true,
          name: opts.GITHUB_REPO_NAME + '-' + randInt,
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

describe('3. New Repository Containers created using a mirrored docker file', function () {
  let githubOrg
  let githubRepo
  let githubBranch
  let sourceContext
  let sourceContextVersion
  let sourceInfraCodeVersion
  let context
  let contextVersion
  let contextVersionDockerfile
  let appCodeVersion
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
        return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' }})
          .then((versions) => {
            sourceContextVersion = versions.models[0]
            promisifyClientModel(sourceContextVersion)
            sourceInfraCodeVersion = sourceContextVersion.attrs.infraCodeVersion;
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

      it ('should update the context version when the dockerfile is mirrored', (done) => {
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
        .then((acv) => {
          appCodeVersion = acv
        })
        .asCallback(done)
      })
    })

    describe('Builds & Instances', () => {
      it('should create a build for a context version', (done) => {
        return client.createBuildAsync({
          contextVersions: [contextVersion.id()],
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
        let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + serviceInstance.getContainerHostname()
        return client.createInstanceAsync({
          masterPod: true,
          name: opts.GITHUB_REPO_NAME + '-mirrored-dockerfile-container-' + randInt,
          env: [
            serviceLink
          ],
          ipWhitelist: {
            enabled: false
          },
          owner: {
            github: opts.GITHUB_OAUTH_ID
          },
          build: mirroredDockerfileBuild.id(),
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

    it('should get build logs for that container', () => {
      if (opts.NO_LOGS) return this.skip()
      return testBuildLogs(mirroredDockerfileRepoInstance)
    })

    it('should get CMD logs for that container', () => {
      if (opts.NO_LOGS) return this.skip()
      return testCMDLogs(mirroredDockerfileRepoInstance, /server.*running/i)
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


describe('4. Rebuild Repo Container', function () {
  if (opts.NO_REBUILD) this.pending = true

  let newBuild
  describe('Rebuilding without Cache', () => {
    it('should deep copy the build', () => {
      return build.deepCopyAsync()
        .then((newBuildData) => {
          newBuild = Promise.promisifyAll(client.newBuild(newBuildData))
          return newBuild.fetchAsync()
        })
    })

    it('should rebuild the instance without cache', () => {
      return newBuild.buildAsync({
        message: 'Manual build',
        noCache: true
      })
        .then((newBuildData) => {
          newBuild = Promise.promisifyAll(client.newBuild(newBuildData))
          return repoInstance.updateAsync({
            build: newBuild.id()
          })
        })
        .then(() => {
          return repoInstance.fetchAsync()
        })
    })
  })

  describe('Working Container', () => {
    it('should have a container', () => {
      return assertInstanceHasContainer(repoInstance)
    }).timeout(opts.TIMEOUT)

    it('should get logs for that container', function () {
      if (opts.NO_LOGS) return this.skip()
      return testBuildLogs(repoInstance)
    })

    it('should be succsefully built', () => {
      return assertInstanceIsRunning(repoInstance)
    })

    it('should have a working terminal', () => {
      return testCMDLogs(repoInstance, /server.*running/i)
    })
  })
})

describe('5. Github Webhooks', function () {
  if (opts.NO_WEBHOOKS) this.pending = true
  let branchName = 'test-branch-' + (new Date().getTime())
  let refName = 'refs/heads/' + branchName
  let userName
  let repoName
  let github

  describe('Creating Branch Container', () => {
    before(() => {
      github = new GitHubApi({
        // required
        version: '3.0.0',
        // optional
        protocol: 'https',
        timeout: 2000
      })
      github.authenticate({
        type: 'token',
        token: opts.ACCESS_TOKEN
      })
    })

    it('should created a new branch', () => {
      let acv = repoInstance.attrs.contextVersion.appCodeVersions[0]
      userName = acv.repo.split('/')[0]
      repoName = acv.repo.split('/')[1]
      return Promise.fromCallback((cb) => {
        github.repos.getCommits({
          repo: repoName,
          user: userName
        }, cb)
      })
        .then((commits) => {
          let lastCommitSha = commits[0].sha
          return Promise.fromCallback((cb) => {
            github.gitdata.createReference({
              repo: repoName,
              user: userName,
              ref: refName,
              sha: lastCommitSha
            }, cb)
          })
        })
        .then((_ref) => {
          ref = _ref
        })
    })

    it('should create a new instance with the branch name', () => {
      return Promise.resolve()
        .then(() => delay(5000))
        .then(() => {
          return client.fetchInstancesAsync({
            githubUsername: userName
          })
        })
        .then((allInstances) => {
          return allInstances.models.filter((instance) => {
            return instance.attrs.name.toLowerCase().includes(repoName.toLowerCase())
          })
        })
        .then((instances) => {
          repoBranchInstance = instances.filter((x) => x.attrs.name.includes(branchName))[0]
          expect(repoBranchInstance).to.not.be.undefined
          promisifyClientModel(repoBranchInstance)
          return repoInstance.fetchAsync()
        })
    })
  })

  describe('Working Container', () => {
    it('should have a container', (done) => {
      return assertInstanceHasContainer(repoBranchInstance)
    })

    it('should get build logs for that container', function () {
      if (opts.NO_LOGS) return this.skip()
      return testBuildLogs(repoBranchInstance)
    })

    it('should get CMD logs for that container', function () {
      if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(repoBranchInstance, /server.*running/i)
    })

    it('should be succsefully built', () => {
      return assertInstanceIsRunning(repoBranchInstance)
    })

    it('should have a working terminal', () => {
      return testTerminal(repoBranchInstance)
    })
  })
})

describe('6. Isolation', function () {
  if (!opts.ISOLATION) this.pending = true

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
    let appCodeVersion

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
          return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' }})
            .then((versions) => {
              sourceContextVersion = versions.models[0]
              promisifyClientModel(sourceContextVersion)
              sourceInfraCodeVersion = sourceContextVersion.attrs.infraCodeVersion;
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
          .then((acv) => {
            appCodeVersion = acv
          })
        })
      })

      describe('Builds & Instances', () => {
        it('should create a build for a context version', () => {
          return client.createBuildAsync({
            contextVersions: [contextVersion.id()],
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
          let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + serviceInstance.getContainerHostname()
          return client.createInstanceAsync({
            masterPod: true,
            name: opts.GITHUB_REPO_NAME + '-for-isolation-' + randInt,
            env: [
              serviceLink
            ],
            ipWhitelist: {
              enabled: false
            },
            owner: {
              github: opts.GITHUB_OAUTH_ID
            },
            build: build.id(),
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
      it('should have a dockerContainer', (done) => {
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

      it('should be successfully built', (done) => {
        return assertInstanceIsRunning(repoInstanceForIsolation)
      })

      it('should have a working terminal', () => {
        return testTerminal(repoInstanceForIsolation)
      })
    })
  })

  describe('Create Isolation', () => {
    it('should create the isolation', () => {
      let acv = repoInstanceForIsolation.contextVersion.attrs.appCodeVersions[0]
      return client.createIsolationAsync({
        master: repoBranchInstance.id(),
        // TODO: Add new repo
        children: [{
          instance: serviceInstance.id()
        }, {
          instance: repoInstanceForIsolation.id(),
          branch: acv.branch
        }]
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
          isolatedServiceInstance = isolatedServiceContainers[0]
          isolatedRepoInstance = isolatedRepoContainers[0]
          promisifyClientModel(isolatedServiceInstance)
          promisifyClientModel(isolatedRepoInstance)
        })
    })

    describe('Isolated Service Container', () => {
      it('should have a dockerContainer', (done) => {
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

      it('should be successfully built', (done) => {
        return assertInstanceIsRunning(isolatedServiceInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(isolatedServiceInstance)
      })
    })

    describe('Isolated Repo Container', () => {
      it('should have a dockerContainer', (done) => {
        return assertInstanceHasContainer(isolatedRepoInstance)
      })

      it('should get build logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testBuildLogs(isolatedRepoInstance)
      })

      it('should get logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(isolatedRepoInstance, /server.*running/i)
      })

      it('should be successfully built', (done) => {
        return assertInstanceIsRunning(isolatedRepoInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(isolatedRepoInstance, /server.*running/i)
      })
    })
  })

})

describe('7. Container To Container DNS', function () {
  if (opts.NO_DNS) this.pending = true
  //this.retries(5)
  this.timeout(3000)
  let socket

  before(() => {
    socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
  })

  describe('Repo Instance', () => {
    it('should connect to the container from the master branch', function () {
      let container = repoInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
    })

    it('should connect to the container from the newly created branch (if not isolated)', function () {
      if (opts.ISOLATION || opts.NO_WEBHOOKS) {
        return Promise.resolve() // Doesn't work for isolation for some reason
      }
      let container = repoBranchInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
    })

    it('should connect to the isolated container from the isolated branch', function () {
      if (!opts.ISOLATION) return this.skip()
      let container = isolatedRepoInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
    })
  })

  describe.skip('Service Instance', function () {
    it('should connect to the master branch repo instance', (done) => {
    })

    it('should connect to the creaated branch repo instance', (done) => {
    })
  })
})

describe('8. Navi URLs', function () {
  if (opts.NO_NAVI) this.pending = true

  describe('Repo Instance', () => {
    it('should access the main container', () => {
      let hostname = repoInstance.getContainerHostname()
      return request.getAsync('http://' + hostname)
        .then(function (res) {
          expect(res.body).to.match(opts.REPO_CONTAINER_MATCH)
        })
    })

    it('should access the branch container', function () {
      if (opts.ISOLATION || opts.NO_WEBHOOKS) {
        return Promise.resolve() // Doesn't work for isolation for some reason
      }
      let hostname = repoBranchInstance.getContainerHostname()
      return request.getAsync('http://' + hostname)
        .then(function (res) {
          expect(res.body).to.match(opts.REPO_CONTAINER_MATCH)
        })
    })
  })

  describe('Service Instance', () => {
    // This currently doesn't work
    xit('should connect to the service instance', () => {
      let hostname = serviceInstance.getContainerHostname()
      return request.getAsync('http://' + hostname + ':8080')
        .then(function (res) {
          expect(res.body).to.match(opts.SERVICE_CONTAINER_MATCH)
        })
    })
  })
})

describe('9. New Service Containers with custom dockerfile', () => {
  let githubOrg
  let githubRepo
  let githubBranch
  let sourceContext
  let sourceContextVersion
  let sourceInfraCodeVersion
  let context
  let contextVersion
  let contextVersionDockerfile
  let appCodeVersion

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
        return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' }})
          .then((versions) => {
            sourceContextVersion = versions.models[0]
            promisifyClientModel(sourceContextVersion)
            sourceInfraCodeVersion = sourceContextVersion.attrs.infraCodeVersion;
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
          contextVersions: [contextVersion.id()],
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
          name: opts.GITHUB_REPO_NAME + '-docker-' + randInt,
          env: [
            "WOW=YEYE"
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
    it('should have a dockerContainer', (done) => {
      return assertInstanceHasContainer(repoInstance)
    })

    it('should get build logs for that container', function () {
      if (opts.NO_LOGS) return this.skip()
      return testBuildLogs(repoInstance)
    })

    it('should get build logs for that container', function () {
      if (opts.NO_LOGS) return this.skip()
      return testCMDLogs(repoInstance, /server.*running/i)
    })

    it('should be successfully built', (done) => {
      return assertInstanceIsRunning(repoInstance)
    })

    it('should have a working terminal', () => {
      return testTerminal(repoInstance)
    })
  })
})
