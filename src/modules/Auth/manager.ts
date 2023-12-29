import axios from 'axios';

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

  private async buildHeaders() {
    const headers: Record<string, string> = {};
    headers['x-server-codename'] = this.config.serverId;

    if (this.config.jwt_key) {
      const token = await JWT.sign(this.config.auth, { serverId: this.config.serverId });
      if (token) {
        headers['X-RTMP-Auth'] = token;
      }
    }

    return headers;
  }

  async postNewStream(path: string): Promise<PublishSuccessResponse|{}> {
    try {
      const key = path.split('/')[2];
      const headers = await this.buildHeaders();

      const resp = await axios({
        url: `https://${this.config.auth.api_url}/stream/`,
        method: 'post',
        data: { key },
        headers,
      });

      if (resp.data.data) {
        const sessionObj = {
          connection: {
            path,
            args: '',
            sId: resp.data,
          },
          timer: setTimeout(this.onValidateLoop.bind(this, key), this.config.auth.validate_interval * 1000)
        };

        this.sessions.set(key, sessionObj);

        return {
          success: true,
          data: resp.data,
        };
      }
    } catch (err: unknown) {
      console.log(`[AUTH][postNewStream] request failed`, err);
    }

    return {};
  }

  async postPauseStream(path: string): Promise<void> {
    const key = path.split('/')[2];

    const session = this.sessions.get(key);
    if (!session) {
      // cant find stream id
      return;
    }

    clearTimeout(session.timer);

    try {
      const headers = await this.buildHeaders();

      await axios({
        method: 'post',
        url: `https://${this.config.auth.api_url}/stream/done`,
        data: { key },
        headers,
      });
    } catch(err: unknown) {
      console.log('[AUTH][postPauseStream] request failed', err);
    }

    this.sessions.delete(key);
  }

  async onValidateLoop(key: string): Promise<void> {
    const session = this.sessions.get(key);

    try {
      const headers = await this.buildHeaders();

      await axios({
        method: 'post',
        url: `https://${this.config.auth.api_url}/stream/validate`,
        data: { key },
        headers,
      });

      const sessionObj = {
        connection: {
          path: session?.connection?.path || `/live/${key}`,
          args: session?.connection?.args || '',
          sId: session?.connection?.sId || ''
        },
        timer: setTimeout(this.onValidateLoop.bind(this, key), this.config.auth.validate_interval * 1000)
      };

      this.sessions.set(key, sessionObj);
    } catch(err: unknown) {
      console.log(`[AUTH][onValidateLoop] request failed`, err);

      if (session) {
        this.RTMPSessionManager.destroy(session.connection.path);
        this.sessions.delete(key);
      }
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
