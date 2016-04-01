'use strict'

const PrimusClient = require('@runnable/api-client/lib/external/primus-client')

exports.createSocketConnection = function (apiSocketServer, sid) {
  console.log('API_SOCKET_SERVER', apiSocketServer)
  console.log('sid', sid)
  return new PrimusClient(apiSocketServer, {
    transport: {
      headers: {
        cookie: 'connect.sid=' + sid + ''
      }
    }
  })
}

exports.failureHandler = function (socket) {
  console.log('RETURN HANDLER', socket)
  return new Promise((resolve, reject) => {
    socket.on('data', (data) => {
      if (data.error) {
        console.log('1.1', data.error)
        reject(new Error('Socket Error', {err: data.error}))
      }
    })
    socket.on('disconnection', () => {
        console.log('1')
      reject(new Error('Socket disconnected'))
    })
    socket.on('error', (err) => {
      console.log('1.2', err)
      reject(new Error('Socket Error', {err: err}))
    })
  })
}
