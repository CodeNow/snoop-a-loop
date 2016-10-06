'use strict'

const Promise = require('bluebird')
const PrimusClient = require('@runnable/api-client/lib/external/primus-client')
const uuid = require('uuid')

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
        reject(new Error('Socket Error on data stream: ' + data.error))
      }
    })
    socket.on('disconnection', () => {
      reject(new Error('Socket disconnected'))
    })
    socket.on('error', (err) => {
      reject(new Error('Socket Error on error stream: ' + err))
    })
  })
}

exports.createTestTerminal = function (socket, container, command, stringMatchRegex) {
  return Promise.method(() => {
    let uniqueId = uuid.v4()
    let terminalStream = socket.substream(uniqueId)

    let allData
    return new Promise((resolve, reject) => {
      socket.on('data', (data) => {
        if (data.event === 'TERMINAL_STREAM_CREATED') {
          terminalStream.write(command)
        }
      })
      terminalStream.on('end', () => {
        reject(new Error('Terminal substream killed'))
      })
      terminalStream.on('data', (data) => {
        allData += data
        if (allData.match(stringMatchRegex) !== null) {
          resolve()
        }
      })
      socket.write({
        id: 1,
        event: 'terminal-stream',
        data: {
          dockHost: container.dockerHost,
          type: 'filibuster',
          isDebugContainer: false,
          containerId: container.dockerContainer,
          terminalStreamId: uniqueId,
          eventStreamId: uniqueId + 'events'
        }
      })
    })
  })
}

exports.createTestBuildLogs = function (socket, container, contextVersionId) {
  return Promise.method(() => {
    let uniqueId = uuid.v4()
    let buildStream = socket.substream(uniqueId)
    return new Promise((resolve) => {
      buildStream.on('data', (data) => {
        if (!Array.isArray(data)) {
          data = [data]
        }
        data.forEach((message) => {
          if (message.type === 'log' && message.content.indexOf('Build completed') > -1) {
            resolve()
          }
        })
      })
      socket.write({
        id: 1,
        event: 'build-stream',
        data: {
          id: contextVersionId,
          streamId: uniqueId
        }
      })
    })
  })
}

exports.createTestCmdLogs = function (socket, container, stringMatchRegex) {
  return Promise.method(() => {
    let substream = socket.substream(container.dockerContainer)
    return new Promise((resolve) => {

      // Handle data!
      substream.on('data', (data) => {
        let stringData = data.toString()
        if (stringData.match(stringMatchRegex) !== null) {
          resolve()
        }
      })
      // Initialize the log-stream
      socket.write({
        id: 1,
        event: 'log-stream',
        data: {
          substreamId: container.dockerContainer,
          dockHost: container.dockerHost,
          containerId: container.dockerContainer
        }
      })
    })
  })
}
