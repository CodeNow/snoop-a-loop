'use strict'

const Promise = require('bluebird')
const requestPromise = require('request-promise')

const options = require('./utils/env-arg-parser.js')

const User = require('./user.js')

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
    // Application access token scopes are read, admin:org
    // Generated from the generate token tab in the application snoop in quay
    let quayApiToken = 'YhLUDmefqQdmTK5BiRUdMJ50ia0R8W2VhLUJ5Sxn'

    return requestPromise({
      method: 'POST',
      uri: 'https://quay.io/api/v1/organization/runnable/robots/snoop/regenerate',
      headers: {
        authorization: 'Bearer ' + quayApiToken
      },
      json: true
    })
  }

  static setPrivateRegistry(url, username, password, org) {
    let sid = client.connectSid

    return requestPromise({
      method: 'POST',
      uri: options.API_URL + '/organizations/' + org.id + '/private-registry',
      body: {
        url,
        username,
        password
      },
      headers: {
        cookie: 'connect.sid=' + sid + ''
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
