#!/bin/bash

source <(/usr/bin/gpg-agent --daemon --allow-preset-passphrase \
	--write-env-file /etc/thing/run/.gpg-agent-info -- \
)

echo $(tty)

if [[ ! -z "${GPG_KEY_ID}" ]] && [[ ! -z "${GPG_PASSPHRASE}" ]]; then
	echo $GPG_PASSPHRASE | /usr/lib/gnupg2/gpg-preset-passphrase -v -c $GPG_KEY_ID
	# gpg --import --allow-secret-key-import $GPG_KEY_FILE
	/gpg-import.expect "${GPG_KEY_FILE}"
	echo $GPG_PASSPHRASE | /usr/lib/gnupg2/gpg-preset-passphrase -v -c $GPG_KEY_ID
fi

nodejs index.js
# /usr/lib/gnupg/gpg-preset-passphrase --preset