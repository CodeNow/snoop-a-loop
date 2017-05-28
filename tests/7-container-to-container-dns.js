'use strict'
const common = require('../lib/utils/common')
const socketUtils = require('../lib/socket/utils.js')

const testTerminal = socketUtils.testTerminal

module.exports = (config) => {
  const opts = config.opts

  describe('7. Container To Container DNS', function () {
    if (opts.NO_DNS) this.pending = true
    this.retries(5)

    describe('Repo Instance', () => {
      it('should connect to the container from the master branch', function () {
        return testTerminal(common.repoInstance, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      })

      it('should connect to the container from the newly created branch (if not isolated)', function () {
        if (opts.ISOLATION || opts.NO_WEBHOOKS) return this.skip()
        return testTerminal(common.repoBranchInstance, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      })

      it('should connect to the isolated container from the isolated branch', function () {
        if (!opts.ISOLATION) return this.skip()
        return testTerminal(common.repoBranchInstance, 'curl localhost\n', opts.REPO_CONTAINER_MATCH)
      })
    })

    describe.skip('Service Instance', function () {
      it('should connect to the master branch repo instance', (done) => {
      })

      it('should connect to the created branch repo instance', (done) => {
      })
    })
  })
}
