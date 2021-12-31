import { Server as ServerType } from 'net';
import { v4 as uuidv4 } from 'uuid';

import RTMPSession from './session';

export class RTMPSessionManager {
  server: ServerType;
  config: any
  emitter: any;
  authorizer: {
    publish: any;
  };

  sessions: Map<string, RTMPSession> = new Map();

  // { path: publisherId }
  publishers: Map<string, string> = new Map();
  // { path: subscriberId[] }
  subscribers: Map<string, string[]> = new Map();

  constructor(
    server: ServerType,
    config: any,
    emitter: any,
    authorizer: any
  ) {
    this.server = server;
    this.config = config;
    this.emitter = emitter;
    this.authorizer = authorizer;
  }

  onConnection(socket: any): void {
    const key = uuidv4();

    const session = new RTMPSession(key, this.config, this.emitter, socket, this.authorizer, this);
    session.up();

    this.sessions.set(key, session);
  }

  setPublisher(key: string, path: string): boolean {
    if (!this.sessions.has(key)) {
      // session doesnt exist
      return false;
    }

    if (this.publishers.has(path)) {
      // path is already busy
      return false;
    }

    this.publishers.set(path, key);

    return true;
  }

  setSubscriber(key: string, path: string): boolean {
    if (!this.sessions.has(key)) {
      // session doesnt exist
      return false;
    }

    // check for publisher?
    // OR wait for it to come?

    const currentList = (this.subscribers.get(path) || []);
    if (currentList.includes(key)) {
      // duplicate
      return false;
    }

    this.subscribers.set(path, [...currentList, key]);

    return true;
  }

  destroy(key: string): boolean {
    const session = this.sessions.get(key);

    if (!session) {
      return false;
    }

    const pubPath = session.connection.publish.path;
    if (pubPath) {
      // check for subscriber list and destroy them one by one
      if (this.subscribers.has(pubPath)) {
        this.subscribers.get(pubPath)?.forEach((sKey: string) => {
          const subscriber = this.sessions.get(sKey);
          if (subscriber) {
            // dont delete the session, just detach it from the publisher
            // .destroy() will do that for us
            subscriber.destroy();
          }
        });

        this.subscribers.delete(pubPath);
      }

      if (this.publishers.has(pubPath)) {
        // should i check for it's owner?
        this.publishers.delete(pubPath);
      }
    }

    session.destroy();
    this.sessions.delete(key);

    return true;
  }
}

export default RTMPSessionManager;
