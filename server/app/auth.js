const Bcrypt = require('bcrypt')
const config = require('/data/conf/config.json')

module.exports.validate = (request, reqUsername, reqPassword, callback) => {
  const userPassword = config.auth_backends.predefined.users[reqUsername]
  if (!userPassword) {
    return callback(null, false)
  }

  Bcrypt.compare(reqPassword, userPassword, (err, isValid) => {
    callback(err, isValid, {name: reqUsername})
  })
}
