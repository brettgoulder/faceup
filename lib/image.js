"use strict";

// For the mapping.coffee template
require('coffee-script')

var request = require('request')
  , Buffers = require('buffers')
  , im = require('imagemagick')
  , url = require('url')
  , async = require('async')
  , mapping = require('../mapping')
  , cache = require('./util').cache

function faceDetect(image, callback) {
  cache('face:' + image, function(i, callback) {
    var uri = url.parse('http://api.face.com/faces/detect.json', true)
    uri.query = {
      api_key: process.env.FACE_API_KEY,
      api_secret: process.env.FACE_API_SECRET,
      urls: image,
    }
    request({uri: url.format(uri), json: true}, function(err, response, data) {
      if (err) return callback(err)
      callback(null, data)
    })
  }, callback)
}

function fetchImage(image, callback) {
  cache('image:' + image, function(i, callback) {
    request({uri: image, onResponse: true}, function(err, res) {
      if (err) return callback(err)
      var data = Buffers()
      res.on('data', function(chunk) {
        data.push(chunk)
      })
      res.on('end', function() {
        callback(null, data.toBuffer())
      })
    })
  }, callback)
}

function applyOverlay(image, options, callback) {
  var args = [
    '-',
    '-virtual-pixel',
    'transparent',
  ]

  var photo = options.face.photos[0]

  if (!photo.tags) {
    return callback(null, null)
  }

  photo.tags.forEach(function(face) {
    try {
      var transform = mapping[options.overlay](face, photo)
    } catch (err) {
      // TODO Probably just missing the feature (like face.nose, etc)
      // console.log(err.stack)
      return
    }

    args = args.concat([
      '(',
      'overlays/'+options.overlay+'.png',
      '+distort'
    ])
    args = args.concat(transform)
    args.push(')')
  })

  args.push('-flatten')
  args.push('jpg:-')

  // console.log(args.join(' '))

  var proc = im.convert(args, function(err, stdout, stdin) {
    if (err) return callback(err)

    // THIS IS STUPID, IMAGEMAGICK Y U NO OUTPUT A BUFFER?!
    stdout = Buffer(stdout, 'binary')

    callback(err, stdout)
  })
  proc.stdin.end(image)
}

exports.mash = function(data, callback){
  cache(data, function(data, callback) {
    console.log('overlay:', data.overlay, 'image:', data.image)
    async.parallel(
      {
        face: async.apply(faceDetect, data.image),
        image: async.apply(fetchImage, data.image),
      },
      function(err, results) {
        if (err) return callback(err)

        if (!results.face.photos[0]) return callback(null, null)

        var options = {
          face: results.face,
          overlay: data.overlay
        }
        applyOverlay(results.image, options, callback)
      }
    )
  }, callback)
};
