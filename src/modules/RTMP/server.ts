import * as net from 'net';

import RTMPSessionManager from './SessionManager';

export class RTMPServer {
  config: any;
  emitter: any; // either that, or GlobalEmitter
  server: net.Server;
  sessions: RTMPSessionManager;

  constructor(config: any, emitter: any, authorizer: any) {
    this.config = config;
    this.emitter = emitter;

    this.server = net.createServer((socket) => this.onConnection(socket));
    this.sessions = new RTMPSessionManager(this.server, this.config, this.emitter, authorizer);
  }

  onConnection(socket: any): void {
    this.sessions.onConnection(socket);
  }

  up(): void {
    this.emitter.emit('rtmp.server.up');
    this.server.listen(this.config.rtmp_port);
  }

  down(): void {
    this.server.close();
  }
}

export default RTMPServer;
