'use strict'

const PrimusClient = require('@runnable/api-client/lib/external/primus-client')

exports.createSocketConnection = function (apiSocketServer, sid) {
  return new PrimusClient(apiSocketServer, {
    transport: {
      headers: {
        cookie: 'connect.sid=' + sid + ''
      }
    }
  })
}

exports.failureHandler = function (socket) {
  return new Promise((resolve, reject) => {
    socket.on('data', (data) => {
      if (data.error) {
        reject(new Error('Socket Error', {err: data.error}))
      }
    })
    socket.on('disconnection', () => {
      reject(new Error('Socket disconnected'))
    })
    socket.on('error', (err) => {
      reject(new Error('Socket Error', {err: err}))
    })
  })
}
