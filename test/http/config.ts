require('dotenv').config({
  silent: true,
  path: `${require('path').resolve('./')}/.env.development`
});

const config = {
  serverId: process.env.SERVER_ID || 'wawel',
  http_port: process.env.HTTP_PORT || 80,
  shell: process.env.SHELL_PATH || '/bin/bash',
  output_path: process.env.OUTPUT_PATH || '/var/media',
  auth: {
    validate_interval: 30,
    jwt_key: process.env.JWT_KEY,
    jwt_max_age: process.env.JWT_MAX_AGE || 60,
    api_url: process.env.API_URL
  }
};

export default config;
