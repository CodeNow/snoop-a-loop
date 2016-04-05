'use strict';
require('loadenv')()

const delay = require('delay')
const expect = require('chai').expect
const fs = require('fs')
const GitHubApi = require('github')
const keypather = require('keypather')()
const objectId = require('objectid')
const PrimusClient = require('@runnable/api-client/lib/external/primus-client')
const Promise = require('bluebird')
const request = Promise.promisifyAll(require('request'))
const Runnable = require('@runnable/api-client')
const socketUtils = require('./lib/socket/utils.js')
const uuid = require('uuid')
require('string.prototype.includes');

const ACCESS_TOKEN = process.env.AUTH_TOKEN || '6d0e7de3c05331ba4dc15d3e3067b55c990a4fdf'
const API_URL = process.env.API_URL || 'https://api.runnable-gamma.com'
const API_SOCKET_SERVER = process.env.API_SOCKET_SERVER || API_URL.replace('api', 'apisock')
const DOCKERFILE_BODY = fs.readFileSync('./lib/build/source-dockerfile-body.txt').toString()
const GITHUB_OAUTH_ID = 2828361 // Runnable
const GITHUB_REPO_NAME = 'hello-node-rethinkdb'
const GITHUB_USERNAME = 'Runnable'
const SERIVCE_NAME = 'RethinkDB'

const userContentDomains = {
  'runnable-beta': 'runnablecloud.com',
  'runnable-gamma': 'runnable.ninja',
  'runnable': 'runnableapp.com' // runnable.io
}
const USER_CONTENT_DOMAIN = process.env.USER_CONTENT_DOMAIN || userContentDomains[API_URL.match(/runnable[\-A-z]*/i)]

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
  client = Promise.promisifyAll(new Runnable(API_URL, { userContentDomain: USER_CONTENT_DOMAIN }))
  return client.githubLoginAsync(ACCESS_TOKEN)
    .asCallback(done)
})

after((done) => {
  client.logout(done)
})

after((done) => {
  return request.delAsync(Object.assign(reqOpts, {
    url: ref.url + '?access_token=' + ACCESS_TOKEN,
  }))
    .asCallback(done)
})

describe('Cleanup', () => {
  let repoInstance
  let serviceInstance

  it('should fetch the instances', (done) => {
    return client.fetchInstancesAsync({ githubUsername: GITHUB_USERNAME })
      .then((instancesData) => {
        let serviceInstanceInstanceData = instancesData.filter((x) => x.name === SERIVCE_NAME)[0]
        if (serviceInstanceInstanceData) {
          serviceInstance = Promise.promisifyAll(client.newInstance(serviceInstanceInstanceData))
        }
        let repoInstanceInstanceData = instancesData.filter((x) => x.name === GITHUB_REPO_NAME)[0]
        if (repoInstanceInstanceData) {
          repoInstance = Promise.promisifyAll(client.newInstance(repoInstanceInstanceData))
        }
      })
      .asCallback(done)
  })

  it('should delete/destroy the non-repo container', (done) => {
    if (!serviceInstance) return done()
    return serviceInstance.destroyAsync()
      .asCallback(done)
  })

  it('should delete/destroy the repo container', (done) => {
    if (!repoInstance) return done()
    return repoInstance.destroyAsync()
      .asCallback(done)
  })
})

