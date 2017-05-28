'use strict'

const keypather = require('keypather')()
const options = require('./../utils/env-arg-parser.js')
const Promise = require('bluebird')
const requestPromise = require('request-promise')

const client = require('./../client.js')
const promisifyClientModel = require('./../utils/promisify-client-model')
promisifyClientModel(client)

module.exports = class authenticatedRequest {
  static apiRequest (config) {
    let sid = client.connectSid
    if (keypather.get(config, 'headers.cookie') === undefined) {
      keypather.set(config, 'headers.cookie', 'connect.sid=' + sid)
    }

    if (keypather.get(config, 'json') === undefined) {
      keypather.set(config, 'json', true)
    }

    return Promise.resolve(requestPromise(config))
  }

  static quayRequest (config) {
    if (keypather.get(config, 'headers.authorization') === undefined) {
      keypather.set(config, 'headers.authorization', 'Bearer ' + options.QUAY_API_TOKEN)
    }

    if (keypather.get(config, 'json') === undefined) {
      keypather.set(config, 'json', true)
    }

    return Promise.resolve(requestPromise(config))
  }
}
