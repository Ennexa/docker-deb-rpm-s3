'use strict'

const Hapi = require('hapi')
const Basic = require('hapi-auth-basic')
const spawn = require('child_process').spawn
const fs = require('fs')
const auth = require('./auth')
const emptyDir = require('empty-dir');

var config = {
  auth_backends: {
    'predefined': {
      users: {
        admin: '$2a$10$iqJSHD.BGr0E2IxQwYgJmeP3NvhPrXAeLSaGCj6IR/XU5QtjVu5Tm'
      }
    }
    // 'ldap': {
    //
    // }
  },
  host: '0.0.0.0',
  port: 8000,
  args: {
    'directory': '/data/incoming/',
    'gpg-key': '/data/conf/gpgkey.asc',
    'verbose': true,
    'visibility': 'public'
  },
  debug: false
}

try {
  let userConfig = require('/data/conf/config.json')
  for (var i in userConfig) {
    config[i] = userConfig[i]
  }
} catch (e) {
  console.log(e);
}

// Create a server with a host and port
const server = new Hapi.Server({
    connections: {
      routes: {
        timeout: {
          server: 3600000,
          socket: 3600001
        }
      }
    }
})
server.connection({
  host: config.host,
  port: config.port
})

function updateRepo () {
  if (config.debug) {
      console.log("Running update repo")
  }
  return new Promise((resolve, reject) => {
    const args = []
    let val, type;
    let stdout = '';
    let stderr = '';
    
    ['bucket', 'directory', 'prefix', 'gpg-key', 'aws-access-key', 'aws-secret-key', 'verbose', 'visibility'].forEach((opt) => {
      val = opt in config.args ? config.args[opt] : process.env[opt.replace(/-/g, '_').toUpperCase()]
      type = typeof val
      if (type === 'boolean') {
        val && args.push(`--${opt}`)
      } else if (type !== 'undefined') {
        args.push(`--${opt}=${val}`)
      }
    })
    
    const command = spawn('/publish-package-repositories.sh', args)
    if (config.debug) {
      console.log('Spawning /publish-package-repositories.sh with args ', args)
    }
    command.stdout.on('data', (data) => {
      stdout += data.toString()
      if (config.debug) {
        console.log(stdout)
      }
    })
    command.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error(stderr)
    })

    command.on('close', (code) => {
      if (code) {
        console.error(`Command failed with code ${code}`)
        reject(stderr)
      } else {
        resolve(stdout)
      }
    })
  })
}

server.register(Basic, (err) => {
  server.auth.strategy('simple', 'basic', { validateFunc: auth.validate })
  const cleanup = () => {
    if (config.debug) {
        console.log("Cleaning up incoming directory")
    }
    emptyDir(config.directory, function (err, result) {
      if (err) {
        console.error("Failed to cleanup package directory", err)
      }
    })
  }
  server.route({
    method: ['PUT', 'POST'],
    path: '/{pkg}',
    config: {
      auth: 'simple',
      payload: {
        maxBytes: 104857600,
        output: 'stream',
        // allow: 'multipart/form-data', // important
        parse: true
      }
    },
    handler: (request, reply) => {
      const payload = request.payload
      const success = (response) => {
        cleanup();
        reply({status: 'ok'})
      }
      const error = (response) => {
        console.error(response)
        cleanup();
        reply({status: 'error'})
      }
      if (config.debug) {
        console.log("Received request", request.path)
      }
      try {
          var file = fs.createWriteStream(`/data/incoming/${request.params.pkg}`)
          payload.pipe(file)

          file.on('finish', () => {
            updateRepo().then(success).catch(error)
          })
      } catch (e) {
          error(e);
      }
    }
  })
})

// Start the server
server.start((err) => {
  if (err) {
    throw err
  }
  console.log('Server running at:', server.info.uri)
})
