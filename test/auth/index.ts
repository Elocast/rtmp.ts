import chai from 'chai';
import nock from 'nock';
import { EventEmitter } from 'events';

import AuthManager from '../../src/modules/Auth/manager';
import config from './config';

const mockRTMPSessionManager = {
  destroy: () => {}
};

const emitter = new EventEmitter();

const AuthInstance = new AuthManager(
  mockRTMPSessionManager,
  config,
  emitter
);

const authDetails = {
  success: {
    path: '/live/success',
    key: 'success'
  },
  fail: {
    path: '/live/fail',
    key: 'fail'
  }
};

describe('.postNewAttempt()', () => {
  before(() => {
    // success
    nock(`https://${config.auth.api_url}`)
      .post(
        '/stream/',
        body => body.key === authDetails.success.key
      )
      .reply(200, { data: '1' });

    // fail
    nock(`https://${config.auth.api_url}`)
      .post(
        '/stream/',
        body => body.key !== authDetails.success.key
      )
      .reply(401, {});
  });

  after(() => {
    const session = AuthInstance.sessions.get(authDetails.success.key);
    if (session) {
      clearTimeout(session.timer);
    }

    AuthInstance.sessions.delete(authDetails.success.key);
  });

  it('should fail', async () => {
    const resp = await AuthInstance.postNewStream(authDetails.fail.path);
    const session = AuthInstance.sessions.get(authDetails.fail.key);

    chai.assert.notExists(resp.success);
    chai.assert.notExists(session);
  });

  it('should suceed', async () => {
    const resp = await AuthInstance.postNewStream(authDetails.success.path);
    const session = AuthInstance.sessions.get(authDetails.success.key);

    chai.assert.equal(resp.success, true);
    chai.assert.exists(session);
    chai.assert.equal(session.connection.path, authDetails.success.path);
  });
});

describe('.onValidateLoop()', async () => {
  beforeEach(() => {
    AuthInstance.sessions.set(
      authDetails.success.key,
      {
        connection: {
          path: authDetails.success.path,
          args: '',
          sId: '1'
        },
        timer: null
      }
    );
  });

  after(() => {
    const session = AuthInstance.sessions.get(authDetails.success.key);
    if (session) {
      clearTimeout(session.timer);
    }

    AuthInstance.sessions.delete(authDetails.success.key);
  });

  it('should fail. Invalid streamkey', async () => {
    chai.assert.equal(AuthInstance.sessions.has(authDetails.success.key), true);
    nock(`https://${config.auth.api_url}`)
      .post('/stream/validate')
      .reply(403);

    await AuthInstance.onValidateLoop(authDetails.success.key);
    chai.assert.equal(AuthInstance.sessions.has(authDetails.success.key), false);
  });

  it('should fail. Stream not found', async () => {
    chai.assert.equal(AuthInstance.sessions.has(authDetails.success.key), true);
    nock(`https://${config.auth.api_url}`)
      .post('/stream/validate')
      .reply(404);

    await AuthInstance.onValidateLoop(authDetails.success.key);
    chai.assert.equal(AuthInstance.sessions.has(authDetails.success.key), false);
  });

  it('should succeed. Keep session open', async () => {
    chai.assert.equal(AuthInstance.sessions.has(authDetails.success.key), true);
    nock(`https://${config.auth.api_url}`)
      .post('/stream/validate')
      .reply(200, {
          sId: '1',
          status: 0,
          server: config.serverId,
      });

    await AuthInstance.onValidateLoop(authDetails.success.key);
    chai.assert.equal(AuthInstance.sessions.has(authDetails.success.key), true);
  });
});

