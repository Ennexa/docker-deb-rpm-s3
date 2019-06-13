const Bcrypt = require('bcryptjs')
const config = require(process.env.CONFIG_FILE || '/data/conf/config.json')

module.exports.validate = async (request, username, password, h) => {
  if (config.debug) {
    console.log(`Validating ${username}`)
  }

  const hash = config.auth_backends.predefined.users[username];
  if (!hash) {
    return { credentials: null, isValid: false };
  }

  const isValid = await Bcrypt.compare(password, hash);
  const credentials = { name: username };

  return { isValid, credentials };
};


