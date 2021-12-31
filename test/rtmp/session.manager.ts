import chai from 'chai';

import SessionManager from '../../src/modules/RTMP/SessionManager';

const managerInstance = new SessionManager(null, null, null, null);

const mockSocket = {
  on: () => {},
  destroy: () => {}
};

const authDetails = {
  fail: {
    path: '/live/abc',
    key: 'abc'
  },
  success: {
    path: '/live/test',
    key: ''
  }
};

describe('Session Manager', () => {
  describe('.onConnection()', () => {
    it('should save the session', () => {
      chai.assert.equal(managerInstance.sessions.size, 0);

      managerInstance.onConnection(mockSocket);
      authDetails.success.key = managerInstance.sessions.keys().next().value;

      chai.assert.equal(managerInstance.sessions.size, 1);
      chai.assert.notEqual(authDetails.success.key, undefined);
    });
  });

  describe('.setPublisher()', () => {
    after(() => {
      // mock connection details, needed for .destroy() method
      const session = managerInstance.sessions.get(authDetails.success.key);

      session.connection.publish = {
        streamId: Date.now(),
        path: authDetails.success.path,
        orgPath: authDetails.success.path,
        active: true
      };
    });

    it('should fail. Session doesnt exist', () => {
      const prePublisherSize = managerInstance.publishers.size;
      const resp: boolean = managerInstance.setPublisher(authDetails.fail.key, authDetails.fail.path);

      chai.assert.equal(managerInstance.publishers.size, prePublisherSize);
      chai.assert.equal(resp, false);
    });

    it('should succeed', () => {
      const prePublisherSize = managerInstance.publishers.size;
      const resp: boolean = managerInstance.setPublisher(authDetails.success.key, authDetails.success.path);

      chai.assert.notEqual(managerInstance.publishers.size, prePublisherSize);
      chai.assert.equal(managerInstance.publishers.size, prePublisherSize + 1);
      chai.assert.equal(resp, true);
    });

    it('should fail. Path is already taken', () => {
      const prePublisherSize = managerInstance.publishers.size;
      const resp: boolean = managerInstance.setPublisher(authDetails.success.key, authDetails.success.path);

      chai.assert.equal(managerInstance.publishers.size, prePublisherSize);
      chai.assert.equal(resp, false);
    });
  });

  describe('.setSubscriber()', () => {
    it('should fail. Session doesnt exist', () => {
      const preSubscriberSize = managerInstance.subscribers.size;
      const resp: boolean = managerInstance.setSubscriber(authDetails.fail.key, authDetails.fail.path);

      chai.assert.equal(managerInstance.subscribers.size, preSubscriberSize);
      chai.assert.equal(resp, false);
    });

    it('should succeed', () => {
      const preSubscriberSize = managerInstance.subscribers.size;
      const resp: boolean = managerInstance.setSubscriber(authDetails.success.key, authDetails.success.path);

      chai.assert.notEqual(managerInstance.subscribers.size, preSubscriberSize);
      chai.assert.equal(managerInstance.subscribers.size, preSubscriberSize + 1);
      chai.assert.equal(resp, true);
    });

    it('should fail. You can only sub to 1 channel at once', () => {
      const preSubscriberSize = managerInstance.subscribers.size;
      const resp: boolean = managerInstance.setSubscriber(authDetails.success.key, authDetails.success.path);

      chai.assert.equal(managerInstance.subscribers.size, preSubscriberSize);
      chai.assert.equal(resp, false);
    });
  });

  describe('.destroy()', () => {
    it('should fail. Session doesnt exist', () => {
      const resp: boolean = managerInstance.destroy(authDetails.fail.key);
      chai.assert.equal(resp, false);
    });

    it('should suceed', () => {
      const preSessionSize = managerInstance.sessions.size;
      const prePublisherSize = managerInstance.publishers.size;
      const preSubscriberSize = managerInstance.subscribers.size;

      const resp: boolean = managerInstance.destroy(authDetails.success.key);

      chai.assert.notEqual(managerInstance.sessions.size, preSessionSize);
      chai.assert.notEqual(managerInstance.publishers.size, prePublisherSize);
      chai.assert.notEqual(managerInstance.subscribers.size, preSubscriberSize);
      chai.assert.equal(resp, true);
    });
  });
});
