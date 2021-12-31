import { Socket } from 'net';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import AMF0 from '../../support/amf/AMF0';

import HandshakeHelper from './handshake';
import HandshakeInterface from './interfaces/Handshake';
import HandshakeStateEnum from './enumerators/HandshakeState';
import HandshakeConsts from './constants/Handshake';

import ChunkHelper from './chunk';
import ChunkData from './interfaces/ChunkData';
import ChunkParserStateEnum from './enumerators/ChunkParserState';
import ChunkTypesEnum from './enumerators/ChunkTypes';
import ChunkStreamIdsEnum from './enumerators/ChunkStreamIds';
import ChunkFMTEnum from './enumerators/ChunkFMT';

import ConnectionInterface from './interfaces/Connection';
import PlayConnectionStatusEnum from './enumerators/PlayConnectionStatus';

import StreamStatusCodeEnum from './enumerators/StreamStatusCodes';
import StreamData from './interfaces/StreamData';
import AudioConsts from './constants/Audio';

export class RTMPSession {
  id: string;
  config: any;
  handshake: HandshakeInterface;
  connection: ConnectionInterface;
  emitter: any;
  sessionManager: any;
  socket: Socket;
  chunk: ChunkHelper;

  data: StreamData;

  packets: any[] = [];

  authorizer: {
    publish?: any;
    play?: any;
  }

  readDataTimeout: any;

  constructor(
    id: string,
    config: any,
    emitter: any,
    socket: any,
    authorizer: any,
    sessionManager: any
  ) {
    this.id = id;
    this.config = config;
    this.emitter = emitter;
    this.socket = socket;
    this.authorizer = authorizer;
    this.sessionManager = sessionManager;

    // state
    this.handshake = {
      state: HandshakeStateEnum.NONE,
      byteSize: 0,
      payload: Buffer.alloc(HandshakeConsts.size),
    }; 

    this.connection = {
      version: -1,
      appName: null,
      message: null,
      startAt: null,
      objectEncoding: null,

      publish: {
        streamId: 0,
        active: false,
        path: '',
        orgPath: '',
        orgArgs: '',
      },

      play: {
        streamId: 0,
        status: PlayConnectionStatusEnum.NONE,
        path: '',
        orgPath: '',
        orgArgs: '',
      },
    };

    this.data = {
      metaPayload: Buffer.alloc(0),
      audio: {
        codec: -1,
        codecHeader: Buffer.alloc(0),
        samplerate: 0,
        channels: -1,
      },
      video: {
        codec: -1,
        codecHeader: Buffer.alloc(0),
        framerate: 0,
        height: 0,
        width: 0,
      },
    };

    this.chunk = new ChunkHelper();

    this.readDataTimeout = null;
  }

  pingClient(): void {
    // shouldnt be necessary, but TS will be TS
    let passedTime = 0;
    if (this.connection.startAt) {
      passedTime = Date.now() - +this.connection.startAt;
    }

    const chunkData: ChunkData = {
      payload: Buffer.alloc(0),
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.PROTOCOL,
        type: ChunkTypesEnum.EVENT,
        sId: 0,
        timestamp: passedTime,
        length: 0,
      },
    };

    chunkData.payload = Buffer.from([
      0, 6,
      (passedTime >> 24) & 0xff,
      (passedTime >> 16) & 0xff,
      (passedTime >> 8) & 0xff,
      passedTime && 0xff
    ]);

    chunkData.header.length = chunkData.payload.length;

    const chunk = new ChunkHelper({ data: [chunkData] });
    const chunkBuffer = chunk.toBuffer();

