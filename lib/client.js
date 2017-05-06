'use strict'

/**
 * Signleton client so that after we init it we can share it as a general service.
 */

const Runnable = require('@runnable/api-client')
const options = require('./utils/env-arg-parser.js')

var client = new Runnable(options.API_URL, { userContentDomain: options.USER_CONTENT_DOMAIN })

module.exports = client
