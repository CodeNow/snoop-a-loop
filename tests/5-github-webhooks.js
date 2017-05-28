'use strict'
const common = require('../lib/utils/common')
const delay = require('delay')
const GitHubApi = require('github')
const InstanceUtils = require('../lib/instance/util.js')
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')
const expect = require('chai').expect
const socketUtils = require('../lib/socket/utils.js')
require('chai').use(require('dirty-chai'))

const assertInstanceHasContainer = InstanceUtils.assertInstanceHasContainer
const assertInstanceIsRunning = InstanceUtils.assertInstanceIsRunning
const testBuildLogs = socketUtils.testBuildLogs
const testCMDLogs = socketUtils.testCMDLogs
const testTerminal = socketUtils.testTerminal

module.exports = (config) => {
  const client = config.client
  const opts = config.opts

  describe('5. Github Webhooks', function () {
    if (opts.NO_WEBHOOKS) this.pending = true

    let branchName = 'test-branch-' + (new Date().getTime())
    let github
    let refName = 'refs/heads/' + branchName
    let repoBranchInstance
    let repoName
    let userName

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
        let acv = common.repoInstance.attrs.contextVersion.appCodeVersions[ 0 ]
        userName = acv.repo.split('/')[ 0 ]
        repoName = acv.repo.split('/')[ 1 ]
        return Promise.fromCallback((cb) => {
          github.repos.getCommits({
            repo: repoName,
            user: userName
          }, cb)
        })
          .then((commits) => {
            let lastCommitSha = commits[ 0 ].sha
            return Promise.fromCallback((cb) => {
              github.gitdata.createReference({
                repo: repoName,
                user: userName,
                ref: refName,
                sha: lastCommitSha
              }, cb)
            })
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
            common.repoBranchInstance = repoBranchInstance = instances.filter((x) => x.attrs.name.includes(branchName))[0]
            expect(repoBranchInstance).to.not.be.undefined()
            promisifyClientModel(repoBranchInstance)
            return common.repoInstance.fetchAsync()
          })
      })
    })

    describe('Working Container', () => {
      it('should have a container', () => {
        return assertInstanceHasContainer(repoBranchInstance)
      })

      it('should get build logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testBuildLogs(repoBranchInstance)
      })

      it('should get CMD logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testCMDLogs(repoBranchInstance, common.REPO_CMD_REGEX)
      })

      it('should be succsefully built', () => {
        return assertInstanceIsRunning(repoBranchInstance)
      })

      it('should have a working terminal', () => {
        return testTerminal(repoBranchInstance)
      })
    })
  })
}
