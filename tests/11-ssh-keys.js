'use strict'
const sshKeys = require('../lib/ssh-keys/ssh-keys')

module.exports = (config) => {
  const opts = config.opts

  describe('11. SSH Keys', function () {
    if (opts.NO_SSH_KEYS) this.pending = true

    before(() => {
      console.log('Finding and deleting old generated ssh keys on github.')
      return sshKeys.cleanupGithubKeys()
    })

    after(() => {
      console.log('Finding and deleting generated ssh keys on github.')
      return sshKeys.cleanupGithubKeys()
    })

    describe('create ssh key using api', () => {
      it('should return successful', () => {
        return sshKeys.createRunnableKey()
      })
    })

    describe('create new instance requiring ssh keys', () => {
      it('should build and start properly', () => {
        // TODO: implementation
      })
    })
  })
}
