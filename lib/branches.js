'use strict'

var ApiClient = require('simple-api-client')
var async = require('async')
var apiUrl = 'https://api.github.com'
var github =  new ApiClient(apiUrl)
var put = require('101/put')
var range = require('range').range

module.exports = function (opts) {

  var token = opts.token || '3f2fa62a3ef45675b83b19f7631f7351715c8ca5'
  var repoPath = opts.repoPath || 'Runnable/nightmare'
  var sha = opts.sha || '8745fb0b5eebab8a1f578ae03401595cdc4849c0'
  var LIMIT = opts.LIMIT || 20

  var options = {
    path: '/repos/' + repoPath,
    headers: {
      'User-Agent': 'request',
      'Authorization': 'token ' + token
    }
  }
  var createBranchOpts = put(options, {
    path: '/repos/' + repoPath + '/git/refs'
  })

  function createNewBranch (name, cb) {
    var ref = 'refs/heads/feature-' + name
    var opts = put(createBranchOpts, {
      json: {
          'ref': ref,
          'sha': sha
        }
    })
    github.post(opts, function (err, res, body) {
      if (err) {
         console.log('ERR', err)
      }
      cb(err, body)
    })
  }

  function deleteBranch (name, cb) {
    var path = '/repos/' + repoPath + '/git/refs/heads/feature-' + name
    var opts = put(createBranchOpts, {
      path: path
    })
    github.del(opts, function (err, res, body) {
      if (err) {
         console.log('ERR', err)
      }
      cb(err, body)
    })
  }

  var branches = range(0, LIMIT)

  function createAll (cb) {
    if (process.env.BATCH_LIMIT > 0) {
      // ths one can be each too for completely parallel requests
      async.eachLimit(branches, process.env.BATCH_LIMIT, createNewBranch, cb)
    } else {
      async.each(branches, createNewBranch, cb)
    }
  }

  function deleteAll (cb) {
    async.each(branches, deleteBranch, cb)
  }

  return {
    delete: deleteAll,
    create: createAll
  }
}




