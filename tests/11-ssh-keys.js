'use strict'
const expect = require('chai').expect
const sshKeys = require('../lib/ssh-keys/ssh-keys')
require('chai').use(require('dirty-chai'))

module.exports = (config) => {
  const opts = config.opts

  describe('11. SSH Keys', function () {
    if (opts.NO_SSH_KEYS) this.pending = true

    before(() => {
      return sshKeys.cleanupGithubKeys()
    })

    after(() => {
      return sshKeys.cleanupGithubKeys()
    })

    describe('create ssh key using api', () => {
      it('should return successful', () => {
        return sshKeys.createRunnableKey()
      })
      it('should return keys when fetched from the API', () => {
        return sshKeys.getRunnableSSHKeys()
          .then((keys) => {
            const key = keys.find((key) => {
              return key.keyName.endsWith(opts.GITHUB_USERNAME)
            })
            expect(key, 'ssh key').to.exist()
          })
      })
    })

    describe('create new instance requiring ssh keys', () => {
      it('should build and start properly', () => {
        // TODO: implementation
      })
    })
  })
}
