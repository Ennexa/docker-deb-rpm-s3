FROM ennexa/deb-rpm-s3

RUN curl -sL https://deb.nodesource.com/setup_6.x | bash - && \
    apt-get install -y nodejs

RUN useradd -ms /bin/bash -d /home/user user

COPY app/* /app/
RUN mkdir -p /data/conf /data/incoming && \
    cp /root/.rpmmacros /data/conf/rpmmacros && \
    ln -s /data/conf/rpmmacros /home/user/.rpmmacros && \
    chown -R user:user /app /data /home/user/.rpmmacros

USER user

RUN cd /app && npm install

VOLUME /data/incoming
VOLUME /data/conf

WORKDIR "/app"
ENTRYPOINT ["nodejs", "index.js"]
