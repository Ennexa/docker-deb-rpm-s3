'use strict';

const Bcrypt = require('bcrypt');
const Hapi = require('hapi');
const Basic = require('hapi-auth-basic');
const spawn = require( 'child_process' ).spawn;

const fs = require('fs');

var config = {
	auth_backends: {
		'predefined': {
			users: {
				admin: '$2a$10$iqJSHD.BGr0E2IxQwYgJmeP3NvhPrXAeLSaGCj6IR/XU5QtjVu5Tm'
			}
		},
		// 'ldap': {
		//
		// }
	},
	host: '0.0.0.0',
	port: 8000,
	args: {
		"directory": "/data/incoming/",
		"gpg-key": "/data/conf/gpgkey.asc",
		"verbose": true
	},
	debug: false
};


try {
	userConfig = require('/data/conf/config.json');
	for (var i in userConfig) {
		config[i] = userConfig[i];
	}
} catch(e) {}

// Create a server with a host and port
const server = new Hapi.Server();
server.connection({ 
	host: config.host, 
	port: config.port
});


const validate = (request, reqUsername, reqPassword, callback) => {
	const userPassword = config.auth_backends.predefined.users[reqUsername];
	if (!userPassword) {
		return callback(null, false);
	}
	
	Bcrypt.compare(reqPassword, userPassword, (err, isValid) => {
		callback(err, isValid, {name: reqUsername});
	});
};

function updateRepo() {
	return new Promise((resolve, reject) => {
		const args = [];
		let val, type, stdout = '', stderr = '';

		['bucket', 'directory', 'prefix', 'gpg-key', 'aws-access-key', 'aws-secret-key', "verbose"].forEach((opt) => {
			val = config.args[opt] || process.env[opt.replace(/-/g, '_').toUpperCase()];
			type = typeof val;
			
			if (type === "undefined") {
				throw new Error(`Option '${opt}' should be specified either via config.json or environment variable`);
			} else if (type === "boolean") {
				val && args.push(`--${opt}`);
			} else {
				args.push(`--${opt}=${val}`);
			}
		});
		
		const command = spawn('/publish-package-repositories.sh', args);
		if (config.debug) {
			console.log("Spawning /publish-package-repositories.sh with args ", args);
		}
		command.stdout.on('data', (data) => {
			stdout += data.toString();
			if (config.debug) {
				console.log(stdout);
			}
		});
		command.stderr.on('data', (data) => {
			stderr += data.toString();
			if (config.debug) {
				console.log(stderr);
			}
		});
		
		command.on('close', (code) => {
			if (code) {
				if (config.debug) {
					console.log(`Command failed with code ${args}`);
				}
				reject(stderr);
			} else {
				resolve(stdout);
			}
		});
	});
}

server.register(require('hapi-auth-basic'), (err) => {
	server.auth.strategy('simple', 'basic', { validateFunc: validate });
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
			const payload = request.payload;
			const success = (response) => {
				reply({status: 'ok', response: response})
			};
			const error = (response) => {
				console.log(response);
				reply({status: 'error', response: response})
			}
			var file = fs.createWriteStream(`/data/incoming/${request.params.pkg}`);
			payload.pipe(file);
			
			file.on('finish', () => {
				updateRepo().then(success).catch(error);
			});
		}
	});
});

// Start the server
server.start((err) => {
	if (err) {
		throw err;
	}
	console.log('Server running at:', server.info.uri);
});
