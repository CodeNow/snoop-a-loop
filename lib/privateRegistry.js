'use strict'

const Promise = require('bluebird')
const options = require('./utils/env-arg-parser.js')

const User = require('./user.js')
const AuthenticatedRequest = require('./authenticatedRequest.js')

const client = require('./client.js')
const promisifyClientModel = require('./utils/promisify-client-model')
promisifyClientModel(client)

module.exports = class PrivateRegistry {
  static testSetPrivateRegistry() {
    let orgIndex = 0
    let org = client.attrs.bigPoppaUser.organizations[orgIndex]
    let url = 'quay.io/runnable/snoop'
    let username = 'runnable+snoop'
    let password

    return this.resetSnoopToken()
      .then((response) => password = response.token)
      .then(() => this.setPrivateRegistry(url, username, password, org))
      .then(() => User.getMe())
      .then((user) => this.testPrivateRegistry(url, username, user.bigPoppaUser.organizations[orgIndex]))
  }

  static resetSnoopToken() {
    return AuthenticatedRequest.quayRequest({
      method: 'POST',
      uri: 'https://quay.io/api/v1/organization/runnable/robots/snoop/regenerate',
      json: true
    })
  }

  static setPrivateRegistry(url, username, password, org) {
    return AuthenticatedRequest.apiRequest({
      method: 'POST',
      uri: options.API_URL + '/organizations/' + org.id + '/private-registry',
      body: {
        url,
        username,
        password
      },
      json: true
    })
  }

  static testPrivateRegistry (url, username, org) {
    let privateRegistryUsername = org.privateRegistryUsername
    let privateRegistryUrl = org.privateRegistryUrl

    return new Promise((resolve, reject) => {
      if (username !== privateRegistryUsername || url !== privateRegistryUrl) {
        reject(new Error('Expected ' + username + ' and ' + url + ' but was ' + privateRegistryUsername + ' and ' + privateRegistryUrl))
      }

      resolve()
    })
  }
}
