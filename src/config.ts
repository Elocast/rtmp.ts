require('dotenv').config({ silent: true });

const config = {
  serverId: process.env.SERVER_ID || 'wawel',
  rtmp_port: process.env.RTMP_PORT || 1935,
  http_port: process.env.HTTP_PORT || 80,
  ffmpeg: process.env.FFMPEG_PATH || '/usr/local/bin/ffmpeg',
  shell: process.env.SHELL_PATH || '/bin/bash',
  output_path: process.env.OUTPUT_PATH || '/var/media',
  auth: {
    validate_interval: process.env.AUTH_VALIDATE_LOOP || 30,
    jwt_key: process.env.JWT_KEY,
    jwt_max_age: process.env.JWT_MAX_AGE || 60,
    api_url: process.env.API_URL
  },
  flow: {
    tcode: {
      tasks: [
        {
          name: 'source-mp4',
          // multi-channel support
          source: 'live',
          output_path: '{RTMP_OUTPUT_PATH}/{STREAM_DIR}/{SEGMENT_DIR}/source/',
          params: {
            pre: [
              ['-y'],
            ],
            mid: [
              ['-c:v', 'copy'],
              ['-c:a', 'copy'],
              // a fix to common bug in certain ffmpeg versions
              ['-max_muxing_queue_size', '9999'],
            ],
            out: [
              ['-f', 'mpeg', '{OUTPUT_PATH}/out.mp4']
            ]
          }
        },
        {
          name: 'hls',
          source: 'live',
          output_path: '{RTMP_OUTPUT_PATH}/{STREAM_DIR}/live/',
          params: {
            pre: [
              ['-y']
            ],
            mid: [
              ['-c:v', 'copy'],
              ['-c:a', 'copy'],
              // a fix to common bug in certain ffmpeg versions
              ['-max_muxing_queue_size', '9999'],
            ],
            out: [
              ['-f', 'hls', '{OUTPUT_PATH}/live.m3u8']
            ]
          }
        }
      ]
    },
    exec: {
      tasks: []
    }
  }
};

export default config;
