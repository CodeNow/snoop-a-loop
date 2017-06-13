'use strict'
const AuthenticatedRequest = require('./../request/authenticated-request.js')
const GitHubApi = require('github')
const opts = require('../utils/env-arg-parser')
const Promise = require('bluebird')
const User = require('./../user.js')

const SSHKeys = module.exports = {
  _getGithub: () => {
    let github = new GitHubApi({
      // required
      version: '3.0.0',
      Promise: require('bluebird'),
      // optional
      protocol: 'https',
      timeout: 2000
    })
    github.authenticate({
      type: 'token',
      token: opts.ACCESS_TOKEN
    })
    return github
  },
  getGithubSSHKeys: () => {
    return SSHKeys._getGithub().users.getKeys({})
      .get('data')
      .then((githubKeys) => {
        return githubKeys.filter((key) => {
          return key.title.startsWith(opts.SSH_KEY_PREFIX) && key.title.endsWith(opts.GITHUB_USERNAME)
        })
      })
  },
  getRunnableSSHKeys: () => {
    return User.getMe()
      .then((user) => {
        return user.bigPoppaUser.organizations.find((org) => {
          return org.lowerName === opts.GITHUB_USERNAME.toLowerCase()
        })
      })
      .get('id')
      .then((bpOrgId) => {
        return AuthenticatedRequest.apiRequest({
          method: 'GET',
          uri: opts.API_URL + '/organizations/' + bpOrgId + '/ssh-key'
        })
      })
      .get('keys')
      .catch((err) => {
        if (err.statusCode !== 404) {
          throw err
        }
        return []
      })
  },
  deleteKey: (ghKeyId) => {
    return SSHKeys._getGithub().users.deleteKey({id: ghKeyId})
  },
  cleanupGithubKeys: () => {
    return SSHKeys.getGithubSSHKeys()
      .then((keys) => {
        return Promise.each(keys, (key) => {
          return SSHKeys.deleteKey(key.id)
        })
      })
  },
  createRunnableKey: () => {
    const waitForNewKey = () => {
      return Promise.delay(100)
        .then(() => {
          return SSHKeys.getGithubSSHKeys()
        })
        .then((keys) => {
          if (!keys.length) {
            return waitForNewKey()
          }
          return keys[0]
        })
    }

    return User.getMe()
      .then((user) => {
        return user.bigPoppaUser.organizations.find((org) => {
          return org.lowerName === opts.GITHUB_USERNAME.toLowerCase()
        })
      })
      .get('id')
      .then((bpOrgId) => {
        return AuthenticatedRequest.apiRequest({
          method: 'POST',
          uri: opts.API_URL + '/organizations/' + bpOrgId + '/ssh-key'
        })
      })
      .then(waitForNewKey)
  }
}
