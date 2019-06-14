'use strict';
const config = require('./config.json');
const bcrypt = require('bcryptjs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
// const bucketName = config.stage + '-' + config.endpoint;
const bucketName = process.env.BUCKET_NAME;

function validate(username, password) {
    const passwordHash = config.auth_backends.predefined.users[username];
    if (!passwordHash) {
       return Promise.resolve(false);
    }
    return bcrypt.compare(password, passwordHash);
};

function generatePolicy(principalId, effect, resource) {
    const authResponse = {
        principalId: principalId
    };
    
    if (effect && resource) {
        authResponse.policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource
                },
                {
                    Effect: effect,
                    Action: [
                        "s3:ListBucket",
                        "s3:GetBucketAcl"
                    ],
                    Resource: `arn:aws:s3:::${bucketName}`
                },
                {
                    Effect: effect,
                    Action: [
                        "s3:Get*",
                        "s3:List*"
                    ],
                    Resource: `arn:aws:s3:::${bucketName}/*`
                }
            ]
        };
    }
    return authResponse;
};

function generateIndex(prefix, files, folders) {
    let filesTemplate = files.map((item) => `<li class="file"><a href="${prefix}${item}">${item}</a></li>`).join("\n");
    let foldersTemplate = folders.map((item) => `<li class="folder"><a href="?prefix=${prefix}${item}">${item}</a></li>`).join("\n");

    return `
<html>
<head>
    <title>${prefix}</title>
<style>
html {
  font-size: 16px;
}

html, * {
  font-family: -apple-system, BlinkMacSystemFont,"Segoe UI","Roboto", "Droid Sans","Helvetica Neue", Helvetica, Arial, sans-serif;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

* {
  font-size: 1rem;
}

body {
  margin: 0;
  color: #212121;
  background: #f8f8f8;
}
ol, ul {
  margin: 0.5rem;
  padding-left: 1rem;
}
a {
  color: #0277bd;
  text-decoration: underline;
  opacity: 1;
  transition: opacity 0.3s;
}

a:visited {
  color: #01579b;
}

a:hover, a:focus {
  opacity: 0.75;
}

li {
  list-style-type: none;
  padding: 0 10px;
  margin: 5px 0;
}
.folder {
  border-left: 5px #01579b solid;
}
.file {
  border-left: 5px #eee solid;
}

</style>
</head>
<body>
<ul>
${foldersTemplate}
${filesTemplate}
</ul>
</body>
</html>`
}

module.exports.index = function (event, context, callback) {
    const input = event.queryStringParameters || {};
    const prefix = input.prefix || '';

    const params = { 
        Bucket: bucketName,
        Delimiter: '/',
        Prefix: prefix
    }

    if (config.index === false) {
        callback(null, {
            statusCode: 404,
            body: 'Not found',
            headers: {
                'Content-Type': 'text/plain'
            }
        });
        return
    }

    s3.listObjects(params, function (err, data) {
        if (err) throw err;
        const len = prefix.length;
        const files = data.Contents.map((item) => item.Key.substr(len));
        const folders = data.CommonPrefixes.map((item) => item.Prefix.substr(len))
        callback(null, {
            statusCode: 200,
            body: generateIndex(prefix, files, folders),
            headers: {
                'Content-Type': 'text/html'
            }
        });
    });
}
module.exports.auth = function (event, context, callback) {
    const token = event.authorizationToken.split(/\s+/).pop() || '';
    const auth = new Buffer(token, 'base64').toString();
    const parts = auth.split(/:/);
    const username = parts[0] || '';
    const password = parts[1] || '';
    
    if (token) {
        validate(username, password).then((isValid) => {
            callback(null, generatePolicy('user', isValid ? 'Allow' : 'Deny', event.methodArn));
        }).catch((e) => {
            callback(null, generatePolicy('user', 'Deny', event.methodArn));
        });
    } else {
        callback('Unauthorized');
    }
};
