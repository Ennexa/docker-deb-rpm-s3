#!/bin/bash
set -e

#
# Build script for the deb-rpm-s3 docker container.
#

cd "$(dirname "$0")"

docker build -t ennexa/deb-rpm-s3 ./cli
docker tag ennexa/deb-rpm-s3 ennexa/deb-rpm-s3:cli

docker build -t ennexa/deb-rpm-s3:server ./server
