#!/bin/bash
set -e

# Script directory:
SDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

usage() {
cat << EOF
  Usage: $(basename $0) [-vh] [-d=directory] [-b=bucket] [-p=prefix]
    [--access-key-id=aws id] [--secret-key-id=aws secret]

  Description: Sign packages and publish them to APT and YUM repositories
    hosted from an S3 bucket. When publishing, the repository metadata is
    also signed to prevent tampering.

    You will be prompted once for the GPG signing key's password. If the
    GPG_PASSPHRASE environment variable is set then that value will be used and you
    will not be prompted.

  Options:
    --aws-access-key=AWS_ACCESS_KEY_ID  Required. AWS access key. Alternatively,
                                     AWS_ACCESS_KEY_ID may be set as an environment
                                     variable.

    --aws-secret-key=AWS_SECRET_ACCESS_KEY  Required. AWS secret key. Alternatively,
                                     AWS_SECRET_ACCESS_KEY may be set as an environment
                                     variable.

    -b=BUCKET | --bucket=BUCKET      Required. The S3 bucket in which to publish.

    -d=DIR | --directory=DIR         Required. Directory to recursively search
                                     for .rpm and .deb files.

    --visibility=VISIBILITY          Optional. The access policy for the uploaded files. Can be public, private, or authenticated.
                                     Default: public

    -p=PREFIX | --prefix=PREFIX      Optional. Path to prefix to all published
                                     repositories.

    -g=GPG_KEY | --gpg-key=GPG_KEY   Optional. Path to GPG key file to import.

    -k=GPG_KEY_ID | --gpg-key-id=GPG_KEY_ID   Optional. Default key id.

    -o=ORIGIN | --origin=ORIGIN      Optional. Origin to use in APT repo metadata.

    -v | --verbose                   Optional. Enable verbose logging to stderr.
    
    -h | --help                      Optional. Print this usage information.
EOF
}

# Write a debug message to stderr.
debug()
{
  if [ "$VERBOSE" == "true" ]; then
    echo "DEBUG: $1" >&2
  fi
}

# Write and error message to stderr.
err()
{
  echo "ERROR: $1" >&2
}

# Parse command line arguments.
parseArgs() {
  for i in "$@"
  do
  case $i in
    --aws-access-key=*)
      AWS_ACCESS_KEY_ID="${i#*=}"
      shift
      ;;
    --aws-secret-key=*)
      AWS_SECRET_ACCESS_KEY="${i#*=}"
      shift
      ;;
    -b=*|--bucket=*)
      BUCKET="${i#*=}"
      shift
      ;;
    -d=*|--directory=*)
      DIRECTORY="${i#*=}"
      shift
      ;;
    -g=*|--gpg-key=*)
      GPG_KEY="${i#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 1
      ;;
    -o=*|--origin=*)
      ORIGIN="${i#*=}"
      shift
      ;;
    --visibility=*)
      VISIBILITY="${i#*=}"
      shift
      ;;
    -p=*|--prefix=*)
      PREFIX="${i#*=}"
      shift
      ;;
    -k=*|--key=*)
      GPG_KEY_ID="${i#*=}"
      shift
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    *)
      echo "Invalid argument: $i"
      usage
      exit 1
      ;;
  esac
  done

  if [ -z "$BUCKET" ]; then
    err "-b=BUCKET or --bucket=BUCKET is required."
    exit 1
  fi

  if [ -z "$DIRECTORY" ]; then
    err "-d=DIRECTORY or --directory=DIRECTORY is required."
    exit 1
  fi
  
  if [ ! -e "$DIRECTORY" ]; then
    err "Directory $DIRECTORY does not exists."
    exit 1
  fi

  # if [ -z "$PREFIX" ]; then
  #   err "-p=PREFIX or --prefix=PREFIX is required."
  #   exit 1
  # fi

  if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    err "--access-key-id=AWS_ACCESS_KEY_ID is required."
    exit 1
  fi

  if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    err "--secret-access-key-id=AWS_SECRET_ACCESS_KEY is required."
    exit 1
  fi

  if [ -z "$PREFIX" ]; then
    BASE_PATH=""
  else
    BASE_PATH="${PREFIX}/"
  fi

  AWS_REGION=${AWS_REGION:-us-east-1}
  VISIBILITY_DEB_S3=${VISIBILITY:-public}
  
  if [ "$VISIBILITY" == "public" ]; then
      VISIBILITY_RPM_S3=public-read
  else
      VISIBILITY_RPM_S3=$VISIBILITY
  fi
  
  VERBOSE_DEB_S3="--quiet"
  VERBOSE_RPM_S3="-v"
  
  if [ "$VERBOSE" == "true" ]; then
    VERBOSE_DEB_S3="--no-quiet"
    VERBOSE_RPM_S3="-vv"
  fi
  
  if [ -z "$GPG_KEY_ID" ]; then
      GPG_KEY_ID=""
  fi

  export BUCKET
  export ORIGIN 
  export BASE_PATH
  export AWS_REGION
  export AWS_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY
  export VISIBILITY_DEB_S3
  export VISIBILITY_RPM_S3
  export VERBOSE_DEB_S3
  export VERBOSE_RPM_S3
  export GPG_KEY_ID

  env
  
}

importGpg() {
  if [ ! -z "$GPG_KEY" ]; then
    if [ ! -f "$GPG_KEY" ]; then
      err "GPG key file $GPG_KEY does not exists."
      exit 1
    fi

    debug "Importing GPG key $GPG_KEY"
    expect $SDIR/gpg-import.expect "$GPG_KEY"
  else
    debug "Not importing a GPG key because --gpg-key not specified."
  fi
}

getPassword() {
  if [ -z "$GPG_PASSPHRASE" ]; then
    echo -n "Enter GPG pass phrase: "
    read -s GPG_PASSPHRASE
  fi

  export GPG_PASSPHRASE
}

signDebianPackages() {
  debug "Entering signDebianPackages"
  find $DIRECTORY -name '*.deb' | xargs -r -I{} -n1 $SDIR/deb-sign {} "${GPG_KEY_ID}"
  debug "Exiting signDebianPackages"
}

signRpmPackages() {
  debug "Entering signRpmPackages"
  find $DIRECTORY -name '*.rpm' | xargs -r -I{} -n1 $SDIR/rpm-sign {} "${GPG_KEY_ID}"
  debug "Exiting signRpmPackages"
}

publishToAptRepo() {
  debug "Entering publishToAptRepo"

  # Verify the repository and credentials before continuing.
  deb-s3 verify --bucket "$BUCKET" --prefix "${BASE_PATH}apt"

  for arch in i386 amd64
  do
    debug "Publishing $arch .deb packages..."
    export arch

    for deb in $(find "$DIRECTORY" -name "*${arch}.deb")
    do
      expect $SDIR/deb-s3.expect "$deb"
    done
  done
}

publishToYumRepo() {
  debug "Entering publishToYumRepo"

  for arch in i686 x86_64
  do
    debug "Publishing $arch .rpm packages..."
    export arch

    for rpm in $(find "$DIRECTORY" -name "*${arch}.rpm")
    do
      expect $SDIR/rpm-s3.expect "$rpm"
    done
  done
}

main() {
  parseArgs $*
  importGpg
  getPassword
  signDebianPackages
  signRpmPackages
  publishToAptRepo
  publishToYumRepo
  debug "Success"
}

main $*
