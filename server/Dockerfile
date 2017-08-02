FROM ennexa/deb-rpm-s3

RUN curl -sL https://deb.nodesource.com/setup_6.x | bash - && \
    apt-get install -y nodejs

VOLUME /data/incoming
VOLUME /data/conf

COPY app /app

RUN cd /app && npm install

WORKDIR "/app"
ENTRYPOINT ["nodejs", "server.js"]
