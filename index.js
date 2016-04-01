'use strict';
require('loadenv')()

const Promise = require('bluebird')
const Runnable = require('@runnable/api-client')
const uuid = require('uuid')
const objectId = require('objectid')
const fs = require('fs')
const dockerfileBody = fs.readFileSync('./lib/build/source-dockerfile-body.txt').toString()
const socketUtils = require('./lib/socket/utils.js')
const PrimusClient = require('@runnable/api-client/lib/external/primus-client')
const dockerStreamCleanser = require('docker-stream-cleanser')
require('string.prototype.includes');

const accessToken = process.env.AUTH_TOKEN || '6d0e7de3c05331ba4dc15d3e3067b55c990a4fdf'
const API_URL = process.env.API_URL || 'https://api.runnable-gamma.com'
const API_SOCKET_SERVER = process.env.API_SOCKET_SERVER || API_URL.replace('api', 'apisock')
const GITHUB_USERNAME = 'Runnable'
const GITHUB_REPO_NAME = 'hello-node-rethinkdb'
const SERIVCE_NAME = 'RethinkDB'
const GITHUB_OAUTH_ID = 2828361 // Runnable

const userContentDomains = {
  'runnable-beta': 'runnablecloud.com',
  'runnable-gamma': 'runnable.ninja',
  'runnable': 'runnableapp.com' // runnable.io
}
const USER_CONTENT_DOMAIN = process.env.USER_CONTENT_DOMAIN || userContentDomains[API_URL.match(/runnable[\-A-z]*/i)]

let client
let nonRepoContainer
let repoContainer

const reqOpts = {
  headers: {
    'User-Agent': 'runnable-integration-test'
  }
}

before((done) => {
  client = Promise.promisifyAll(new Runnable(API_URL, { userContentDomain: USER_CONTENT_DOMAIN }))
  return client.githubLoginAsync(accessToken)
    .asCallback(done)
})

after((done) => {
  client.logout(done)
})

describe('Cleanup', () => {
  let repoContainer
  let nonRepoContainer

  it('should fetch the instances', (done) => {
    return client.fetchInstancesAsync({ githubUsername: GITHUB_USERNAME })
      .then((instancesData) => {
        let nonRepoContainerInstanceData = instancesData.filter((x) => x.name === SERIVCE_NAME)[0]
        if (nonRepoContainerInstanceData) {
          nonRepoContainer = Promise.promisifyAll(client.newInstance(nonRepoContainerInstanceData))
        }
        let repoContainerInstanceData = instancesData.filter((x) => x.name === GITHUB_REPO_NAME)[0]
        if (repoContainerInstanceData) {
          repoContainer = Promise.promisifyAll(client.newInstance(repoContainerInstanceData))
        }
      })
      .asCallback(done)
  })

  it('should delete/destroy the non-repo container', (done) => {
    if (!nonRepoContainer) return done()
    return nonRepoContainer.destroyAsync()
      .asCallback(done)
  })

  it('should delete/destroy the repo container', (done) => {
    if (!repoContainer) return done()
    return repoContainer.destroyAsync()
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
        nonRepoContainer = Promise.promisifyAll(client.newInstance(instanceData))
        return nonRepoContainer.fetchAsync()
      })
      .asCallback(done)
  })

  it('should get logs for that container', (done) => {
    console.log('NonRepoContainer Status', nonRepoContainer.status())
    // let socket = socketUtils.createSocketConnection(API_SOCKET_SERVER, client.connectSid)
    let socket = new PrimusClient(API_SOCKET_SERVER, {
      transport: {
        headers: {
          cookie: 'connect.sid=' + client.connectSid
        }
      }
    })

    let testBuildLogs = Promise.method(() => {
      let uniqueId = uuid.v4()
      let buildStream = socket.substream(uniqueId)
      console.log('START 0', buildStream, uniqueId)
      return new Promise((resolve) => {
        console.log('START 1')
        buildStream.on('data', (data) => {
          console.log('data', data)
          if (!Array.isArray(data)) {
            data = [data]
          }
          data.forEach((message) => {
            console.log('Message', message)
            if (message.type === 'log' && message.content.indexOf('Build completed') > -1) {
              resolve()
            }
          })
        })
        console.log('write', nonRepoContainer.attrs.contextVersion.id)
        socket.write({
          id: 1,
          event: 'build-stream',
          data: {
            id: nonRepoContainer.attrs.contextVersion.id,
            streamId: uniqueId
          }
        })
      })
    })
    var container = nonRepoContainer.attrs.container
    var testCmdLogs = Promise.method(() => {
      var substream = socket.substream(container.dockerContainer)
      return new Promise((resolve) => {
        var streamCleanser = dockerStreamCleanser('hex', true)
        substream.pipe(streamCleanser)

        // Handle data!
        streamCleanser.on('data', (data) => {
          console.log('streamCleanser', data)
          var stringData = data.toString()
          if (stringData.indexOf('Server running') > -1) {
            resolve()
          }
        })
        // Initialize the log-stream
        console.log('WRITE')
        socket.write({
          id: 1,
          event: 'log-stream',
          data: {
            substreamId: container.dockerContainer,
            dockHost: container.dockerHost,
            containerId: container.dockerContainer
          }
        })
      })
    })
    return Promise.race([socketUtils.failureHandler(socket), testBuildLogs(), testCmdLogs()])
      .asCallback(done)
  })//.timeout(20000)

  it('should be succsefully built', (done) => {
    nonRepoContainer.on('update', () => console.log('Update:'))
    if (nonRepoContainer.status() === 'running') return done()
  })

  xit('should have a working terminal', (done) => {

  })
})

xdescribe('2. New Repository Containers', () => {
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
  let appCodeVersion

  describe('Create A Container', () => {
    describe('Github', () => {
      it('should create a github org', () => {
        githubOrg = Promise.promisifyAll(client.newGithubOrg(GITHUB_USERNAME))
        // return githubOrg.fetchAsync()
          // .asCallback(done)
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
                body: dockerfileBody.replace(new RegExp('GITHUB_REPO_NAME', 'g'), GITHUB_REPO_NAME)
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
        let serviceLink = SERIVCE_NAME.toUpperCase() + '=' + nonRepoContainer.getContainerHostname()
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
            repoContainer = Promise.promisifyAll(client.newInstance(instanceData))
          })
          .asCallback(done)
      })
    })
  })

  describe('Working Container', () => {
    xit('should get logs for that container', (done) => {

    })

    xit('should be succsefully built', (done) => {

    })

    xit('should have a working terminal', (done) => {
    })
  })
})

xdescribe('3. Rebuild Repo Container', () => {
})

xdescribe('4. Github Webhooks', () => {
})


xdescribe('5. Container To Container DNS', () => {
})

xdescribe('6. Navi URLs', () => {
})