describe('.postPauseStream()', () => {
  before(() => {
    nock(`https://${config.auth.api_url}`)
      .post(
        '/stream/done',
        body => body.key === authDetails.success.key
      )
      .reply(200, {});

    AuthInstance.sessions.set(
      authDetails.success.key,
      {
        connection: {
          path: authDetails.success.path,
          args: '',
          sId: '1'
        },
        timer: null
      }
    );
  });

  it('should skip. Session doesn\'t exist', async () => {
    chai.assert.equal(AuthInstance.sessions.has(authDetails.fail.key), false);

    await AuthInstance.postPauseStream(authDetails.fail.path);
    const session = AuthInstance.sessions.get(authDetails.fail.key);

    chai.assert.notExists(session);
  });

  it('should suceed', async () => {
    chai.assert.exists(AuthInstance.sessions.has(authDetails.success.key));

    await AuthInstance.postPauseStream(authDetails.success.path);
    const session = AuthInstance.sessions.get(authDetails.success.key);

    chai.assert.notExists(session);
  });
});

describe('.destroy()', () => {
  before(() => {
    AuthInstance.sessions.set(authDetails.success.key, {});
  });

  it('should fail', async () => {
    const resp = AuthInstance.destroy(authDetails.fail.path);

    chai.assert.equal(resp, false);
  });

  it('should suceed', async () => {
    const resp = AuthInstance.destroy(authDetails.success.path);

    chai.assert.equal(resp, true);
  });
});

describe('emitter', () => {
  before(() => {
    AuthInstance.up();
  });

  after(() => {
    const session = AuthInstance.sessions.get(authDetails.success.key);
    if (session) {
      clearTimeout(session.timer);
    }

    AuthInstance.sessions.delete(authDetails.success.key);
  });

  describe('onPublish', () => {
    after(() => {
      const session = AuthInstance.sessions.get(authDetails.success.key);
      if (session) {
        clearTimeout(session.timer);
      }

      AuthInstance.sessions.delete(authDetails.success.key);
    });

    it('should create a new session', () => {
      chai.assert.equal(AuthInstance.sessions.size, 0);
      emitter.emit('rtmp.client.publish.success', authDetails.success.path, '', { sId: 1 });

      const session = AuthInstance.sessions.get(authDetails.success.key);
      chai.assert.exists(session);
      chai.assert.equal(AuthInstance.sessions.size, 1);
    });

    it('should skip. (Duplicate)', () => {
      const session = AuthInstance.sessions.get(authDetails.success.key);
      chai.assert.exists(session);
      chai.assert.equal(AuthInstance.sessions.size, 1);

      emitter.emit('rtmp.client.publish.success', authDetails.success.path, '', { sId: 1 });

      chai.assert.equal(AuthInstance.sessions.size, 1);
    });
  });

  describe('onPublishDone', () => {
    before(() => {
      nock(`https://${config.auth.api_url}`)
        .post(
          '/stream/done',
          body => body.key === authDetails.success.key
        )
        .reply(200, {});

      AuthInstance.sessions.set(
        authDetails.success.key,
        {
          connection: {
            path: authDetails.success.path,
            args: '',
            sId: 1
          },
          timer: null
        }
      );
    });

    it('should skip. Session doesn\'t exist', () => {
      chai.assert.equal(AuthInstance.sessions.has(authDetails.fail.key), false);

      emitter.emit('rtmp.client.publish.done', authDetails.fail.path);
      const session = AuthInstance.sessions.get(authDetails.fail.key);

      chai.assert.notExists(session);
    });

    it('should succeed', () => {
      chai.assert.exists(AuthInstance.sessions.has(authDetails.success.key));

      emitter.emit('rtmp.client.publish.done', authDetails.success.path);

      // retry 5 times
      let retryCount = 0;
      let retryTimeout = null;

      const finalCheck = () => {
        retryCount += 1;

        try {
          const session = AuthInstance.sessions.get(authDetails.success.key);
          chai.assert.notExists(session);
        } catch (err) {
          if (retryCount < 5) {
            retryTimeout = setTimeout(finalCheck, 100);
          }
        }
      };

      finalCheck();
    });
  });
});
