import chai from 'chai';
import crypto from 'crypto';

import Net from 'net';
import Mitm from 'mitm';
import { EventEmitter } from 'events';

import RTMPSession from '../../src/modules/RTMP/session';
import RTMPChunkHelper from '../../src/modules/RTMP/chunk';

import AMF0 from '../../src/support/amf/AMF0';

import PlayConnectionStatusEnum from '../../src/modules/RTMP/enumerators/PlayConnectionStatus';
import StreamStatusCodeEnum from '../../src/modules/RTMP/enumerators/StreamStatusCodes';
import ChunkTypesEnum from '../../src/modules/RTMP/enumerators/ChunkTypes';
import ChunkStreamIdsEnum from '../../src/modules/RTMP/enumerators/ChunkStreamIds';
import ChunkFMTEnum from '../../src/modules/RTMP/enumerators/ChunkFMT';

import ChunkData from '../../src/modules/RTMP/interfaces/ChunkData';

const mock = {
  config: {},
  socket: {
    server: null,
    client: null
  },
  emitter: new EventEmitter(),
  authorizer: {},
  sessionManager: {
    destroy: () => {},
    sessions: new Map(),
    subscribers: new Map(),
    publishers: new Map(),
    setPublisher: (key: string, path: string): boolean => {
      if (!mock.sessionManager.sessions.has(key)) {
        // session doesnt exist
        return false;
      }

      if (mock.sessionManager.publishers.has(path)) {
        // path is already busy
        return false;
      }

      mock.sessionManager.publishers.set(path, key);

      return true;
    },
    setSubscriber: (key: string, path: string): boolean => {
      if (!mock.sessionManager.sessions.has(key)) {
        // session doesnt exist
        return false;
      }

      const currentList = (mock.sessionManager.subscribers.get(path) || []);
      if (currentList.includes(key)) {
        // duplicate
        return false;
      }

      mock.sessionManager.subscribers.set(path, [...currentList, key]);

      return true;
    }
  },
};



let mitm = null;
let session = null;

