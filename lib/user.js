'use strict'

const options = require('./utils/env-arg-parser.js')
const AuthenticatedRequest = require('./authenticatedRequest.js')

module.exports = class User {
  static getMe() {
    return AuthenticatedRequest.apiRequest({
      uri: options.API_URL + '/users/me',
      json: true
    })
  }
}