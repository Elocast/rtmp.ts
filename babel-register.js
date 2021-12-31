const config = require('./babel.config.json');

require('@babel/register')({
  cache: false,
  extensions: ['.ts'],
  ...config
});
