'use strict'

const Hapi = require('hapi')
const Basic = require('hapi-auth-basic')
const spawn = require('child_process').spawn
const fs = require('fs')
const path = require('path');
const auth = require('./auth')

const dirMode = parseInt('0755', 8)

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
    
    start() {
        // Create a server with a host and port
        const debug = this.debug
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
          host: this.config.host,
          port: this.config.port
        })

        const cleanup = (inputDir) => {
          if (debug) {
              console.log("Cleaning up incoming directory", inputDir)
          }
          fs.readdir(inputDir, (err, files) => {
            if (err) {
              console.error("Failed to cleanup package directory", err)
            }
            var count = files.length;
            for (const file of files) {
              fs.unlink(path.join(inputDir, file), (err) => {
                if (err) {
                  console.error(`Failed to remove file ${file}`, err)
                }
                if (--count === 0) {
                    fs.rmdir(inputDir);
                }
              });
            }
          });
        }
        
        server.register(Basic, (err) => {
          server.auth.strategy('simple', 'basic', { validateFunc: auth.validate })
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
              const inputDir = `/data/incoming/${process.hrtime().join('-')}`
              const success = (response) => {
                cleanup(inputDir);
                reply({status: 'ok'})
              }
              const error = (response) => {
                console.error("Error Encountered")
                console.error(response)
                cleanup(inputDir);
                reply({status: 'error'})
              }
              if (debug) {
                console.log("Received request", request.path)
              }
              try {
                  fs.mkdir(inputDir, dirMode, function (err) {
                      if (err) {
                          console.error(`Failed to create temporary directory - ${err}`)
                          return
                      }
                      var file = fs.createWriteStream(`${inputDir}/${request.params.pkg}`)
                      payload.pipe(file)

                      file.on('finish', () => {
                        this.updateRepo(inputDir).then(success).catch(error)
                      })
                  }.bind(this))
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
  const userConfig = require('/data/conf/config.json')
  const updateServer = new UpdateServer(userConfig);
  updateServer.start();
} catch (e) {
  console.error(e);
}
