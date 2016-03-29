'use strict';
require('loadenv')()

const Promise = require('bluebird')
const Runnable = require('@runnable/api-client')
const uuid = require('uuid')
const objectId = require('objectid')
const fs = require('fs')
const dockerfileBody = fs.readFileSync('./lib/build/source-dockerfile-body.txt').toString()
require('string.prototype.includes');

const accessToken = process.env.AUTH_TOKEN || '6d0e7de3c05331ba4dc15d3e3067b55c990a4fdf'
const API_URL = process.env.API_URL || 'https://api.runnable-beta.com'
const GITHUB_USERNAME = 'Runnable'
const GITHUB_REPO_NAME = 'hello-node-rethinkdb'
const GITHUB_OAUTH_ID = 2828361 // Runnable

let client
const reqOpts = {
  headers: {
    'User-Agent': 'runnable-integration-test'
  }
}

before((done) => {
  client = Promise.promisifyAll(new Runnable(API_URL))
  return client.githubLoginAsync(accessToken)
    .asCallback(done)
})

after((done) => {
  client.logout(done)
})

describe('New Service Containers', () => {
  let sourceInstance
  let contextVersion
  let build
  let instance

  it('should fetch all template containers', (done) => {
    return client.fetchInstancesAsync({ githubUsername: 'HelloRunnable' })
      .then((instancesData) => {
        let instanceData = instancesData.filter((x) => x.name === 'RethinkDB')[0]
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
      name: 'RethinkDB7',
      env: [],
      ipWhitelist: {
        enabled: false
      },
      owner: {
        github: GITHUB_OAUTH_ID
      },
      build: build.id()
    })
      .then((instanceData) => {
        instance = Promise.promisifyAll(client.newInstance(instanceData))
      })
      .asCallback(done)
  })
})

describe('New Repository Containers', () => {
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
  let instance

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
                body: dockerfileBody.replace('GITHUB_REPO_NAME', GITHUB_REPO_NAME)
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
        return client.createInstanceAsync({
          masterPod: true,
          name: GITHUB_REPO_NAME,
          env: [],
          ipWhitelist: {
            enabled: false
          },
          owner: {
            github: GITHUB_OAUTH_ID
          },
          build: build.id()
        })
          .then((instanceData) => {
            instance = Promise.promisifyAll(client.newInstance(instanceData))
          })
          .asCallback(done)
      })
    })
  })
})
