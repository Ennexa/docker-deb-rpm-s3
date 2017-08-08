FROM ennexa/deb-rpm-s3

RUN curl -sL https://deb.nodesource.com/setup_6.x | bash - && \
    apt-get install -y nodejs

VOLUME /data/incoming
VOLUME /data/conf

ADD app/package.json /app/package.json
RUN cd /app && npm install

COPY app/* /app/

WORKDIR "/app"
ENTRYPOINT ["nodejs", "index.js"]
