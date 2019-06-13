'use strict'

const Hapi = require('@hapi/hapi')
const Basic = require('@hapi/basic')
const spawn = require('child_process').spawn
const fs = require('fs')
const fsa = fs.promises;
const path = require('path');
const auth = require('./auth')

const dirMode = parseInt('0755', 8)
let userConfig;

function log() {
  if (userConfig.debug) {
    console.log(...arguments);
  }
}

class UpdateServer {
    
    updateRepo(inputDir) {
        if (this.config.debug) {
            console.log("Running update repo")
        }
        return new Promise((resolve, reject) => {
          let val, type;
          let stdout = '';
          let stderr = '';
          
          const args = this.args.slice(0)
          args.push(`--directory=${inputDir}`)
          
          const command = spawn('/publish-package-repositories.sh', args)
          if (this.config.debug) {
            console.log('Spawning /publish-package-repositories.sh with args ', args)
          }
          if (this.config.debug) {
            command.stdout.on('data', (data) => {
              console.log(data.toString())
            })
          }
          command.stderr.on('data', (data) => {
            stderr += data.toString()
            console.error(data.toString())
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
    
    async start() {
        // Create a server with a host and port
        const debug = this.debug
        const server = new Hapi.Server({
          host: this.config.host,
          port: this.config.port,
          routes: {
            timeout: {
              server: 3600000,
              socket: 3600001
            }
          }
        })
    
        const cleanup = async (inputDir) => {
          if (debug) {
              console.log("Cleaning up incoming directory", inputDir)
          }
          try {
            const files = await fsa.readdir(inputDir);
            for (const file of files) {
              try {
                await fsa.unlink(path.join(inputDir, file))
              } catch (e) {
                console.error(`Failed to remove file ${file}`, err)
              }
            }
            await fsa.rmdir(inputDir);
          } catch (e) {
            console.error("Failed to cleanup package directory", e)
          }
        }
        
        await server.register(Basic);

        server.auth.strategy('simple', 'basic', { validate: auth.validate });

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
          handler: async (request, h) => {
            const payload = request.payload
            const inputDir = `/data/incoming/${process.hrtime().join('-')}`
            const success = async (response) => {
              await cleanup(inputDir);
              return {status: 'ok'}
            }
            const error = async (response) => {
              console.error("Error Encountered", response)
              await cleanup(inputDir);
              return {status: 'error'}
            }
            log("Received request", request.path)

            return fsa.mkdir(inputDir, dirMode)
            .then(() => new Promise((resolve) => {
              if (debug) {
                log('Saving uploaded file')
              }
              const tmpPath = `${inputDir}/${request.params.pkg}`
              const file = fs.createWriteStream(tmpPath)
              payload.pipe(file)
              file.on('finish', () => {
                log(`File uploaded: ${tmpPath}`)
                resolve(inputDir)
              })
            }))
            .then(this.updateRepo.bind(this))
            .then(success)
            .catch(error)
          }
        })

        // Start the server
        await server.start((err) => {
          if (err) {
            throw err
          }
          console.log('Server running at:', server.info.uri)
        })
    }
    
    initConfig(userConfig) {
        this.config = {
          auth_backends: {
            'predefined': {
              users: {}
            }
          },
          host: '0.0.0.0',
          port: 8000,
          args: {
            "gpg-key": "/data/conf/gpgkey.asc",
            "verbose": true,
            "visibility": "public"
          },
          debug: false
        }
        
        for (let key in userConfig) {
          this.config[key] = userConfig[key]
        }
        
        ['bucket', 'directory', 'prefix', 'gpg-key', 'aws-access-key', 'aws-secret-key', 'verbose', 'visibility'].forEach((opt) => {
          let val = opt in this.config.args ? this.config.args[opt] : process.env[opt.replace(/-/g, '_').toUpperCase()]
          let type = typeof val
          if (type === 'boolean') {
            val && this.args.push(`--${opt}`)
          } else if (type !== 'undefined') {
            this.args.push(`--${opt}=${val}`)
          }
        })
        
    }
    
    constructor(userConfig) {
        this.args = []
        this.initConfig(userConfig)
    }
}

try {
  userConfig = require(process.env.CONFIG_FILE || '/data/conf/config.json')
  const updateServer = new UpdateServer(userConfig)
  log('Starting server')
  updateServer.start().then(() => {})
} catch (e) {
  console.error(e)
}
