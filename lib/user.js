'use strict'

const requestPromise = require('request-promise')

const options = require('./utils/env-arg-parser.js')

const client = require('./client.js')
const promisifyClientModel = require('./utils/promisify-client-model')
promisifyClientModel(client)

module.exports = class User {
  static getMe() {
    let sid = client.connectSid
    return requestPromise({
      uri: options.API_URL + '/users/me',
      headers: {
        cookie: 'connect.sid=' + sid + ''
      },
      json: true
    })
  }
}
