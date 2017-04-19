'use strict'

const Promise = require('bluebird')
const PrimusClient = require('@runnable/api-client/lib/external/primus-client')
const uuid = require('uuid')
const keypather = require('keypather')()

const opts = require('../utils/env-arg-parser')

module.exports = class SocketUtils {

  static createSocketConnection (apiSocketServer, sid) {
    sid = sid || opts.connectSid
    return new PrimusClient(apiSocketServer, {
      transport: {
        headers: {
          cookie: 'connect.sid=' + sid + ''
        }
      }
    })
  }

  static failureHandler (socket) {
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

  static createTestTerminal (socket, container, command, stringMatchRegex) {
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

  static createTestBuildLogs (socket, containerId) {
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
            containerId: containerId,
            streamId: uniqueId
          }
        })
      })
    })
  }

  static createTestCmdLogs (socket, container, stringMatchRegex) {
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

  static testBuildLogs (instance) {
    const buildContainerId = keypather.get(instance, 'attrs.contextVersion.build.dockerContainer')
    let socket = SocketUtils.createSocketConnection(opts.API_SOCKET_SERVER)
    let testBuildLogs = SocketUtils.createTestBuildLogs(socket, buildContainerId)
    return Promise.race([SocketUtils.failureHandler(socket), testBuildLogs()])
  }

  static testCMDLogs (instance, stringMatchRegex) {
    let socket = SocketUtils.createSocketConnection(opts.API_SOCKET_SERVER)
    let container = instance.attrs.container
    let testCmdLogs = SocketUtils.createTestCmdLogs(socket, container, stringMatchRegex || /server.*running/i)
    return Promise.race([SocketUtils.failureHandler(socket), testCmdLogs()])
  }

  static testTerminal (instance) {
    let socket = SocketUtils.createSocketConnection(opts.API_SOCKET_SERVER)
    let container = instance.attrs.container
    let testTerminal = SocketUtils.createTestTerminal(socket, container, 'sleep 1 && ping -c 1 localhost\n', /from.*127.0.0.1/i)
    return Promise.race([SocketUtils.failureHandler(socket), testTerminal()])
  }

}
