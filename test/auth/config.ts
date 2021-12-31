require('dotenv').config({
  silent: true,
  path: `${require('path').resolve('./')}/.env.development`
});

const config = {
  serverId: process.env.SERVER_ID || 'wawel',
  auth: {
    validate_interval: 30,
    jwt_key: process.env.JWT_KEY || 'abc',
    jwt_max_age: process.env.JWT_MAX_AGE || 60,
    api_url: process.env.API_URL || 'api.elocast.com'
  }
};

export default config;
