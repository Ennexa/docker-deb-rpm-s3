const bcrypt = require('bcryptjs')
const config = require('/data/conf/config.json')

module.exports.validate = (request, username, password, callback) => {
  const hash = config.auth_backends.predefined.users[username]

  if (!hash) {
    return callback(null, false)
  }

  bcrypt.compare(password, hash, (err, isValid) => {
    callback(err, isValid, {name: username})
  })
}

