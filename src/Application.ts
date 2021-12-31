import GlobalEmitter from './modules/GlobalEmitter';
import RTMP from './modules/RTMP/server';
import TCODE from './modules/TCODE/manager';
import HTTP from './modules/HTTP/server';
import Auth from './modules/Auth/manager';

import PublishSuccessResponse from './modules/Auth/interfaces/PublishSuccessResponse';

export class Application {
  config: any;
  emitter: GlobalEmitter;

  rtmp: RTMP;
  tcode: TCODE;
  auth: Auth;
  http: HTTP;

  constructor(config: any) {
    this.config = config;

    this.emitter = new GlobalEmitter();
    this.rtmp = new RTMP(this.config, this.emitter, {
      publish: this.onPublishAttempt.bind(this)
    });

    this.auth = new Auth(this.rtmp.sessions, this.config, this.emitter);
    this.tcode = new TCODE(this.config, this.emitter);
    this.http = new HTTP(this.config, this.emitter);
  }

  async onPublishAttempt(path: string): Promise<PublishSuccessResponse|{}> {
    return await this.auth.postNewStream(path);
  }

  onRTMPPublish(path: string, args: string): void {
    if (!this.auth) {
      this.emitter.emit('rtmp.client.publish.authorized', path, args, path.replace(/\//g, '-'));
    }

    const key = path.split('/')[2];

    const authSession = this.auth.sessions.get(key);
    if (!authSession || !authSession.connection.sId) {
      return;
    }

    this.emitter.emit('rtmp.client.publish.authorized', path, args, authSession.connection.sId);
  }

  handleEvents() {
    this.emitter.on('rtmp.client.publish.success', this.onRTMPPublish.bind(this));
  }

  up(): void {
    this.rtmp.up();
    this.auth.up();
    this.tcode.up();

    this.http.init();
    this.http.up();

    this.handleEvents();
  }

  down(): void {
    this.rtmp.down();
    this.tcode.down();

    this.http.down();
  }
}

export default Application;
