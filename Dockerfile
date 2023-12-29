FROM node:20-slim AS base

# update
RUN apt-get update -yq && \
    apt-get upgrade -yq && \
    apt-get install -yq curl xz-utils

# install ffmpeg
RUN curl -O https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz; \
    tar xvf ffmpeg-git-amd64-static.tar.xz; \
    mv ffmpeg-*/ffmpeg ffmpeg-*/ffprobe /usr/local/bin/

# copy all local files
COPY . /app
WORKDIR /app

RUN npm install

RUN npm run test

CMD npm start
