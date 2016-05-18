'use strict';
const Promise = require('bluebird')

module.exports = (obj) => {
  const hasProp = {}.hasOwnProperty;
  for (var key in obj) {
    ((key) => {
      if (hasProp.call(obj, key + 'Async') !== false) {
        return
      }
      if (typeof obj[key] === 'function') {
        let myFunc = function () {
          let results
          return Promise.fromCallback((cb) => {
            const args = [].slice.call(arguments)
            args.push(cb)
            results = obj[key].apply(obj, args)
          })
            .return(results)
        }
        obj[key + 'Async'] = myFunc
      }
    })(key)
  }
  return obj
}
