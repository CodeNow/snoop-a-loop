'use strict'

const options = require('./utils/env-arg-parser.js')
const AuthenticatedRequest = require('./request/authenticated-request.js')

module.exports = class User {
  static getMe() {
    return AuthenticatedRequest.apiRequest({
      uri: options.API_URL + '/users/me'
    })
  }
}
