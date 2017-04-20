'use strict'
const keypather = require('keypather')()
const Promise = require('bluebird')
const delay = require('delay')

module.exports = class InstanceUtils {
  static statusCheck (instance, conditionCheck) {
    let statusCheck = () => {instance
      if (conditionCheck(instance)) {
        return Promise.resolve(instance.attrs.container)
      }
      instance.fetchAsync()
      return delay(500)
        .then(() => statusCheck())
    }
    return statusCheck()
  }

  static assertInstanceHasContainer (instance) {
    return InstanceUtils.statusCheck(instance, i => !!keypather.get(instance, 'attrs.container.dockerContainer'))
  }

  static assertInstanceIsRunning (instance) {
    return InstanceUtils.statusCheck(instance, i => i.status() === 'running')
  }
}