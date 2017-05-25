'use strict'
const common = require('../lib/utils/common')
const expect = require('chai').expect
const Promise = require('bluebird')

const request = Promise.promisifyAll(require('request'))

module.exports = (config) => {
  const opts = config.opts

  describe('8. Navi URLs', function () {
    if (opts.NO_NAVI) this.pending = true

    describe('Repo Instance', () => {
      it('should access the main container', () => {
        let hostname = common.repoInstance.getContainerHostname()
        return request.getAsync('http://' + hostname)
          .then(function (res) {
            expect(res.body).to.match(opts.REPO_CONTAINER_MATCH)
          })
      })

      it('should access the branch container', function () {
        if (opts.ISOLATION || opts.NO_WEBHOOKS) {
          return Promise.resolve() // Doesn't work for isolation for some reason
        }
        let hostname = common.repoBranchInstance.getContainerHostname()
        return request.getAsync('http://' + hostname)
          .then(function (res) {
            expect(res.body).to.match(opts.REPO_CONTAINER_MATCH)
          })
      })
    })

    describe('Service Instance', () => {
      // This currently doesn't work
      xit('should connect to the service instance', () => {
        let hostname = common.serviceInstance.getContainerHostname()
        return request.getAsync('http://' + hostname + ':8080')
          .then(function (res) {
            expect(res.body).to.match(opts.SERVICE_CONTAINER_MATCH)
          })
      })
    })
  })
}
