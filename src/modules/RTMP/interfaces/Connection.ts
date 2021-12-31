import PlayConnectionStatus from '../enumerators/PlayConnectionStatus';

interface Connection {
  version: number; // might be useful, might be not
  message: any;
  startAt: null|Date;
  appName: null|string;
  objectEncoding: any;
  // not sure about leaving it here
  pinger?: any;

  publish: {
    active: boolean;
    streamId: number;
    path: string;
    orgPath: string;
    orgArgs: string;
  };

  play: {
    status: PlayConnectionStatus;
    streamId: number;
    path: string;
    orgPath: string;
    orgArgs: string;
  };
}

export default Connection;
