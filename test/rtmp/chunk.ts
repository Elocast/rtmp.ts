import chai from 'chai';

import RTMPChunkHelper from '../../src/modules/RTMP/chunk';

import ChunkFMTEnum from '../../src/modules/RTMP/enumerators/ChunkFMT';
import ChunkStreamIdsEnum from '../../src/modules/RTMP/enumerators/ChunkStreamIds';
import ChunkTypesEnum from '../../src/modules/RTMP/enumerators/ChunkTypes';

import ChunkData from '../../src/modules/RTMP/interfaces/ChunkData';

import AMF0 from '../../src/support/amf/AMF0';

const storage = {
  status: {
    connect: {
      data: [],
      buffer: Buffer.alloc(0),
    }
  },
};

describe('Chunk Reader', () => {
  before(() => {
    const data = [
      '_result',
      0,
      {
        fmsVer: 'FMS/3,0,1,123',
        capabilities: 31
      },
      {
        level: 'status',
        code: 'NetConnection.Connect.Success',
        description: 'Connection succeeded.',
        objectEncoding: {}
      }
    ];

    const chunkData = {
      payload: Buffer.alloc(0),
      rawData: data,
      extTimestamp: 0,
      byteSize: 0,
      capacity: 0,
      timer: 0,
      id: [],
      header: {
        fmt: ChunkFMTEnum.TYPE_0,
        csId: ChunkStreamIdsEnum.INVOKE,
        type: ChunkTypesEnum.INVOKE,
        sId: 0,
        timestamp: 0,
        length: 0,
      },
    };

    for (let i = 0; i < data.length; i++) {
      chunkData.payload = Buffer.concat([ chunkData.payload, AMF0.encode(data[i])]);
    }

    chunkData.header.length = chunkData.payload.length;
    storage.status.connect.data = [chunkData];
  });

  describe('.toBuffer()', () => {
    it('should serialize NetConnection status message', () => {
      const chunkInstance = new RTMPChunkHelper({ data: storage.status.connect.data });
      const oBuffer = chunkInstance.toBuffer();

      storage.status.connect.buffer = oBuffer;

      chai.assert.equal(Buffer.isBuffer(oBuffer), true);
    });
  });

  describe('.read()', () => {
    it ('should deserialize NetConnection status message', () => {
      const chunkInstance = new RTMPChunkHelper({});

      chunkInstance.read(
        storage.status.connect.buffer,
        0,
        storage.status.connect.buffer.length,
        1
      );

      chai.assert.equal(chunkInstance.data.length, 1);
      chai.assert.equal(chunkInstance.data[0]?.header.type, storage.status.connect.data[0]?.header.type);
      chai.assert.equal(chunkInstance.data[0]?.header.length, storage.status.connect.data[0]?.header.length);
    });
  });

  describe('.clearDataDups()', () => {
    it('length shouldnt change. Chunks are unhandled', () => {
      const chunks: ChunkData[] = [];

      for (let i = 0; i < 10; i++) {
        chunks.push({
          payload: Buffer.alloc(0),
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          isHandled: false,
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: ChunkStreamIdsEnum.INVOKE,
            type: ChunkTypesEnum.INVOKE,
            sId: 0,
            timestamp: 0,
            length: 0,
          },
        });
      }

      const chunkInstance = new RTMPChunkHelper({ data: chunks });
      chunkInstance.clearDataDups();

      chai.assert.equal(chunkInstance.data.length, chunks.length);
    });

    it('length shouldnt change. Chunks are of different ids', () => {
      const chunks: ChunkData[] = [];

      for (let i = 0; i < 10; i++) {
        chunks.push({
          payload: Buffer.alloc(0),
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          isHandled: false,
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: i,
            type: ChunkTypesEnum.INVOKE,
            sId: 0,
            timestamp: 0,
            length: 0,
          },
        });
      }

      const chunkInstance = new RTMPChunkHelper({ data: chunks });
      chunkInstance.clearDataDups();

      chai.assert.equal(chunkInstance.data.length, chunks.length);
    });

    it('should keep 5 chunks', () => {
      const chunks: ChunkData[] = [];

      for (let i = 0; i < 10; i++) {
        chunks.push({
          payload: Buffer.alloc(0),
          extTimestamp: 0,
          byteSize: 0,
          capacity: 0,
          timer: 0,
          id: [],
          isHandled: true,
          header: {
            fmt: ChunkFMTEnum.TYPE_0,
            csId: i > 4 ? 1 : i,
            type: ChunkTypesEnum.INVOKE,
            sId: 0,
            timestamp: 0,
            length: 0,
          },
        });
      }

      const chunkInstance = new RTMPChunkHelper({ data: chunks });
      chunkInstance.clearDataDups();

      chai.assert.equal(chunkInstance.data.length, 5);
    });
  });

  describe('.setAckSize()', () => {
    it('should fail. Size cant be below 1', () => {
      const chunkInstance = new RTMPChunkHelper({});
      const preAckSize = chunkInstance.ack.size;

      chunkInstance.setAckSize(-1);

      chai.assert.notEqual(chunkInstance.ack.size, -1);
      chai.assert.equal(preAckSize, chunkInstance.ack.size);
    });

    it('should succeed', () => {
      const chunkInstance = new RTMPChunkHelper({});
      const preAckSize = chunkInstance.ack.size;

      chunkInstance.setAckSize(2634);

      chai.assert.notEqual(preAckSize, chunkInstance.ack.size);
    });
  });

  describe('.setInChunkSize()', () => {
    it('should fail. Size cant be below 1', () => {
      const chunkInstance = new RTMPChunkHelper({});
      const preInChunkSize = chunkInstance.inChunkSize;

      chunkInstance.setInChunkSize(-1);

      chai.assert.notEqual(chunkInstance.inChunkSize, -1);
      chai.assert.equal(preInChunkSize, chunkInstance.inChunkSize);
    });

    it('should succeed', () => {
      const chunkInstance = new RTMPChunkHelper({});
      const preInChunkSize = chunkInstance.inChunkSize;

      chunkInstance.setInChunkSize(2342);

      chai.assert.notEqual(preInChunkSize, chunkInstance.inChunkSize);
    });
  });

  describe('static', () => {
    describe('basic header', () => {
      let basicHeader = Buffer.alloc(0);
      it('.generateBasicHeader() (serialize)', () => {
        const header = storage.status.connect.data[0]?.header;
        basicHeader = RTMPChunkHelper.generateBasicHeader(header?.fmt, header?.csId);
        chai.assert.equal(basicHeader[0], 3);
      });

      it('.findFMT() (deserialise)', () => {
        const header = storage.status.connect.data[0]?.header;
        const fmt = RTMPChunkHelper.findFMT(basicHeader, 0);
        chai.assert.equal(fmt, header?.fmt);
      });

      it('.findCSID() (deserialize)', () => {
        const bitAndRes = (storage.status.connect.buffer[0] & 0x3f);
        const basicHeaderByteSize = bitAndRes === 0 ? 2 : bitAndRes === 1 ? 3 : 1;

        const csid = RTMPChunkHelper.findCSID(storage.status.connect.buffer, basicHeaderByteSize);

        chai.assert.equal(csid, ChunkStreamIdsEnum.INVOKE);
      });
    });

    describe('message header', () => {
      let output = Buffer.alloc(0);
      it('.generateMessageHeader() (serialize)', () => {
        const header = storage.status.connect.data[0]?.header;
        output = RTMPChunkHelper.generateMessageHeader(header);

        // we know exactly what the output would be
        chai.assert.deepEqual(output.toJSON().data, [ 0, 0, 0, 0, 0, 185, 20, 0, 0, 0, 0 ]);
      });

      it('.parseMessageHeader() (deserialize)', () => {
        const desiredHeader = storage.status.connect.data[0]?.header;
        // we skip basic header, as the buffer doesnt contain it
        const outputHeader = RTMPChunkHelper.parseMessageHeader(output, 0, 0);

        chai.assert.equal(outputHeader.type, desiredHeader.type);
        chai.assert.equal(outputHeader.length, desiredHeader.length);
      });
    });

    describe('payload', () => {
      it('.parseCommand() (deserialize)', () => {
        // message payload doesnt get further serialized after AMF0 encoding
        const cmd = RTMPChunkHelper.parseCommand(storage.status.connect.data[0]);

        chai.assert.deepEqual(cmd, storage.status.connect.data[0].rawData);
      });
    });
  });
});
