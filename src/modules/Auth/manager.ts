import request from 'request-promise-native';

import JWT from '../../support/jwt';

import SessionType from './interfaces/Session';
import SessionManagerType from './interfaces/SessionManager';
import PublishSuccessResponse from './interfaces/PublishSuccessResponse';

export class Auth {
  RTMPSessionManager: SessionManagerType;

  config: any;
  emitter: any;

  sessions: Map<string, SessionType>; // stores timeouts

  constructor(
    RTMPSessionManager: SessionManagerType,
    config: any,
    emitter: any
  ) {
    this.RTMPSessionManager = RTMPSessionManager;
    this.config = config;
    this.emitter = emitter;

    this.sessions = new Map();
  }

  async postNewStream(path: string): Promise<PublishSuccessResponse|{}> {
    const key = path.split('/')[2];
    //const token = await JWT.sign(this.config.auth, { serverId: this.config.serverId });

    const resp = await request.post({
      url: `https://${this.config.auth.api_url}/stream/`,
      headers: {
        //'X-RTMP-Auth': token,
        'x-server-codename': this.config.serverId
      },
      body: { key },
      json: true
    })
      .then((res: any) => ({ success: true, data: res }))
      .catch(() => Promise.resolve({}));

    if (resp.success) {
      const sessionObj = {
        connection: {
          path,
          args: '',
          sId: resp.data,
        },
        timer: setTimeout(this.onValidateLoop.bind(this, key), this.config.auth.validate_interval * 1000)
      };

      this.sessions.set(key, sessionObj);
    }

    return resp;
  }

  async postPauseStream(path: string): Promise<void> {
    const key = path.split('/')[2];

    const session = this.sessions.get(key);
    if (!session) {
      // cant find stream id
      return;
    }

    clearTimeout(session.timer);

    //const token = await JWT.sign(this.config.auth, { serverId: this.config.serverId });
    await request.post({
      url: `https://${this.config.auth.api_url}/stream/done`,
      headers: {
        //'X-RTMP-Auth': token
        'x-server-codename': this.config.serverId
      },
      body: { key },
      json: true
    })
      // prevents unhandled promise error/crash
      .catch(() => Promise.resolve({}));

    this.sessions.delete(key);
  }

  async onValidateLoop(key: string): Promise<void> {
    //const token = await JWT.sign(this.config.auth, { serverId: this.config.serverId });

    const resp = await request.post({
      url: `https://${this.config.auth.api_url}/stream/validate`,
      headers: {
        //'X-RTMP-Auth': token,
        'x-server-codename': this.config.serverId
      },
      body: { key },
      json: true
    })
      .then((res: any) => ({ success: true }))
      .catch(() => Promise.resolve({}));

    const session = this.sessions.get(key);

    if (!resp.success) {
      if (session) {
        this.RTMPSessionManager.destroy(session.connection.path);
        this.sessions.delete(key);
        return;
      }
    } else {
      const sessionObj = {
        connection: {
          path: session?.connection?.path || `/live/${key}`,
          args: session?.connection?.args || '',
          sId: session?.connection?.sId
        },
        timer: setTimeout(this.onValidateLoop.bind(this, key), this.config.auth.validate_interval * 1000)
      };

      this.sessions.set(key, sessionObj);
    }
  }

  onPublish(path: string, args: string, api: { sId: string }): void {
    const key = path.split('/')[2];
    const session = this.sessions.get(key);

    if (!session) {
      const sessionObj = {
        connection: {
          path, args,
          sId: api.sId,
        },
        timer: setTimeout(this.onValidateLoop.bind(this, key), this.config.auth.validate_interval * 1000)
      };

      this.sessions.set(key, sessionObj);
    }
  }

  onPublishDone(path: string): void {
    this.postPauseStream(path);
    return;
  }

  destroy(path: string): boolean {
    const key = path.split('/')[2];
    const session = this.sessions.get(key);

    if (!session) {
      return false;
    }

    this.sessions.delete(key);
    return true;
  }

  up() {
    this.emitter.on('rtmp.client.publish.success', this.onPublish.bind(this));
    this.emitter.on('rtmp.client.publish.done', this.onPublishDone.bind(this));
  }
}

export default Auth;
