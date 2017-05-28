'use strict'
const PrivateRegistry = require('../lib/private-registry/private-registry')

module.exports = (config) => {
  const opts = config.opts

  describe('10. Private Docker Registry', function () {
    if (opts.NO_PRIVATE_REGISTRY) this.pending = true

    it('Update registry', () => {
      return PrivateRegistry.testSetPrivateRegistry()
    })
  })
}
