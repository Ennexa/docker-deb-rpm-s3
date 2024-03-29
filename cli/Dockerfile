# Dockerfile for building an image that contains all of the necessary
# dependencies for signing deb/rpm packages and publishing APT and YUM
# repositories to Amazon S3.
FROM debian:stretch-slim

RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    rubygems rpm curl dpkg-sig expect yum git \
    python-deltarpm python-pip python-setuptools

# Install deb-s3
#RUN gem install deb-s3
RUN curl -sLO https://github.com/deb-s3/deb-s3/releases/download/0.11.3/deb-s3-0.11.3.gem && \
    gem install deb-s3-0.11.3.gem && \
    rm -f deb-s3-0.11.3.gem

# Install rpm-s3
RUN pip install wheel && pip install sa-rpm-s3

# ENV PATH /usr/local/rpm-s3/bin:$PATH
ADD rpmmacros /root/.rpmmacros

# Add the scripts that are executed by within the container.
ADD deb-sign.expect /deb-sign
ADD rpm-sign.expect /rpm-sign
ADD deb-s3.expect /
ADD rpm-s3.expect /
ADD gpg-import.expect /
ADD publish-package-repositories.sh /

# Execute the publish-package-repositories.sh when the container
# is run.
ENTRYPOINT ["/publish-package-repositories.sh"]

CMD ["--help"]