describe('1. New Service Containers', () => {
  let sourceInstance
  let contextVersion
  let build

  it('should fetch all template containers', (done) => {
    return client.fetchInstancesAsync({ githubUsername: 'HelloRunnable' })
      .then((instancesData) => {
        let instanceData = instancesData.filter((x) => x.name === SERIVCE_NAME)[0]
        sourceInstance = Promise.promisifyAll(client.newInstance(instanceData))
      })
      .asCallback(done)
  })

  it('should copy the source instance', (done) => {
    sourceInstance.contextVersion = Promise.promisifyAll(sourceInstance.contextVersion)
    return sourceInstance.contextVersion.deepCopyAsync({
      owner: {
        github: GITHUB_OAUTH_ID
      }
    })
      .then((versionData) => {
        let context = client.newContext({ _id: '999' })
        contextVersion = Promise.promisifyAll(context.newVersion(versionData));
      })
      .asCallback(done)
  })

  it('should create the build', (done) => {
    return client.createBuildAsync({
      contextVersions: [contextVersion.id()],
      owner: {
        github: GITHUB_OAUTH_ID
      }
    })
      .then((buildData) => {
        build = Promise.promisifyAll(client.newBuild(buildData))
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
      name: SERIVCE_NAME,
      env: [
        'TIME=' + (new Date()).getTime()
      ],
      ipWhitelist: {
        enabled: false
      },
      owner: {
        github: GITHUB_OAUTH_ID
      },
      build: build.id()
    })
      .then((instanceData) => {
        serviceInstance = Promise.promisifyAll(client.newInstance(instanceData))
        return serviceInstance.fetchAsync()
      })
      .asCallback(done)
  })

  it('should get logs for that container', (done) => {
    // TODO: Improve test to test only build logs
    let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
    let container = serviceInstance.attrs.container
    let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, serviceInstance.attrs.contextVersion.id)
    let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /running.*rethinkdb/i)
    return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
      .asCallback(done)
  })

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
    let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
    let container = serviceInstance.attrs.container
    let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n', /from.*127.0.0.1/i)
    return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
      .asCallback(done)
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
        githubOrg = Promise.promisifyAll(client.newGithubOrg(GITHUB_USERNAME))
      })

      it('should fetch a github branch', (done) => {
        return githubOrg.fetchRepoAsync(GITHUB_REPO_NAME, reqOpts)
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
          .then((sourceContextsData) => {
            let sourceContextData = sourceContextsData.filter((x) => x.lowerName.match(/nodejs/i))[0]
            sourceContext = Promise.promisifyAll(client.newContext(sourceContextData))
          })
          .asCallback(done)
      })

      it('should fetch the source context versions', (done) => {
        return sourceContext.fetchVersionsAsync({ qs: { sort: '-created' }})
          .then((versions) => {
            sourceInfraCodeVersion = versions[0].infraCodeVersion;
            sourceContextVersion = Promise.promisifyAll(sourceContext.newVersion(versions[0]));
          })
          .asCallback(done)
      })
    })

    describe('Context & Context Versions', (done) => {
      it('should create a context', (done) => {
        client.createContextAsync({
          name: uuid.v4(),
          'owner.github': GITHUB_OAUTH_ID,
          owner: {
            github: GITHUB_OAUTH_ID
          }
        })
        .then((contextData) => {
          context = Promise.promisifyAll(client.newContext(contextData))
        })
        .asCallback(done)
      })

      it('should create a context version', (done) => {
        return context.createVersionAsync({
          source: sourceContextVersion.id
        })
          .then((contextVersionData) => {
            contextVersion = Promise.promisifyAll(context.newVersion(contextVersionData))
            return contextVersion.fetchAsync()
          })
          .asCallback(done)
      })

      it('should fetch the stack analysis', (done) => {
        let fullRepoName = GITHUB_USERNAME + '/' + GITHUB_REPO_NAME
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
                body: DOCKERFILE_BODY.replace(new RegExp('GITHUB_REPO_NAME', 'g'), GITHUB_REPO_NAME)
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

    describe('Builds & Instances', (done) => {
      it('should create a build for a context version', (done) => {
        return client.createBuildAsync({
          contextVersions: [contextVersion.id()],
          owner: {
            github: GITHUB_OAUTH_ID
          }
        })
        .then((buildData) => {
          build = Promise.promisifyAll(client.newBuild(buildData))
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
        let serviceLink = SERIVCE_NAME.toUpperCase() + '=' + serviceInstance.getContainerHostname()
        return client.createInstanceAsync({
          masterPod: true,
          name: GITHUB_REPO_NAME,
          env: [
            serviceLink
          ],
          ipWhitelist: {
            enabled: false
          },
          owner: {
            github: GITHUB_OAUTH_ID
          },
          build: build.id()
        })
          .then((instanceData) => {
            repoInstance = Promise.promisifyAll(client.newInstance(instanceData))
            return repoInstance.fetchAsync()
          })
          .asCallback(done)
      })
    })
  })

  describe('Working Container', () => {
    it('should get logs for that container', (done) => {
      // TODO: Improve test to test only build logs
      let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
      let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, repoInstance.attrs.contextVersion.id)
      let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /server.*running/i)
      return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
        .asCallback(done)
    })

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
      let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
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
    })

    it('should get logs for that container', (done) => {
      // TODO: Improve test to test only build logs
      let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
      let testBuildLogs = socketUtils.createTestBuildLogs(socket, container, repoInstance.attrs.contextVersion.id)
      let testCmdLogs = socketUtils.createTestCmdLogs(socket, container, /server.*running/i)
      return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
        .asCallback(done)
    })

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
      let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
      let container = repoInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n')
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })
  })
})

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
        token: ACCESS_TOKEN
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
          return allInstances.filter((instance) => {
            return instance.name.toLowerCase().includes(repoName.toLowerCase())
          })
        })
        .then((instances) => {
          let instancesWithBranchName = instances.filter((x) => x.name.includes(branchName))
          expect(instancesWithBranchName).to.have.lengthOf(1)
          repoBranchInstance = Promise.promisifyAll(client.newInstance(instancesWithBranchName[0]))
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
      let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
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
      let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
      let container = repoBranchInstance.attrs.container
      let testTerminal = socketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n', /from.*127.0.0.1/i)
      return Promise.race([socketUtils.failureHandler(socket), testTerminal()])
        .asCallback(done)
    })
  })
})

xdescribe('5. Container To Container DNS', () => {
  describe('Repo Instance', () => {
    it('should connect to the service container from the master branch', () => {

    })

    it('should connect to the service container from the created branch', () => {

    })
  })

  xdescribe('Service Instance', () => {
    it('should connect to the master branch repo instance', () => {

    })

    it('should connect to the creaated branch repo instance', () => {

    })
  })
})

xdescribe('6. Navi URLs', () => {
})
