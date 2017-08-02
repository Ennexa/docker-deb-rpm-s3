# docker-deb-rpm-s3

Docker image for maintaining a private APT/YUM repository in Amazon S3.

Most of the code was extracted from the [elastic/beats repository](https://github.com/elastic/beats/tree/master/dev-tools/packer/docker/deb-rpm-s3).

The image includes the following projects

- [deb-s3)(https://github.com/krobertson/deb-s3) for APT
- (rpm-s3)(https://github.com/crohr/rpm-s3) for YUM

### Usage

Place your `.deb` and `.rpm` packages under `./packages` directory. Copy your encrypted GPG key to `./conf` directory.

Run the container

```
docker run -it --rm \
  --env="PASS=<gpg key password>" \
  --volume `pwd`:/data \
  ennexa/deb-rpm-s3 \
  --bucket=<amazon s3 bucket> \
  --prefix=<bucket prefix> \
  --directory=/data/packages \
  --aws-access-key=<AWS_ACCESS_KEY> \
  --aws-secret-key=<$AWS_SECRET_KEY> \
  --gpg-key=/data/conf/gpgkey.asc \
  --verbose \
  "$@"
```

### REST server

A simple REST server is also included for pushing packages to the repository programatically.

#### Start server

Given below is a sample docker-compose configuration for the REST server

```
version: "3.3"
services:
    deb-rpm-s3:
        image: ennexa/deb-rpm-s3:server
        restart: always
        volumes:
            - "./conf:/data/conf"
        environment:
            - AWS_ACCESS_KEY=<aws access key>
            - AWS_SECRET_KEY=<aws secret key>
            - BUCKET=<bucket name>
            - PREFIX=<prefix for s3 bucket>
            - PASS=<gpg key password>
        ports:
            - 8000:8000

```

To start the server run

    docker-compose up

The GPG key for signing should be named as `gpgkey.asc` and placed under `./conf` directory. The `PASS` environment variable is not required if the key is unencrpted.

#### Upload package

First we need some `.deb`/`.rpm` packages for testing. Let us download the official packages for ModPagespeed.

    wget https://dl-ssl.google.com/dl/linux/direct/mod-pagespeed-beta_current_x86_64.rpm
    wget https://dl-ssl.google.com/dl/linux/direct/mod-pagespeed-beta_current_amd64.deb

Now to upload the files to our new repository, run

    curl -XPUT http://admin:secret@localhost:8000/mod-pagespeed-beta_current_x86_64.rpm --data-binary @mod-pagespeed-beta_current_x86_64.rpm
    curl -XPUT http://admin:secret@localhost:8000/mod-pagespeed-beta_current_amd64.deb --data-binary @mod-pagespeed-beta_current_amd64.deb

HTTP Basic auth is used to prevent unauthorized access to the REST server. The default username / password is `admin`/`secret`. To change it, create a file named `config.json` under `./conf` with the following content.

```
 {
    auth_backends: {
        'predefined': {
                users: {
                        admin: '$2a$10$iqJSHD.BGr0E2IxQwYgJmeP3NvhPrXAeLSaGCj6IR/XU5QtjVu5Tm',
                        bob: '<encrypted password hash>'
                }
        }
    }
}
```

You can use an online service like https://bcrypt-generator.com/ for generating the hash.


#### Installing packages from the repository

You can install the packages by using public url of your S3 bucket.

