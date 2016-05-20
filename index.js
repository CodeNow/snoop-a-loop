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
const promisifyClientModel = require('./lib/utils/promisify-client-model')

const it = require('./lib/utils/mocha').it;
const describe = require('./lib/utils/mocha').describe;

// Parse ENVs and passed args
const opts = require('./lib/utils/env-arg-parser')

const DOCKERFILE_BODY = fs.readFileSync('./lib/build/source-dockerfile-body.txt').toString()

let client
let serviceInstance
let repoInstance
let repoBranchInstance
let build
let ref

const reqOpts = {
  headers: {
    'User-Agent': 'runnable-integration-test'
  }
}

before((done) => {
  client = new Runnable(opts.API_URL, { userContentDomain: opts.USER_CONTENT_DOMAIN })
  promisifyClientModel(client)
  return client.githubLoginAsync(opts.ACCESS_TOKEN)
    .asCallback(done)
})

after((done) => {
  client.logout(done)
})

// after((done) => {
  // return request.delAsync(Object.assign(reqOpts, {
    // url: ref.url + '?access_token=' + ACCESS_TOKEN,
  // }))
    // .asCallback(done)
// })

describe('Cleanup', () => {
  let repoInstances
  let serviceInstances

  it('should fetch the instances', (done) => {
    return client.fetchInstancesAsync({ githubUsername: opts.GITHUB_USERNAME })
      .then((instances) => {
        serviceInstances = instances.models
          .filter((x) => x.attrs.name.includes(opts.SERVICE_NAME))
          .map((x) => promisifyClientModel(x))
        repoInstances = instances.models
          .filter((x) => x.attrs.name.includes(opts.GITHUB_REPO_NAME))
          .map((x) => promisifyClientModel(x))
      })
      .asCallback(done)
  })

  it('should delete/destroy the non-repo container', (done) => {
    if (!serviceInstances.length === 0) return done()
    return Promise.all(serviceInstances.map((x) => x.destroyAsync()))
      .asCallback(done)
  })

  it('should delete/destroy the repo container', (done) => {
    if (!repoInstances.length === 0) return done()
    return Promise.all(repoInstances.map((x) => x.destroyAsync()))
      .asCallback(done)
  })
}, !opts.NO_CLEANUP)

describe('1. New Service Containers', () => {
  let sourceInstance
  let contextVersion
  let build

  describe('Creating Container', () => {
    it('should fetch all template containers', (done) => {
      return client.fetchInstancesAsync({ githubUsername: 'HelloRunnable' })
        .then((instances) => {
          sourceInstance = instances.models.filter((x) => x.attrs.name === opts.SERVICE_NAME)[0]
          promisifyClientModel(sourceInstance)
        })
        .asCallback(done)
    })

    it('should copy the source instance', (done) => {
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
        .asCallback(done)
    })

    it('should create the build', (done) => {
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
        .asCallback(done)
    })

    it('should build the build', (done) => {
      return build.buildAsync({
        message: 'Initial Build'
      })
        .asCallback(done)
    })

    it('should create an instance', (done) => {
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
        .then((rtnInstance) => {
          serviceInstance = rtnInstance
          promisifyClientModel(serviceInstance)
        })
        .asCallback(done)
    })
  })

  describe('Working Container', () => {
    let socket
    let container
    before(() => {
      socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
    })

    it('should have a dockerContainer', (done) => {
      let statusCheck = () => {
        if (serviceInstance.attrs.container && serviceInstance.attrs.container.dockerContainer) {
          container = serviceInstance.attrs.container
          return done()
        }
        serviceInstance.fetchAsync()
        return delay(500)
          .then(() => statusCheck())
      }
      return statusCheck()
    })

    it('should get logs for that container', (done) => {
      // TODO: Improve test to test only build logs
     let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, serviceInstance.attrs.contextVersion.id)
      let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /running.*rethinkdb/i)
      return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
        .asCallback(done)
    }, !opts.NO_LOGS)

    it('should be succsefully built', (done) => {
      let statusCheck = () => {
        if (serviceInstance.status() === 'running') return done()
        serviceInstance.fetchAsync()
        return delay(500)
          .then(() => statusCheck())
      }
      return statusCheck()
    })

    it('should have a working terminal', (done) => {
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n', /from.*127.0.0.1/i)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
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

      it('should fetch the stack analysis', (done) => {
        let fullRepoName = opts.GITHUB_USERNAME + '/' + opts.GITHUB_REPO_NAME
        client.client = Promise.promisifyAll(client.client)
        return client.client.getAsync('/actions/analyze?repo=' + fullRepoName)
          .then((stackAnalysis) => {
            githubRepo.stackAnalysis = stackAnalysis
          })
          .asCallback(done)
      })

      it('should copy the files', (done) => {
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
          build = rtn
          promisifyClientModel(build)
          build.contextVersion = contextVersion
          return build.fetchAsync()
        })
        .asCallback(done)
      })

      it('should build the build', (done) => {
        return build.buildAsync({
          message: 'Initial Build'
        })
          .asCallback(done)
      })

      it('should create an instance', (done) => {
        let serviceLink = opts.SERVICE_NAME.toUpperCase() + '=' + serviceInstance.getContainerHostname()
        return client.createInstanceAsync({
          masterPod: true,
          name: opts.GITHUB_REPO_NAME + '-' + Math.floor(Math.random() * 1000),
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
          .asCallback(done)
      })
    })
  })

  describe('Working Container', () => {
    let socket
    let container
    before(() => {
      socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
    })

    it('should have a dockerContainer', (done) => {
      let statusCheck = () => {
        if (serviceInstance.attrs.container.dockerContainer) {
          container = serviceInstance.attrs.container
          return done()
        }
        serviceInstance.fetchAsync()
        return delay(500)
          .then(() => statusCheck())
      }
      return statusCheck()
    })

    it('should get logs for that container', (done) => {
      // TODO: Improve test to test only build logs
      let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, repoInstance.attrs.contextVersion.id)
      let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /server.*running/i)
      return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
        .asCallback(done)
    }, !opts.NO_LOGS)

    it('should be successfully built', (done) => {
      let statusCheck = () => {
        if (repoInstance.status() === 'running') return done()
        repoInstance.fetchAsync()
        return delay(500)
          .then(() => statusCheck())
      }
      return statusCheck()
    })

    it('should have a working terminal', (done) => {
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n', /from.*127.0.0.1/i)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })
  })
 })

