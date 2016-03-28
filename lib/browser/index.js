// $ sudo /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
'use strict';
var Promise = require('bluebird')
var steer = require('steer')
var loaded = require('steer-loaded')
var fs = Promise.promisifyAll(require('fs'))
var path = require('path')
var keypather = require('keypather')()
var BrowserActions = require('./browser-actions.js')

module.exports = class Browser {

  constructor (opts) {
    this.host = opts.host
    this.initialPromise
    this.chrome = steer({
      cache: path.resolve(__dirname, 'cache'),
      inspectorPort: 7510,
      size: [1280, 1024],
      userAgent: 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36',
      permissions: [
        'browsingData',
        'tabs'
      ]
    })
    this.initialPromise = Promise.fromCallback((cb) => {
      console.log('this.chrome', this.chrome.once)
      this.chrome.once('open', () => {
        this.Page = Promise.promisifyAll(this.chrome.inspector.Page);
        this.Runtime = Promise.promisifyAll(this.chrome.inspector.Runtime);
        this.Page.enableAsync()
          .finally(cb)
      })
    })
      .then(() => {
        return this.Page.navigateAsync(this.host)
      })
      .then(this.loadedAsync.bind(this))
  }

  setup () {
    console.log('setup')
    var args = [].slice.call(arguments)
    return this._executeInBrowser(this.host, BrowserActions.setup, args)
  }

  loginToRunnable () {
    var args = [this.host].concat([].slice.call(arguments))
    return this._executeInBrowser(BrowserActions.loginToRunnable, args)
  }

  alertConfigAPIHost () {
    console.log('alertConfigAPIHost')
    var args = [this.host].concat([].slice.call(arguments))
    return this._executeInBrowser(BrowserActions.alertConfigAPIHost, args)
  }

  fetchInstancesByPod (repoName) {
    return `(function () {
     inject('fetchInstancesByPod')
      fetchInstancesByPod()
        .then(function (instances) {
          window.instance = instances.filter(function (model) {
            return model.attrs.lowerName === '${repoName}'.toLowerCase();
          })[0]
        })
      return true;
    })();`;
  }

  getInstances  () {
    return `(function () {
      var names = window.instance.children.models.map(function (model) {
       return model.attrs.name;
      });
      return JSON.stringify(names);
    })();`
  }

  loadedAsync () {
    return Promise.fromCallback((cb) => {
      loaded(this.chrome, cb)
    })
  }

  refresh () {
    return this.Page.navigateAsync(this.host)
      .then(this.loadedAsync.bind(this))
  }

  _executeInBrowser (url, func, args) {
    return this.initialPromise
     .then(() => {
        let classFuncString = func.toString()
        let funcName = classFuncString.match(/^[A-z ]*/)[0]
        let funcString = classFuncString.replace(/^[A-z ]*/, 'function ')
        let jsonArgs = JSON.stringify(args)
        return this.Runtime.evaluateAsync(`
          window.${funcName} = ${funcString};
          window.${funcName} = ${funcString};
          window.${funcName}(JSON.parse(\`${jsonArgs}\`));
        `)
      })
      .catch((err) => {
         console.log('Error executing comand in browser:', err)
         throw err
      })
  };

  close () {
    this.chrome.close()
  }
}