    this.socket.write(chunkBuffer);
  }

  setPeerBandwidth(bitrate: number, type: number = 1): void {
    const buffer = Buffer.alloc(17);
    buffer[0] = ChunkStreamIdsEnum.PROTOCOL;
    buffer[6] = 5;
    buffer[7] = ChunkTypesEnum.SET_PEER_BANDWIDTH;

    buffer.writeUInt32BE(bitrate, 12);
    buffer[16] = type;
    this.socket.write(buffer);
  }

  setChunkSize(byteSize: number): void {
    const buffer = Buffer.alloc(16);
    buffer[0] = ChunkStreamIdsEnum.PROTOCOL;
    buffer[6] = 4;
    buffer[7] = ChunkTypesEnum.SET_CHUNK_SIZE;

    buffer.writeUInt32BE(byteSize, 12);
    this.socket.write(buffer);
  }

  sendStreamStatus(statusCode: number, streamId: number) {
    const buffer = Buffer.alloc(18);
    buffer[0] = ChunkStreamIdsEnum.PROTOCOL;
    buffer[6] = 6;
    buffer[7] = ChunkTypesEnum.EVENT;

    buffer.writeUInt16BE(statusCode, 12);
    buffer.writeUInt32BE(streamId, 14);
    this.socket.write(buffer);
  }

  sendRTMPSampleAccess(streamId: number): void {
    this.sendDataMessage(streamId, ['|RtmpSampleAccess', false, false]);
  }

  sendInvokeMessage(sId: number, data: any): void {
    const chunkData: ChunkData = {
      payload: Buffer.alloc(0),
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.INVOKE,
        type: ChunkTypesEnum.INVOKE,
        sId: sId,
        timestamp: 0,
        length: 0,
      },
    };

    for (let i = 0; i < data.length; i++) {
      chunkData.payload = Buffer.concat([ chunkData.payload, AMF0.encode(data[i])]);
    }

    chunkData.header.length = chunkData.payload.length;

    const chunkInstance = new ChunkHelper({ data: [chunkData] });
    const oBuffer = chunkInstance.toBuffer();
    this.socket.write(oBuffer);
  }

  sendDataMessage(sId: number, data: any): void {
    const chunkData: ChunkData = {
      payload: Buffer.alloc(0),
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.DATA,
        type: ChunkTypesEnum.DATA,
        sId: sId,
        timestamp: 0,
        length: 0,
      },
    };

    for (let i = 0; i < data.length; i++) {
      chunkData.payload = Buffer.concat([ chunkData.payload, AMF0.encode(data[i])]);
    }

    chunkData.header.length = chunkData.payload.length;

    const chunkInstance = new ChunkHelper({ data: [chunkData] });
    const oBuffer = chunkInstance.toBuffer();
    this.socket.write(oBuffer);
  }

  sendStatusMessage(
    sId: number,
    infoObj: {
      level: string;
      code: string;
      description: string;
    },
  ): void {
    const options = [
      'onStatus',
      0,
      null,
      {
        level: infoObj.level,
        code: infoObj.code,
        description: infoObj.description,
      }
    ];

    this.sendInvokeMessage(sId, options);
  }

  sendPacketACK(data: Buffer): void {
    this.chunk.ack.inSize += data.length;

    if (this.chunk.ack.inSize >= 0xf0000000) {
      this.chunk.ack.inSize = 0;
      this.chunk.ack.lastSize = 0;
    }

    // prevent dup acks && dont sent any ack until size is negotiated
    if (this.chunk.ack.size > 0 && ((this.chunk.ack.inSize - this.chunk.ack.lastSize) >= this.chunk.ack.size)) {
      this.chunk.ack.lastSize = this.chunk.ack.inSize;

      const buffer = Buffer.alloc(16);
      buffer[0] = 2;
      buffer[6] = 4;
      buffer[7] = 3;

      buffer.writeUInt32BE(this.chunk.ack.size, 12);
      this.socket.write(buffer);
    }
  }

  sendWindowACK(bitrate: number): void {
    const buffer = Buffer.alloc(16);
    buffer[0] = ChunkStreamIdsEnum.PROTOCOL;
    buffer[6] = 4;
    buffer[7] = ChunkTypesEnum.WINDOW_ACK_SIZE;

    buffer.writeUInt32BE(bitrate, 12);
    this.socket.write(buffer);
  }

  onSocketData(data: Buffer): void {
    this.packets.push({
      /*
      * NOT the same as chunk id
      * it's a REQUEST ID, for our internal purposes
      * mostly deprecated by now, but still might be useful
      */
      id: uuidv4(),
      data,
    });
  }

  readDataLoop(): void {
    if (this.packets.length < 1) {
      this.readDataTimeout = setTimeout(() => this.readDataLoop(), 1);
      return;
    }

    const { id, data } = this.packets[0];

    this.packets = [
      ...this.packets.slice(1),
    ];


    let byteSize: number = data.length;

    /*
     * those values are used to split chunks from each other, as they
     * might come merged, or uncomplete within a packet
     *
     * prevPos = previous position. The same as `currPos`, in previous loop
     * currPos = current position
     * */
    let prevPos: number = 0;
    let currPos: number = 0;

    let done = false;

    // rtmp client sends data in chunks
    while (byteSize > 0 && !done) {
      switch (this.handshake.state) {
        // specs [5.2] @p7
        case HandshakeStateEnum.NONE: {
          byteSize = byteSize - 1;
          prevPos = prevPos + 1;

          this.handshake = {
            ...this.handshake,
            state: HandshakeStateEnum.S0,
            byteSize: 0,
          };

          break;
        }
        /*
          * C0
          * - 0-1 bytes (RTMP version)
          * C1
          * - 0-3 bytes (timestamp)
          * - 4-8 bytes (zeros)
          * - 9-** (random data)
         */
        case HandshakeStateEnum.S0: {
          const diffByteSize: number = HandshakeConsts.size - this.handshake.byteSize;
          currPos = diffByteSize >= byteSize ? byteSize : diffByteSize;

          data.copy(
            this.handshake.payload as Buffer,
            this.handshake.byteSize,
            prevPos,
            prevPos + currPos
          );

          this.handshake.byteSize = this.handshake.byteSize + currPos;
          byteSize = byteSize - currPos;
          prevPos = prevPos + currPos;

          if (this.handshake.byteSize === HandshakeConsts.size) {
            this.connection.version = data.readUIntBE(0, 1);
            this.handshake = {
              ...this.handshake,
              state: HandshakeStateEnum.S1,
              byteSize: 0,
            };

            // returns S1 & S2
            this.socket.write(HandshakeHelper.generate(this.handshake.payload as Buffer));
          }

          break;
        }
        /*
          * C2
          * - 0-3 bytes (C1 timestamp)
          * - 4-8 bytes (C2 timestamp) (could be used to measure latency ??)
          * - 9-** (random data)
        */
        case HandshakeStateEnum.S1: {
          /* we could as well ignore this message
           * but its safer to process it, and make sure the length is correct
           */

          const diffByteSize: number = HandshakeConsts.size - this.handshake.byteSize;
          currPos = diffByteSize >= byteSize ? byteSize : diffByteSize;

          data.copy(
            this.handshake.payload as Buffer,
            this.handshake.byteSize,
            prevPos,
            prevPos + currPos
          );

          this.handshake.byteSize = this.handshake.byteSize + currPos;
          byteSize = byteSize - currPos;
          prevPos = prevPos + currPos;

          if (this.handshake.byteSize === HandshakeConsts.size) {
            this.handshake = {
              state: HandshakeStateEnum.S2,
              byteSize: 0,
              payload: null,
            };
          }

          break;
        }
        default: {
          const readResponse = this.chunk.read(data, prevPos, byteSize, id);

          if (readResponse.offset) {
            byteSize = byteSize - (readResponse.offset - prevPos);
            prevPos = readResponse.offset;
          }

          done = !!readResponse.done;

          let handledReqIds: string[] = [];

          for (let i = 0; i < this.chunk.data.length; i++) {
            const chunk = this.chunk.data[i];

            if (!chunk.isParsed || !chunk.isHandled) {
              handledReqIds = handledReqIds.filter((id) => !chunk.id.includes(id));
            }

            if (chunk.isParsed && !chunk.isHandled) {
              handledReqIds = [
                ...handledReqIds,
                ...chunk.id
              ].reduce((acc: string[], id: string) => acc.includes(id) ? acc : [...acc, id], []);

              this.protocolHandler(this.chunk.data[i]);

              this.chunk.data[i].isHandled = true;
            }
          }

          if (done) {
            this.sendPacketACK(data);
            this.chunk.clearDataDups();
          }
        }
      }
    }

    this.readDataTimeout = setTimeout(() => this.readDataLoop(), 1);
  }

  protocolHandler(chunk: any): void {
    switch(chunk.header.type) {
      case ChunkTypesEnum.WINDOW_ACK_SIZE: {
        const size = chunk?.payload?.readUInt32BE() || 0;
        return this.chunk.setAckSize(size);
      }
      case ChunkTypesEnum.SET_CHUNK_SIZE:
        const size = chunk?.payload?.readUInt32BE() || 0;
        return this.chunk.setInChunkSize(size);
      case ChunkTypesEnum.EVENT:
        return;
      case ChunkTypesEnum.FLEX_MESSAGE:
      case ChunkTypesEnum.INVOKE:
        return this.handleInvokeCommand(chunk);
      case ChunkTypesEnum.FLEX_STREAM:
      case ChunkTypesEnum.DATA:
        return this.handleDataCommand(chunk);
      case ChunkTypesEnum.VIDEO:
        return this.handleVideoCommand(chunk);
      case ChunkTypesEnum.AUDIO:
        return this.handleAudioCommand(chunk);
      default:
        //console.error('RTMP skipped packet type', this.chunk.data[dataIndex].header.type);
        return;
    }
  }

  handleInvokeCommand(chunk: any): void {
    const cmd = ChunkHelper.parseCommand(chunk);

    switch(cmd[0]) {
      case 'connect':
        return this.onRTMPConnect(cmd);
      case 'deleteStream':
        return this.onRTMPDeleteStream(cmd);
      case 'closeStream':
        return this.onRTMPCloseStream();
      case 'releaseStream':
        return;;
      case 'createStream':
        return this.onRTMPCreateStream(cmd);
      case 'FCPublish':
        return;
      case 'publish':
        this.onRTMPPublish(cmd, chunk);
        return;
      case 'play':
        this.onRTMPPlay(cmd, chunk);
        return;
      case 'pause':
        return this.onRTMPPause(cmd);
      default:
        return;
    }
  }

  onRTMPConnect(data: any[]): void {
    this.emitter.emit('rtmp.client.connect.attempt', data[2]);
    this.connection.message = data[2];
    this.connection.startAt = new Date();
    this.connection.appName = data[2].app;
    this.connection.objectEncoding = data[2].objectEncoding || 0;

    this.connection.pinger = setInterval(() => this.pingClient(), 30 * 1000);

    this.sendWindowACK(50000);
    this.setPeerBandwidth(50000, 2);
    this.setChunkSize(this.chunk.outChunkSize);
    this.sendConnectResponse(data[1]);
    this.emitter.emit('rtmp.client.connect.success', data[1], data[2]);
  }

  sendConnectResponse(transId: number): void {
    const options = [
      '_result',
      transId,
      {
        fmsVer: 'FMS/3,0,1,123',
        capabilities: 31
      },
      {
        level: 'status',
        code: 'NetConnection.Connect.Success',
        description: 'Connection succeeded.',
        objectEncoding: this.connection.objectEncoding
      }
    ];

    this.sendInvokeMessage(0, options);
  }

  onRTMPCloseStream(): void {
    return this.onRTMPDeleteStream(['closeStream', null, null, this.connection.publish.streamId]);
  }

  onRTMPDeleteStream(data: any[]): void {
    const streamId = data[3];

    if (this.connection.play.streamId === streamId) {
      this.emitter.emit('rtmp.client.play.done', this.connection.play.path, this.connection.play.orgArgs, streamId);
      this.sendStatusMessage(this.connection.play.streamId, {
          level: 'error',
          code: 'NetStream.Play.Stop',
          description: `Playback of ${this.connection.publish.orgPath} has been stopped.`
        }
      );
    }

    if (this.connection.publish.streamId === streamId) {
      this.emitter.emit('rtmp.client.publish.done', this.connection.publish.path, this.connection.publish.orgArgs, streamId);

      this.sendStatusMessage(this.connection.publish.streamId, {
          level: 'error',
          code: 'NetStream.Unpublish.Success',
          description: `Connection to ${this.connection.publish.orgPath} has been closed.`
        }
      );

      // send EOF, to all subscribers
      const subIds = this.sessionManager.subscribers.get(this.connection.publish.path) || [];
      subIds.forEach((id: string) => {
        const session = this.sessionManager.sessions.get(id);

        if (session) {
          session.sendStreamStatus(StreamStatusCodeEnum.EOF, session.connection.play.streamId);
        }
      });
    }

    this.sessionManager.destroy(this.id);
  }

  onRTMPCreateStream(data: any[]): void {
    const options = [
      '_result',
      data[1],
      null,
      1
    ];

    this.sendInvokeMessage(0, options);
  }

  async onRTMPPublish(data: any[], chunk: any): Promise<void> {
    const streamNameArgs = data[3].split('?');
    this.connection.publish.path = path.join('/', this.connection.appName || '', streamNameArgs[0]);
    this.connection.publish.orgPath = path.join('/', this.connection.appName || '', data[3]);
    this.connection.publish.streamId = chunk.header.sId;
    this.connection.publish.active = true;

    // parse querystring?
    this.connection.publish.orgArgs = streamNameArgs[1] || '';

    this.emitter.emit('rtmp.client.publish.attempt', this.connection.publish.path, this.connection.publish.orgArgs);

    // checks for path availability and creates a new publisher entry
    const isAvailable = this.sessionManager.setPublisher(this.id, this.connection.publish.path);

    if (!isAvailable) {
      this.sendStatusMessage(this.connection.publish.streamId, {
          level: 'error',
          code: 'NetStream.Publish.BadName',
          description: `Connection to ${this.connection.publish.orgPath} is already established.`
        }
      );

      return;
    }

    if (this.authorizer?.publish &&  typeof this.authorizer.publish === 'function') {
      const authResponse = await this.authorizer.publish(this.connection.publish.path);

      if (!authResponse.success) {
        this.sendStatusMessage(this.connection.publish.streamId, {
            level: 'error',
            code: 'NetStream.Publish.Unauthorized',
            description: `Authentication to ${this.connection.publish.orgPath} failed.`
          }
        );

        return;
      }
    }

    this.sendStatusMessage(this.connection.publish.streamId, {
        level: 'status',
        code: 'NetStream.Publish.Start',
        description: `You're now publishing to ${this.connection.publish.orgPath}.`
      }
    );

    this.emitter.emit('rtmp.client.publish.success', this.connection.publish.path, this.connection.publish.orgArgs);
  }

  onRTMPPause(data: any[]): void {
    if (this.connection.play.status === PlayConnectionStatusEnum.NONE) {
      return;
    }

    this.connection.play.status = data[3]
      ? PlayConnectionStatusEnum.PAUSE
      : PlayConnectionStatusEnum.PLAY;

    if (this.connection.play.status === PlayConnectionStatusEnum.PAUSE) {
      this.sendStreamStatus(StreamStatusCodeEnum.EOF, this.connection.play.streamId);
      this.sendStatusMessage(this.connection.play.streamId, {
          level: 'info',
          code: 'NetStream.Pause.Notify',
          description: `Playback of ${this.connection.play.orgPath} has been paused.`
        }
      );
    } else {
      this.preStartPlay();
      this.sendStatusMessage(this.connection.play.streamId, {
          level: 'info',
          code: 'NetStream.Unpause.Notify',
          description: `Playback of ${this.connection.play.orgPath} has been resumed.`
        }
      );
    }
  }

  async onRTMPPlay(data: any[], chunk: any): Promise<void> {
    const streamNameArgs = data[3].split('?');
    this.connection.play.path = path.join('/', this.connection.appName || '', streamNameArgs[0]);
    this.connection.play.orgPath = path.join('/', this.connection.appName || '', data[3]);
    this.connection.play.streamId = chunk.header.sId;

    // parse querystring?
    this.connection.play.orgArgs = streamNameArgs[1] || '';

    this.emitter.emit('rtmp.client.play.attempt', this.connection.play.path, this.connection.play.orgArgs);

    const isAvailable = this.sessionManager.setSubscriber(this.id, this.connection.play.path);

    if (!isAvailable) {
      this.sendStatusMessage(this.connection.play.streamId, {
          level: 'error',
          code: 'NetStream.Play.Failed',
          description: `Connection to ${this.connection.play.orgPath} is already established.`
        }
      );

      return;
    }

    if (this.authorizer?.play &&  typeof this.authorizer.play === 'function') {
      const authResponse = await this.authorizer.play(this.connection.play.path);

      if (!authResponse.success) {
        this.sendStatusMessage(this.connection.play.streamId, {
            level: 'error',
            code: 'NetStream.Play.Unauthorized',
            description: `Authentication to ${this.connection.play.orgPath} failed.`
          }
        );

        return;
      }
    }

    if (this.connection.play.status === PlayConnectionStatusEnum.PLAY) {
      this.sendStatusMessage(this.connection.play.streamId, {
          level: 'error',
          code: 'NetStream.Play.Failed',
          description: `Already playing ${this.connection.play.orgPath}.`
        }
      );
    } else {
      this.sendStreamStatus(StreamStatusCodeEnum.BEGIN, this.connection.play.streamId);
      this.sendStatusMessage(this.connection.play.streamId, {
          level: 'status',
          code: 'NetStream.Play.Start',
          description: `You're now playing ${this.connection.play.orgPath}.`
        }
      );
      this.sendRTMPSampleAccess(this.connection.play.streamId);
    }

    this.connection.play.status = PlayConnectionStatusEnum.IDLE;
    this.preStartPlay();
  }

  preStartPlay(): void {
    const pId = this.sessionManager.publishers.get(this.connection.play.path);
    const pSession = this.sessionManager.sessions.get(pId);

    if (pSession) {
      if (pSession.data.metaPayload.length > 0) {
        const chunkData: ChunkData = {
          payload: pSession.data.metaPayload,
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: ChunkStreamIdsEnum.DATA,
            type: ChunkTypesEnum.DATA,
            sId: this.connection.play.streamId,
            timestamp: 0,
            length: 0,
          },
        };

        chunkData.header.length = chunkData.payload.length;

        const chunkInstance = new ChunkHelper({ data: [chunkData] });
        const oBuffer = chunkInstance.toBuffer();
        this.socket.write(oBuffer);
      }

      if ([10].includes(pSession.data.audio.codec)) {
        const chunkData: ChunkData = {
          payload: pSession.data.audio.codecHeader,
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: ChunkStreamIdsEnum.AUDIO,
            type: ChunkTypesEnum.AUDIO,
            sId: this.connection.play.streamId,
            timestamp: 0,
            length: pSession.data.audio.codecHeader.length,
          },
        };

        const chunkInstance = new ChunkHelper({ data: [chunkData] });
        const oBuffer = chunkInstance.toBuffer();
        this.socket.write(oBuffer);
      }

      if ([7, 12].includes(pSession.data.video.codec)) {
        const chunkData: ChunkData = {
          payload: pSession.data.video.codecHeader,
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: ChunkStreamIdsEnum.VIDEO,
            type: ChunkTypesEnum.VIDEO,
            sId: this.connection.play.streamId,
            timestamp: 0,
            length: pSession.data.video.codecHeader.length,
          },
        };

        const chunkInstance = new ChunkHelper({ data: [chunkData] });
        const oBuffer = chunkInstance.toBuffer();
        this.socket.write(oBuffer);
      }

      this.connection.play.status = PlayConnectionStatusEnum.PLAY;
    }

    this.emitter.emit('rtmp.client.play.success', this.connection.play.path, this.connection.play.orgArgs);
  }

  handleDataCommand(chunk: any): void {
    const cmd = ChunkHelper.parseCommand(chunk);

    switch(cmd[0]) {
      case '@setDataFrame':
        return this.onRTMPSetDataFrame(cmd);
      default:
        break;
    }
  }

  onRTMPSetDataFrame(data: any[]): void {
    if (data[2]) {
      this.data.audio.samplerate = data[2].audiosamplerate;
      this.data.audio.channels = data[2].stereo ? 2 : 1;

      this.data.video.framerate = data[2].framerate;
      this.data.video.width = data[2].width;
      this.data.video.height = data[2].height;
    }

    const cmdData = [
      'onMetaData',
      data[2],
    ];

    const chunkData: ChunkData = {
      payload: Buffer.alloc(0),
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.DATA,
        type: ChunkTypesEnum.DATA,
        sId: 0,
        timestamp: 0,
        length: 0,
      },
    };

    for (let i = 0; i < cmdData.length; i++) {
      chunkData.payload = Buffer.concat([ chunkData.payload, AMF0.encode(cmdData[i]) ]);
    }

    chunkData.header.length = chunkData.payload.length;

    // keep the payload for all incoming subscribers
    this.data.metaPayload = chunkData.payload;

    const chunkInstance = new ChunkHelper({ data: [chunkData] });
    const oBuffer = chunkInstance.toBuffer();

    const subIds = this.sessionManager.subscribers.get(this.connection.publish.path) || [];

    subIds.forEach((id: string) => {
      const session = this.sessionManager.sessions.get(id);

      if (session && session.connection.play.status === PlayConnectionStatusEnum.PLAY) {
        // override streamid for every sub
        oBuffer.writeUInt32LE(session.connection.play.streamId, 8);
        session.socket.write(oBuffer);
      }
    });
  }

  handleAudioCommand(chunk: any): void {
    const aInfo = {
      codec: (chunk.payload[0] >> 4) & 0x0f,
      type: chunk.payload[0] & 0x01,
      size: (chunk.payload[0] >> 1) & 0x01,
      rate: (chunk.payload[0] >> 2) & 0x03,
    };

    if (this.data.audio.codec === -1 || this.data.audio.codec !== aInfo.codec) {
      this.data.audio.codec = aInfo.codec;
      this.data.audio.samplerate = AudioConsts.rates[aInfo.rate];
      this.data.audio.channels = aInfo.type;
    }

    if (
      aInfo.codec === 10
      && chunk.payload[1] === 0
    ) {
      this.data.audio.codecHeader = Buffer.alloc(chunk.payload.length);
      chunk.payload.copy(this.data.audio.codecHeader);
    }

    const chunkData: ChunkData = {
      payload: chunk.payload,
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.AUDIO,
        type: ChunkTypesEnum.AUDIO,
        sId: 0,
        timestamp: chunk.timer,
        length: chunk.payload.length,
      },
    };

    const chunkInstance = new ChunkHelper({ data: [chunkData] });
    const oBuffer = chunkInstance.toBuffer();

    const subIds = this.sessionManager.subscribers.get(this.connection.publish.path) || [];

    subIds.forEach((id: string) => {
      const session = this.sessionManager.sessions.get(id);

      if (session && session.connection.play.status === PlayConnectionStatusEnum.PLAY) {
        // override streamid for every sub
        oBuffer.writeUInt32LE(session.connection.play.streamId, 8);
        session.socket.write(oBuffer);
      }
    });
  }

  handleVideoCommand(chunk: any): void {
    const payload = chunk.payload.slice(0, chunk.header.length);

    const vInfo = {
      type: (payload[0] >> 4) & 0x0f,
      codec: payload[0] & 0x0f,
    };

    if (
      [7, 12].includes(vInfo.codec)
      && vInfo.type === 1
      && payload[1] === 0
    ) {
      this.data.video.codecHeader = Buffer.alloc(payload.length);
      chunk.payload.copy(this.data.video.codecHeader);
    }

    if (this.data.video.codec === -1 || this.data.video.codec !== vInfo.codec) {
      this.data.video.codec = vInfo.codec;
    }

    const chunkData: ChunkData = {
      payload: payload,
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.VIDEO,
        type: ChunkTypesEnum.VIDEO,
        sId: 0,
        timestamp: chunk.timer,
        length: payload.length,
      },
    };

    const chunkInstance = new ChunkHelper({ data: [chunkData] });
    const oBuffer = chunkInstance.toBuffer();

    const subIds = this.sessionManager.subscribers.get(this.connection.publish.path) || [];

    subIds.forEach((id: string) => {
      const session = this.sessionManager.sessions.get(id);

      if (session && session.connection.play.status === PlayConnectionStatusEnum.PLAY) {
        // override streamid for every sub
        oBuffer.writeUInt32LE(session.connection.play.streamId, 8);
        session.socket.write(oBuffer);
      }
    });
  }

  onSocketClose(): void {
    this.emitter.emit('rtmp.client.connect.done', this.connection);
    this.sessionManager.destroy(this.id);
  }

  onSocketError(err: any): void {
    this.emitter.emit('rtmp.client.connect.error', this.connection, err);
    // might be useful for debugging, but i wouldnt keep it ncommented on prod
    // spams the console with all socket disconnects, even graceful ones
    // console.log(err);
  }

  up() {
    this.socket.on('data', this.onSocketData.bind(this));
    this.socket.on('close', this.onSocketClose.bind(this));
    this.socket.on('error', this.onSocketError.bind(this));
    this.readDataTimeout = setTimeout(() => this.readDataLoop(), 1);
  }

  destroy(): void {
    clearInterval(this.connection.pinger);
    clearTimeout(this.readDataTimeout);
    // disconnects and deletes socket
    this.socket.destroy();
  }
}

export default RTMPSession;