describe('3. Rebuild Repo Container', () => {
  let newBuild
  describe('Rebuilding without Cache', () => {
    it('should deep copy the build', (done) => {
      return build.deepCopyAsync()
        .then((newBuildData) => {
          newBuild = Promise.promisifyAll(client.newBuild(newBuildData))
          return newBuild.fetchAsync()
        })
        .asCallback(done)
    })

    it('should rebuild the instance without cache', (done) => {
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
        .asCallback(done)
    })
  })

  describe('Working Container', () => {
    it('should have a container', (done) => {
      // NOTE: Is there a better way of doing this?
      let containerCheck = () => {
        if (repoInstance.attrs.container) return done()
        repoInstance.fetchAsync()
        return delay(500)
          .then(() => containerCheck())
      }
      return containerCheck()
    }).timeout(opts.TIMEOUT)

    it('should get logs for that container', (done) => {
      // TODO: Improve test to test only build logs
      let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
      let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, repoInstance.attrs.contextVersion.id)
      let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /server.*running/i)
      return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
        .asCallback(done)
    }, !opts.NO_LOGS)

    it('should be succsefully built', (done) => {
      let statusCheck = () => {
        if (repoInstance.status() === 'running') return done()
        repoInstance.fetchAsync()
        return delay(500)
          .then(() => statusCheck())
      }
      return statusCheck()
    })

    it('should have a working terminal', (done) => {
      let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n')
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })
  })
}, !opts.NO_REBUILD)

describe('4. Github Webhooks', () => {
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

    it('should created a new branch', (done) => {
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
        .asCallback(done)
    })

    it('should create a new instance with the branch name', (done) => {
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
        .asCallback(done)
    })
  })

  describe('Working Container', () => {
    it('should have a container', (done) => {
      // NOTE: Is there a better way of doing this?
      let containerCheck = () => {
        if (repoBranchInstance.attrs.container) return done()
        repoBranchInstance.fetchAsync()
        return delay(500)
          .then(() => containerCheck())
      }
      return containerCheck()
    })

    it('should get logs for that container', (done) => {
      // TODO: Improve test to test only build logs
      let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
      let container = repoBranchInstance.attrs.container
      let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, repoBranchInstance.attrs.contextVersion.id)
      let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /server.*running/i)
      return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
        .asCallback(done)
    })

    it('should be succsefully built', (done) => {
      let statusCheck = () => {
        if (repoBranchInstance.status() === 'running') return done()
        repoBranchInstance.fetchAsync()
        return delay(500)
          .then(() => statusCheck())
      }
      return statusCheck()
    })

    it('should have a working terminal', (done) => {
      let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
      let container = repoBranchInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n', /from.*127.0.0.1/i)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })
  })
}, !opts.NO_WEBHOOKS)

describe('5. Container To Container DNS', () => {
  describe('Repo Instance', () => {
    it('should connect to the service container from the master branch', (done) => {
      let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })

    it('should connect to the service container from the created branch', (done) => {
      let socket = socketUtils.createSocketConnection(opts.API_SOCKET_SERVER, client.connectSid)
      let container = repoBranchInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })
  })

  describe('Service Instance', () => {
    it('should connect to the master branch repo instance', (done) => {
    })

    it('should connect to the creaated branch repo instance', (done) => {
    })
  }, false)
}, !opts.NO_DNS)

describe('6. Navi URLs', () => {

  describe('Repo Instance', () => {
    it('should access the main container', (done) => {
      let hostname = repoInstance.getContainerHostname()
      return request.getAsync('http://' + hostname)
        .then(function (res) {
          expect(res.body).to.match(opts.REPO_CONTAINER_MATCH)
        })
        .asCallback(done)
    })

    it('should access the branch container', (done) => {
      let hostname = repoBranchInstance.getContainerHostname()
      return request.getAsync('http://' + hostname)
        .then(function (res) {
          expect(res.body).to.match(opts.REPO_CONTAINER_MATCH)
        })
        .asCallback(done)
    })
  })

  describe('Service Instance', () => {
    it('should connect to the service instance', (done) => {
      let hostname = serviceInstance.getContainerHostname()
      return request.getAsync('http://' + hostname + ':8080')
        .then(function (res) {
          expect(res.body).to.match(opts.SERVICE_CONTAINER_MATCH)
        })
        .asCallback(done)
    })
  })
}, !opts.NO_NAVI)
