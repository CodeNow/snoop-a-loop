'use strict'

const requestPromise = require('request-promise')
const keypather = require('keypather')()

const client = require('./client.js')
const promisifyClientModel = require('./utils/promisify-client-model')
promisifyClientModel(client)

module.exports = class authenticatedRequest {
  static apiRequest(config) {
    let sid = client.connectSid
    keypather.set(config, 'headers.cookie', 'connect.sid=' + sid)

    return requestPromise(config)
  }

  static quayRequest(config) {
    // Application access token scopes are read, admin:org
    // Generated from the generate token tab in the application snoop in quay
    let quayApiToken = 'YhLUDmefqQdmTK5BiRUdMJ50ia0R8W2VhLUJ5Sxn'
    keypather.set(config, 'headers.authorization', 'Bearer ' + quayApiToken)

    return requestPromise(config)
  }
}
