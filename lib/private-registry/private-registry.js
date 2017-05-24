'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const options = require('./../utils/env-arg-parser.js')

const User = require('./../user.js')
const AuthenticatedRequest = require('./../request/authenticated-request.js')

const client = require('./../client.js')
const promisifyClientModel = require('./../utils/promisify-client-model')
promisifyClientModel(client)

module.exports = class PrivateRegistry {
  static testSetPrivateRegistry() {
    let orgIndex = 0
    let org = client.attrs.bigPoppaUser.organizations[orgIndex]
    let url = 'quay.io'
    let username = 'runnable+snoop'
    let password

    return this.resetSnoopToken()
      .then((response) => password = response.token)
      .then(() => this.setPrivateRegistry(url, username, password, org))
      .then(() => User.getMe())
      .then((user) => {
        let updatedOrg = user.bigPoppaUser.organizations[orgIndex]

        expect(username).to.equal(updatedOrg.privateRegistryUsername)
        expect(url).to.equal(updatedOrg.privateRegistryUrl)
      })
  }

  static resetSnoopToken() {
    return AuthenticatedRequest.quayRequest({
      method: 'POST',
      uri: 'https://quay.io/api/v1/organization/runnable/robots/snoop/regenerate'
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
      }
    })
  }
}
