'use strict'
const Promise = require('bluebird')
const promisifyClientModel = require('../lib/utils/promisify-client-model')

module.exports = (config) => {
  const client = config.client
  const opts = config.opts

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
}