describe('Session', () => {
  before(() => {
    mitm = Mitm();

    mitm.on('connection', socket => {
      mock.socket.server = socket;
    });

    mock.socket.client = Net.connect(1935, 'abc.com');

    session = new RTMPSession(
      Date.now(),
      mock.config,
      mock.emitter,
      mock.socket.server,
      mock.authorizer,
      mock.sessionManager
    );

    session.up();
  });

  after(() => {
    mitm.disable();

    session.destroy();
  });

  describe('constructor', () => {
    it('should fill in the connection obj', () => {
      chai.assert.equal(session.connection.version, -1);
      chai.assert.equal(session.connection.appName, null);

      chai.assert.equal(session.connection.publish.active, false);

      chai.assert.equal(session.connection.play.status, PlayConnectionStatusEnum.NONE);
    });

    it('should fill in the data obj', () => {
      chai.assert.equal(session.data.metaPayload instanceof Buffer, true);
      chai.assert.equal(session.data.audio.codecHeader instanceof Buffer, true);
      chai.assert.equal(session.data.video.codecHeader instanceof Buffer, true);

      chai.assert.equal(session.data.video.framerate, 0);
    });

    it('should create a ChunkHelper instance', () => {
      chai.assert.equal(session.chunk instanceof RTMPChunkHelper, true);
    });
  });

  describe('pingClient()', () => {
    after(() => {
      mock.socket.client.removeAllListeners('data');
    });

    it('should send a PING message with timestamp 0', () => {
      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];

        chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.EVENT);
      });

      session.pingClient();
    });
  });

  describe('chunk size', () => {
    after(() => {
      mock.socket.client.removeAllListeners('data');
    });
    // TODO: inChunkSize message

    it('should send a SET_CHUNK_SIZE message (srv->client)', () => {
      const outBitrate = 8000;
      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];

        chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.SET_CHUNK_SIZE);
      });

      session.setChunkSize(outBitrate);
    });
  });

  describe('stream status', () => {
    after(() => {
      mock.socket.client.removeAllListeners('data');
    });

    it('should send an EOF (end of file) message', () => {
      const statusCode = StreamStatusCodeEnum.EOF;
      const streamId = 5;

      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];

        chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.EVENT);
        chai.assert.equal(chunk.payload.readUInt16BE(0), StreamStatusCodeEnum.EOF);
        chai.assert.equal(chunk.payload.readUInt32BE(2), streamId);
      });

      session.sendStreamStatus(statusCode, streamId);
    });

    it('should send an BEGIN message', () => {
      const statusCode = StreamStatusCodeEnum.BEGIN;
      const streamId = 5;

      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];

        chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.EVENT);
        chai.assert.equal(chunk.payload.readUInt16BE(0), StreamStatusCodeEnum.BEGIN);
        chai.assert.equal(chunk.payload.readUInt32BE(2), streamId);
      });

      session.sendStreamStatus(statusCode, streamId);
    });
  });

  describe('ACK', () => {
    after(() => {
      mock.socket.client.removeAllListeners('data');
    });

    describe('wnidow ACK', () => {
      it('should send WindowACK message - .sendWindowACK()', () => {
        const bitrate = 5000;

        const chunkInstance = new RTMPChunkHelper();

        mock.socket.client.on('data', (data) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[0];

          chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
          chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
          chai.assert.equal(chunk.header.type, ChunkTypesEnum.WINDOW_ACK_SIZE);

          chai.assert.equal(chunk.payload.readUInt32BE(0), bitrate);
        });

        session.sendWindowACK(bitrate);
      });
    });

    describe('packet ACK', () => {
      before(() => {
        // in RL case, ack size would be controled by the client
        session.chunk.setAckSize(9999);
      });

      after(() => {
        mock.socket.client.removeAllListeners('data');
      });

      // executed on every INCOMING packet
      it('should increase the inSize value, and NOT send an ACK message', () => {
        const buffer = Buffer.alloc(100);
        const chunkInstance = new RTMPChunkHelper();

        // copy values, discard link
        const prevAck = { ...session.chunk.ack };

        session.sendPacketACK(buffer);
        chai.assert.equal(session.chunk.ack.inSize, buffer.length);
        chai.assert.notEqual(session.chunk.ack.inSize, prevAck.inSize);
        chai.assert.notEqual(session.chunk.ack.inSize, session.chunk.lastSize);
      });

      it('should send an ACK message', () => {
        const buffer = Buffer.alloc(session.chunk.ack.size);
        const chunkInstance = new RTMPChunkHelper();

        mock.socket.client.on('data', (data) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[0];

          chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
          chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
          chai.assert.equal(chunk.header.type, ChunkTypesEnum.ACKNOWLEDGEMENT);

          chai.assert.equal(chunk.payload.readUInt32BE(0), session.chunk.ack.size);
        });

        session.sendPacketACK(buffer);
      });

      it('should reset the counter. (inSize >= 0xf0000000)', () => {
        const buffer = Buffer.alloc(0xf0000000 / 10);
        const chunkInstance = new RTMPChunkHelper();

        // copy values, discard link
        const prevAck = { ...session.chunk.ack };

        for (let i = 0; i < 10; i++) {
          session.sendPacketACK(buffer);
        }

        chai.assert.equal(session.chunk.ack.inSize, 0);
        chai.assert.equal(session.chunk.ack.lastSize, 0);
        chai.assert.notEqual(session.chunk.ack.inSize, prevAck.inSize);
        chai.assert.notEqual(session.chunk.ack.inSize, session.chunk.lastSize);
      });
    });
  });

  describe('data message', () => {
    after(() => {
      mock.socket.client.removeAllListeners('data');
    });

    it('should send an \'RtmpSampleAccess\' message', () => {
      const streamId = Math.floor(Math.random() * (100 - 1) + 1);
      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];
        const cmd = AMF0.decode(chunk.payload);

        chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.DATA);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.DATA);
        chai.assert.equal(chunk.header.sId, streamId);
        chai.assert.deepEqual(cmd.slice(0, 3), ['|RtmpSampleAccess', false,  false]);
      });

      session.sendRTMPSampleAccess(streamId);
    });

    it('should send a custom data message', () => {
      const streamId = Math.floor(Math.random() * (100 - 1) + 1);
      const msg = ['test', 1337];
      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];
        const cmd = AMF0.decode(chunk.payload);

        chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.DATA);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.DATA);
        chai.assert.equal(chunk.header.sId, streamId);
        chai.assert.deepEqual(cmd.slice(0, 2), msg);
      });

      session.sendDataMessage(streamId, msg);
    });
  });

  describe('invoke message', () => {
    after(() => {
      mock.socket.client.removeAllListeners('data');
    });
    // TODO: invoke connect cmd

    it('should send a CONNECT RESPONSE message', () => {
      const transactionId = Math.floor(Math.random() * (100 - 1) + 1);
      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];
        const cmd = AMF0.decode(chunk.payload);

        // figure out why FMT is being replaced
        //chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.INVOKE);
        chai.assert.equal(chunk.header.sId, 0);
        chai.assert.equal(cmd[0], '_result');
        chai.assert.equal(cmd[1], transactionId);
        chai.assert.equal(cmd[3]?.code, 'NetConnection.Connect.Success');
      });

      session.sendConnectResponse(transactionId);
    });

    // used to notify the client of their publish/play status (response)
    it('should send an \'onStatus\' message', () => {
      const sId = Math.floor(Math.random() * (100 - 1) + 1);
      const message = {
        level: 'error',
        code: 'NetStream.Play.Stop',
        description: `Playback of /live/abc has been stopped.`
      };

      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[0];
        const cmd = AMF0.decode(chunk.payload);

        //chai.assert.equal(chunk.header.fmt, ChunkFMTEnum.TYPE_0);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
        chai.assert.equal(chunk.header.type, ChunkTypesEnum.INVOKE);
        chai.assert.equal(chunk.header.sId, sId);
        chai.assert.equal(cmd[0], 'onStatus');
        chai.assert.deepEqual(cmd[3], message);
      });

      session.sendStatusMessage(sId, message);
    });
  });

  describe('.preStartPlay()', () => {
    const respList: ChunkData[] = [];
    const refData = {
      video: {},
      audio: {},
      meta: {}
    };

    before((done) => {
      session.connection.publish.path = '/live/test';
      session.connection.publish.active = true;

      session.connection.play.path = '/live/test';
      session.connection.play.status = PlayConnectionStatusEnum.PLAY;

      mock.sessionManager.publishers.set(session.connection.publish.path, session.id);
      mock.sessionManager.subscribers.set(session.connection.publish.path, [session.id]);
      mock.sessionManager.sessions.set(session.id, session);

      // video
      session.data.video.codecHeader = crypto.randomBytes(128);
      session.data.video.codec = 12;
      refData.video = session.data.video;

      // audio
      session.data.audio.codecHeader = crypto.randomBytes(128);
      session.data.audio.codec = 10;
      refData.audio = session.data.audio;

      // meta
      session.data.metaPayload = crypto.randomBytes(128);
      refData.meta.payload = session.data.metaPayload;

      const chunkInstance = new RTMPChunkHelper();

      mock.socket.client.on('data', (data: any) => {
        chunkInstance.read(data, 0, data.length, '');
        const chunk = chunkInstance.data[chunkInstance.data.length - 1];
        respList.push(chunk);

        if (respList.length >= 3) {
          done();
        }
      });

      session.preStartPlay();
    });

    after(() => {
      mock.socket.client.removeAllListeners('data');
      mock.sessionManager.sessions = new Map();
      mock.sessionManager.subscribers = new Map();
      mock.sessionManager.publishers = new Map();

      session.connection.play.status = PlayConnectionStatusEnum.NONE;
      session.connection.play.path = '';

      session.connection.publish.active = false;
      session.connection.publish.path = '';

      session.data.video.codec = -1;
      session.data.audio.codec = -1;
    });

    it('should send metadata', () => {
      const chunk = respList[0];

      chai.assert.equal(refData.meta.payload.equals(chunk.payload.slice(0, refData.meta.payload.length)), true);
    });

    it('should send audio codec', () => {
      const chunk = respList[1];

      chai.assert.equal(refData.audio.codecHeader.equals(chunk.payload.slice(0, refData.audio.codecHeader.length)), true);
    });

    it('should send video codec', () => {
      const chunk = respList[2];

      chai.assert.equal(refData.video.codecHeader.equals(chunk.payload.slice(0, refData.video.codecHeader.length)), true);
    });
  });

  describe('protocol', () => {
    describe('.onRTMPConnect()', () => {
      const respList: ChunkData[] = [];

      before('build query & execute method', (done) => {
        const cmd = [
          'connect',
          1,
          {
            app: 'live',
            type: 'nonprivate',
            flashVer: 'FMLE/3.0 (compatible; Lavf58.29.100)',
            tcUrl: 'rtmp://192.168.0.16:1935/live',
          },
        ];

        const chunkInstance = new RTMPChunkHelper();
        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);

          // is that even legal?
          if (respList.length >= 4) {
            done();
          }
        });

        session.onRTMPConnect(cmd);
      });

      after(() => {
        clearInterval(session.connection.pinger);
        mock.socket.client.removeAllListeners('data');
      });

      it('should send window ACK', () => {
        const chunk: ChunkData = respList.find((data: ChunkData) => data.header.type === ChunkTypesEnum.WINDOW_ACK_SIZE);
        chai.assert.exists(chunk);
        chai.assert.equal(chunk.header.length, 4);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
      });

      it('should send peer bitrate size', () => {
        const chunk: ChunkData = respList.find((data: ChunkData) => data.header.type === ChunkTypesEnum.SET_PEER_BANDWIDTH);
        chai.assert.exists(chunk);
        chai.assert.equal(chunk.header.length, 5);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
      });

      it('should send chunk size', () => {
        const chunk: ChunkData = respList.find((data: ChunkData) => data.header.type === ChunkTypesEnum.SET_CHUNK_SIZE);
        chai.assert.exists(chunk);
        chai.assert.equal(chunk.header.length, 4);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.PROTOCOL);
      });

      it('should send connect response (_result)', () => {
        const chunk: ChunkData = respList.find((data: ChunkData) => data.header.type === ChunkTypesEnum.INVOKE);
        const cmd = AMF0.decode(chunk?.payload);

        chai.assert.exists(chunk);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
        chai.assert.equal(cmd[0], '_result');
        chai.assert.equal(cmd[3]?.code, 'NetConnection.Connect.Success');
      });
    });

    describe('.onRTMPCreateStream()', () => {
      const respList: ChunkData[] = [];

      before('build query & execute method', (done) => {
        const cmd = [ 'createStream', 4, null, 0 ];

        const chunkInstance = new RTMPChunkHelper();
        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);

          done();
        });

        session.onRTMPCreateStream(cmd);
      });

      after(() => {
        clearInterval(session.connection.pinger);
        mock.socket.client.removeAllListeners('data');
      });

      it('should sebnd create response (_result)', () => {
        // in this case, its just 1 message
        const chunk = respList[0];
        const cmd = AMF0.decode(chunk?.payload);

        chai.assert.exists(chunk);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
        chai.assert.equal(cmd[0], '_result');
      });
    });

    describe('.onRTMPPublish()', () => {
      describe('no AUTH module', () => {
        const respList: ChunkData[] = [];
        const execute = async (id: number, appName, streamName) => {
          // simulate connection result
          session.connection.startAt = new Date();
          session.connection.appName = appName;

          session.id = id;

          const cmd = [ 'publish', 5, null, streamName, appName, 0 ];
          const mockChunk = { header: { sId: 2 } };

          return session.onRTMPPublish(cmd, mockChunk);
        };

        before('build query', () => {
          const chunkInstance = new RTMPChunkHelper();
          mock.socket.client.on('data', (data: any) => {
            chunkInstance.read(data, 0, data.length, '');
            const chunk = chunkInstance.data[chunkInstance.data.length - 1];
            respList.push(chunk);
          });
        });

        after(() => {
          mock.socket.client.removeAllListeners('data');
          mock.sessionManager.sessions = new Map();
          mock.sessionManager.subscribers = new Map();
          mock.sessionManager.publishers = new Map();
        });

        it('should succeed', async () => {
          const id = Date.now() + '';
          mock.sessionManager.sessions.set(id, session);
          await execute(id, 'live', 'test');

          const chunk = respList[0];
          const dPayload = AMF0.decode(chunk?.payload);

          chai.assert.equal(respList.length, 1);
          chai.assert.equal(chunk?.header?.type, ChunkTypesEnum.INVOKE);
          chai.assert.equal(dPayload[0], 'onStatus');
          chai.assert.equal(dPayload[3]?.level, 'status');
          chai.assert.equal(dPayload[3]?.code, 'NetStream.Publish.Start');
        });

        it('should fail. Path duplicate', async () => {
          await execute(session.id, 'live', 'test');

          const chunk = respList[1];
          const dPayload = AMF0.decode(chunk?.payload);

          chai.assert.equal(respList.length, 2);
          chai.assert.equal(chunk?.header?.type, ChunkTypesEnum.INVOKE);
          chai.assert.equal(dPayload[0], 'onStatus');
          chai.assert.equal(dPayload[3]?.level, 'error');
          chai.assert.equal(dPayload[3]?.code, 'NetStream.Publish.BadName');
        });
      });

      describe('with AUTH module', () => {
        const respList: ChunkData[] = [];
        const execute = async (id: number, appName, streamName) => {
          // simulate connection result
          session.connection.startAt = new Date();
          session.connection.appName = appName;

          session.id = id;

          const cmd = [ 'publish', 5, null, streamName, appName, 0 ];
          const mockChunk = { header: { sId: 2 } };

          return session.onRTMPPublish(cmd, mockChunk);
        };

        before(() => {
          const chunkInstance = new RTMPChunkHelper();
          mock.socket.client.on('data', (data: any) => {
            chunkInstance.read(data, 0, data.length, '');
            const chunk = chunkInstance.data[chunkInstance.data.length - 1];
            respList.push(chunk);
          });
        });

        after(() => {
          mock.socket.client.removeAllListeners('data');
          mock.sessionManager.sessions = new Map();
          mock.sessionManager.subscribers = new Map();
          mock.sessionManager.publishers = new Map();
        });

        it('should succeed', (done) => {
          session.authorizer.publish = async () => {
            return { success: true, data: { sId: 'abc' } };
          };

          const id = Date.now() + '';
          mock.sessionManager.sessions.set(id, session);
          execute(id, 'live', 'test');

          setTimeout(() => {
            const chunk = respList[0];
            const dPayload = AMF0.decode(chunk?.payload);

            chai.assert.equal(respList.length, 1);
            chai.assert.equal(chunk?.header?.type, ChunkTypesEnum.INVOKE);
            chai.assert.equal(dPayload[0], 'onStatus');
            chai.assert.equal(dPayload[3]?.level, 'status');
            chai.assert.equal(dPayload[3]?.code, 'NetStream.Publish.Start');

            done();
          }, 100);
        });

        it('should fail. Auth failure', (done) => {
          session.authorizer.publish = async () => {
            return { success: false };
          };

          const id = Date.now() + '';
          mock.sessionManager.sessions.set(id, session);
          execute(id, 'live', 'test');

          setTimeout(() => {
            const chunk = respList[1];
            const dPayload = AMF0.decode(chunk?.payload);

            chai.assert.equal(respList.length, 2);
            chai.assert.equal(chunk?.header?.type, ChunkTypesEnum.INVOKE);
            chai.assert.equal(dPayload[0], 'onStatus');
            chai.assert.equal(dPayload[3]?.level, 'error');
            chai.assert.equal(dPayload[3]?.code, 'NetStream.Publish.BadName');

            done();
          }, 100);
        });
      });
    });

    describe('.onRTMPPlay()', () => {
      describe('no AUTH module', () => {
        const respList: ChunkData[] = [];
        const execute = async (id: number, appName, streamName) => {
          // simulate connection result
          session.connection.startAt = new Date();
          session.connection.appName = appName;

          session.id = id;

          const cmd = [ 'play', 5, null, streamName, appName, 0 ];
          const mockChunk = { header: { sId: 2 } };

          return session.onRTMPPlay(cmd, mockChunk);
        };

        before('build query', () => {
          const chunkInstance = new RTMPChunkHelper();
          mock.socket.client.on('data', (data: any) => {
            chunkInstance.read(data, 0, data.length, '');
            const chunk = chunkInstance.data[chunkInstance.data.length - 1];
            respList.push(chunk);
          });
        });

        after(() => {
          mock.socket.client.removeAllListeners('data');
          mock.sessionManager.sessions = new Map();
          mock.sessionManager.subscribers = new Map();
          mock.sessionManager.publishers = new Map();
        });

        it('should succeed', async () => {
          const id = Date.now() + '';
          mock.sessionManager.sessions.set(id, session);
          await execute(id, 'live', 'test');

          chai.assert.equal(respList.length, 3);
          chai.assert.equal(respList[0]?.header?.type, ChunkTypesEnum.EVENT);
          chai.assert.equal(respList[0]?.payload[0], StreamStatusCodeEnum.BEGIN);

          const dPayload2 = AMF0.decode(respList[1]?.payload);
          chai.assert.equal(respList[1]?.header?.type, ChunkTypesEnum.INVOKE);
          chai.assert.equal(dPayload2[0], 'onStatus');
          chai.assert.equal(dPayload2[3].level, 'status');
          chai.assert.equal(dPayload2[3].code, 'NetStream.Play.Start');

          const dPayload3 = AMF0.decode(respList[2]?.payload);
          chai.assert.equal(respList[2]?.header?.type, ChunkTypesEnum.DATA);
          chai.assert.equal(dPayload3[0], '|RtmpSampleAccess');
          chai.assert.equal(dPayload3[1], false);
          chai.assert.equal(dPayload3[2], false);

          chai.assert.equal(session.connection.play.status, PlayConnectionStatusEnum.IDLE);
        });

        it('should fail. Session duplicate', async () => {
          await execute(session.id, 'live', 'test');

          const chunk = respList[3];
          const dPayload = AMF0.decode(chunk?.payload);

          chai.assert.equal(chunk?.header?.type, ChunkTypesEnum.INVOKE);
          chai.assert.equal(dPayload[0], 'onStatus');
          chai.assert.equal(dPayload[3]?.level, 'error');
          chai.assert.equal(dPayload[3]?.code, 'NetStream.Play.Failed');
        });
      });
    });

    describe('.onRTMPSetDataFrame()', () => {
      const respList: ChunkData[] = [];
      const cmd = [
        '@setDataFrame',
        'onMetaData',
        {
          duration: 0,
          width: 1280,
          height: 720,
          videodatarate: 195.3125,
          framerate: 25,
          videocodecid: 2,
          audiodatarate: 0,
          audiosamplerate: 48000,
          audiosamplesize: 16,
          stereo: true,
          audiocodecid: 2,
          major_brand: 'isom',
          minor_version: '512',
          compatible_brands: 'isomiso2avc1mp41',
          encoder: 'Lavf58.29.100',
          filesize: 0
        },
      ];

      before((done) => {
        const chunkInstance = new RTMPChunkHelper();

        mock.sessionManager.subscribers.set(session.connection.publish.path, [session.id]);
        mock.sessionManager.sessions.set(session.id, session);
        session.connection.play.status = PlayConnectionStatusEnum.PLAY;

        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);

          done();
        });

        session.onRTMPSetDataFrame(cmd);
      });

      after(() => {
        mock.socket.client.removeAllListeners('data');
        mock.sessionManager.sessions = new Map();
        mock.sessionManager.subscribers = new Map();
        mock.sessionManager.publishers = new Map();

        session.connection.play.status = PlayConnectionStatusEnum.NONE;
      });

      it('should override metadata', () => {
        // audio
        chai.assert.equal(session.data.audio.samplerate, cmd[2].audiosamplerate);
        chai.assert.equal(session.data.audio.channels, cmd[2].stereo ? 2 : 1);

        // video
        chai.assert.equal(session.data.video.framerate, cmd[2].framerate);
        chai.assert.equal(session.data.video.width, cmd[2].width);
        chai.assert.equal(session.data.video.height, cmd[2].height);
      });

      it('should store an encoded metadata buffer', () => {
        const chunk = respList[0];

        // chunk parser sets a MAX length by default
        const tPayload = chunk.payload.slice(0, session.data.metaPayload.length);
        chai.assert.equal(tPayload.equals(session.data.metaPayload), true);
      });

      it('should send a metadata copy to subs', () => {
        const chunk = respList[0];
        const inCMD = AMF0.decode(chunk.payload);

        chai.assert.equal(inCMD[0], cmd[1]);
        chai.assert.equal(inCMD[1].height, cmd[2].height);
        chai.assert.equal(inCMD[1].width, cmd[2].width);
        chai.assert.equal(inCMD[1].stereo, cmd[2].stereo);
        chai.assert.equal(inCMD[1].encoder, cmd[2].encoder);
      });
    });

    describe('.handleVideoCommand()', () => {
      const respList: ChunkData[] = [];
      let referenceChunk;

      before((done) => {
        mock.sessionManager.subscribers.set(session.connection.publish.path, [session.id]);
        mock.sessionManager.sessions.set(session.id, session);
        session.connection.play.status = PlayConnectionStatusEnum.PLAY;

        const chunkInstance = new RTMPChunkHelper();

        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);

          done();
        });

        const chunkData = {
          payload: Buffer.alloc(0),
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: ChunkStreamIdsEnum.DATA,
            type: ChunkTypesEnum.VIDEO,
            sId: 0,
            timestamp: 0,
            length: 0,
          },
        };

        chunkData.payload = crypto.randomBytes(128);
        // tricks the server into treating it like a codec header
        chunkData.payload[0] = 279;
        chunkData.payload[1]  = 0;

        chunkData.header.length = chunkData.payload.length;

        referenceChunk = chunkData;
        session.handleVideoCommand(chunkData);
      });

      after(() => {
        mock.socket.client.removeAllListeners('data');
        mock.sessionManager.sessions = new Map();
        mock.sessionManager.subscribers = new Map();
        mock.sessionManager.publishers = new Map();

        session.connection.play.status = PlayConnectionStatusEnum.NONE;
      });

      it('should store codec header', () => {
        chai.assert.equal(session.data.video.codec, referenceChunk.payload[0] & 0x0f);
        chai.assert.equal(session.data.video.codecHeader.equals(referenceChunk.payload), true);
      });

      it('should send a payload copy to subs', () => {
        const chunk = respList[0];

        chai.assert.equal(chunk.header.type, ChunkTypesEnum.VIDEO);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.VIDEO);
        chai.assert.equal(chunk.payload.slice(0, referenceChunk.payload.length).equals(referenceChunk.payload), true);
      });
    });

    describe('.handleAudioCommand()', () => {
      const respList: ChunkData[] = [];
      let referenceChunk;

      before((done) => {
        mock.sessionManager.subscribers.set(session.connection.publish.path, [session.id]);
        mock.sessionManager.sessions.set(session.id, session);
        session.connection.play.status = PlayConnectionStatusEnum.PLAY;

        const chunkInstance = new RTMPChunkHelper();

        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);

          done();
        });

        const chunkData = {
          payload: Buffer.alloc(0),
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: ChunkStreamIdsEnum.DATA,
            type: ChunkTypesEnum.AUDIO,
            sId: 0,
            timestamp: 0,
            length: 0,
          },
        };

        chunkData.payload = crypto.randomBytes(128);
        // tricks the server into treating it like a codec header
        chunkData.payload[0] = 170;
        chunkData.payload[1]  = 0;

        chunkData.header.length = chunkData.payload.length;

        referenceChunk = chunkData;
        session.handleAudioCommand(chunkData);
      });

      after(() => {
        mock.socket.client.removeAllListeners('data');
        mock.sessionManager.sessions = new Map();
        mock.sessionManager.subscribers = new Map();
        mock.sessionManager.publishers = new Map();

        session.connection.play.status = PlayConnectionStatusEnum.NONE;
      });

      it('should store codec header', () => {
        chai.assert.equal(session.data.audio.codec, (referenceChunk.payload[0] >> 4) & 0x0f);
        chai.assert.equal(session.data.audio.channels, referenceChunk.payload[0] & 0x01);
        chai.assert.equal(session.data.audio.codecHeader.equals(referenceChunk.payload), true);
      });

      it('should send a payload copy to subs', () => {
        const chunk = respList[0];

        chai.assert.equal(chunk.header.type, ChunkTypesEnum.AUDIO);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.AUDIO);
        chai.assert.equal(chunk.payload.slice(0, referenceChunk.payload.length).equals(referenceChunk.payload), true);
      });
    });

    describe('.onRTMPPause()', () => {
      const respList: ChunkData[] = [];
      const execute = async (pauseBool, appName, streamName) => {
        // simulate connection result
        session.connection.startAt = new Date();
        session.connection.appName = appName;

        const id = Date.now() + '';
        mock.sessionManager.sessions.set(id, session);
        session.id = id;

        const cmd = [ 'pause', 5, null, pauseBool, 0 ];

        return session.onRTMPPause(cmd);
      };

      before(() => {
        const chunkInstance = new RTMPChunkHelper();
        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);
        });
      });

      after(() => {
        mock.socket.client.removeAllListeners('data');
        mock.sessionManager.sessions = new Map();
        mock.sessionManager.subscribers = new Map();
        mock.sessionManager.publishers = new Map();
      });

      it('should pause', async () => {
        session.connection.play.status = PlayConnectionStatusEnum.PLAY;

        await execute(true, 'live', 'test');

        chai.assert.equal(respList.length, 2);
        chai.assert.equal(respList[0]?.header?.type, ChunkTypesEnum.EVENT);

        const dPayload2 = AMF0.decode(respList[1]?.payload);
        chai.assert.equal(respList[1]?.header?.type, ChunkTypesEnum.INVOKE);
        chai.assert.equal(dPayload2[0], 'onStatus');
        chai.assert.equal(dPayload2[3]?.level, 'info');
        chai.assert.equal(dPayload2[3]?.code, 'NetStream.Pause.Notify');

        chai.assert.equal(session.connection.play.status, PlayConnectionStatusEnum.PAUSE);
      });

      it('should unpause (play)', async () => {
        await execute(false, 'live', 'test');

        chai.assert.equal(respList.length, 3);

        const chunk = respList[2];
        const dPayload = AMF0.decode(chunk?.payload);
        chai.assert.equal(chunk?.header?.type, ChunkTypesEnum.INVOKE);
        chai.assert.equal(dPayload[0], 'onStatus');
        chai.assert.equal(dPayload[3]?.level, 'info');
        chai.assert.equal(dPayload[3]?.code, 'NetStream.Unpause.Notify');

        chai.assert.equal(session.connection.play.status, PlayConnectionStatusEnum.PLAY);
      });
    });

    describe('.onDeleteStream()', () => {
      describe('publisher', () => {
        const respList: ChunkData[] = [];

        before('build query & execute method', (done) => {
          session.connection.publish.streamId = Math.floor(Math.random() * (1000 - 1) + 1);
          session.connection.publish.path = '/live/test';
          session.connection.publish.active = true;

          const cmd = [ 'deleteStream', null, null, session.connection.publish.streamId ];

          const chunkInstance = new RTMPChunkHelper();
          mock.socket.client.on('data', (data: any) => {
            chunkInstance.read(data, 0, data.length, '');
            const chunk = chunkInstance.data[chunkInstance.data.length - 1];
            respList.push(chunk);

            done();
          });

          session.onRTMPDeleteStream(cmd);
        });

        after(() => {
          mock.socket.client.removeAllListeners('data');

          session.connection.publish.streamId = 0;
          session.connection.publish.path = '';
          session.connection.publish.active = false;
        });

        it('should send a status confirmation message', () => {
          // in this case, its just 1 message
          const chunk = respList[0];
          const cmd = AMF0.decode(chunk?.payload);

          chai.assert.exists(chunk);
          chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
          chai.assert.equal(cmd[0], 'onStatus');
          chai.assert.equal(cmd[3]?.level, 'error');
          chai.assert.equal(cmd[3]?.code, 'NetStream.Unpublish.Success');
        });
      });

      describe('subscriber', () => {
        const respList: ChunkData[] = [];

        before('build query & execute method', (done) => {
          session.connection.play.streamId = Math.floor(Math.random() * (1000 - 1) + 1);
          session.connection.play.path = '/live/test';
          session.connection.play.status = 2;

          const cmd = [ 'deleteStream', null, null, session.connection.play.streamId ];

          const chunkInstance = new RTMPChunkHelper();
          mock.socket.client.on('data', (data: any) => {
            chunkInstance.read(data, 0, data.length, '');
            const chunk = chunkInstance.data[chunkInstance.data.length - 1];
            respList.push(chunk);

            done();
          });

          session.onRTMPDeleteStream(cmd);
        });

        after(() => {
          mock.socket.client.removeAllListeners('data');

          session.connection.play.streamId = 0;
          session.connection.play.path = '';
          session.connection.play.status = 0;
        });

        it('should send a status confirmation message', () => {
          // in this case, its just 1 message
          const chunk = respList[0];
          const cmd = AMF0.decode(chunk?.payload);

          chai.assert.exists(chunk);
          chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
          chai.assert.equal(cmd[0], 'onStatus');
          chai.assert.equal(cmd[3]?.level, 'error');
          chai.assert.equal(cmd[3]?.code, 'NetStream.Play.Stop');
        });
      });
    });

    describe('.onCloseStream()', () => {
      const respList: ChunkData[] = [];

      before('build query & execute method', (done) => {
        session.connection.publish.streamId = Math.floor(Math.random() * (1000 - 1) + 1);
        session.connection.publish.path = '/live/test';
        session.connection.publish.active = true;

        const chunkInstance = new RTMPChunkHelper();
        mock.socket.client.on('data', (data: any) => {
          chunkInstance.read(data, 0, data.length, '');
          const chunk = chunkInstance.data[chunkInstance.data.length - 1];
          respList.push(chunk);

          done();
        });

        session.onRTMPCloseStream();
      });

      after(() => {
        mock.socket.client.removeAllListeners('data');

        session.connection.publish.streamId = 0;
        session.connection.publish.path = '';
        session.connection.publish.active = false;
      });

      it('should send a status confirmation message', () => {
        // in this case, its just 1 message
        const chunk = respList[0];
        const cmd = AMF0.decode(chunk?.payload);

        chai.assert.exists(chunk);
        chai.assert.equal(chunk.header.csId, ChunkStreamIdsEnum.INVOKE);
        chai.assert.equal(cmd[0], 'onStatus');
        chai.assert.equal(cmd[3]?.level, 'error');
        chai.assert.equal(cmd[3]?.code, 'NetStream.Unpublish.Success');
      });
    });
  });
});
