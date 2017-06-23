'use strict'
const keypather = require('keypather')()
const Promise = require('bluebird')

module.exports = class InstanceUtils {
  static statusCheck (instance, conditionCheck) {
    let statusCheck = () => {
      if (conditionCheck(instance)) {
        return Promise.resolve(instance.attrs.container)
      }
      return instance.fetchAsync()
        .then(() => {
          return statusCheck()
        })
    }
    return statusCheck()
  }

  static assertInstanceHasContainer (instance) {
    return InstanceUtils.statusCheck(instance, i => !!keypather.get(instance, 'attrs.container.dockerContainer'))
  }

  static assertInstanceIsRunning (instance) {
    return InstanceUtils.statusCheck(instance, i => {
      return instance.status() === 'running'
    })
  }
}
