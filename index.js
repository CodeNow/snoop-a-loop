'use strict';
require('loadenv')()

const Promise = require('bluebird')
const Runnable = require('@runnable/api-client')
const uuid = require('uuid')
require('string.prototype.includes');

const accessToken = process.env.AUTH_TOKEN || '9ba122889b562c9e407d85e3203de3cbdf49578d'
const API_URL = process.env.API_URL || 'https://api.runnable-gamma.com'
const GITHUB_USERNAME = 'Runnable'
const GITHUB_REPO_NAME = 'hello-node-rethinkdb'
const GITHUB_OAUTH_ID = 2828361 // Runnable

let client
let context
let contextVersion
let build
let githubOrg
let githubRepo
let githubBranch
let appCodeVersion
let instance

before((done) => {
  client = Promise.promisifyAll(new Runnable(API_URL))
  client.githubLoginAsync(accessToken)
    .asCallback(done)
})

after((done) => {
  client.logout(done)
})

describe('New Repository Containers', () => {

  describe('Create A Container', () => {

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
      return context.createVersionAsync({})
        .then((contextVersionData) => {
          contextVersion = Promise.promisifyAll(context.newVersion(contextVersionData))
          return contextVersion.fetchAsync()
        })
        .asCallback(done)
    })

    it('should create a build for a context version', (done) => {
      return client.createBuildAsync({
        contextVersions: [contextVersion.id()],
        owner: {
          github: GITHUB_OAUTH_ID
        }
      })
      .then((buildData) => {
        build = Promise.promisifyAll(client.newBuild(buildData))
        return build.fetchAsync()
      })
      .asCallback(done)
    })

    it('should create a github org', () => {
      githubOrg = Promise.promisifyAll(client.newGithubOrg(GITHUB_USERNAME))
      // return githubOrg.fetchAsync()
        // .asCallback(done)
    })

    it('should fetch a github branch', (done) => {
      return githubOrg.fetchRepoAsync(GITHUB_REPO_NAME, {
        headers: {
          'User-Agent': 'runnable-integration-test'
        }
      })
        .then((_githubRepo) => {
          githubRepo = Promise.promisifyAll(client.newGithubRepo(_githubRepo))
        })
        .asCallback(done)
    })

    it('should fetch a github repo branch', (done) => {
      return githubRepo.fetchBranchAsync('master', {
        headers: {
          'User-Agent': 'runnable-integration-test'
        }
      })
        .then((_branch) => {
          githubBranch = _branch
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
        .then((instance) => {
          console.log('Instance', instance)
        })
        .asCallback(done)
    })
  })
})
