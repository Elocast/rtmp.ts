
describe('AMF0', () => {
  require('./amf0/index.ts');
});

describe('Auth', () => {
  require('./auth/index.ts');
});

describe('HTTP', () => {
  require('./http/index.ts');
});

describe('RTMP', () => {
  require('./rtmp/chunk.ts');
  require('./rtmp/handshake.ts');
  require('./rtmp/session.manager.ts');
  require('./rtmp/session.ts');
});
