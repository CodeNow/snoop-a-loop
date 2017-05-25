'use strict'
const common = require('../lib/utils/common')
const InstanceUtils = require('../lib/instance/util.js')
const Promise = require('bluebird')
const socketUtils = require('../lib/socket/utils.js')

const assertInstanceHasContainer = InstanceUtils.assertInstanceHasContainer
const assertInstanceIsRunning = InstanceUtils.assertInstanceIsRunning
const testBuildLogs = socketUtils.testBuildLogs
const testCMDLogs = socketUtils.testCMDLogs

module.exports = (config) => {
  const client = config.client
  const opts = config.opts

  describe('4. Rebuild Repo Container', function () {
    if (opts.NO_REBUILD) this.pending = true

    let newBuild
    describe('Rebuilding without Cache', () => {
      it('should deep copy the build', () => {
        return common.build.deepCopyAsync()
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
            return common.repoInstance.updateAsync({
              build: newBuild.id()
            })
          })
          .then(() => {
            return common.repoInstance.fetchAsync()
          })
      })
    })

    describe('Working Container', () => {
      it('should have a container', () => {
        return assertInstanceHasContainer(common.repoInstance)
      }).timeout(opts.TIMEOUT)

      it('should get logs for that container', function () {
        if (opts.NO_LOGS) return this.skip()
        return testBuildLogs(common.repoInstance)
      })

      it('should be succsefully built', () => {
        return assertInstanceIsRunning(common.repoInstance)
      })

      it('should have a working terminal', () => {
        return testCMDLogs(common.repoInstance, /server.*running/i)
      })
    })
  })
}
