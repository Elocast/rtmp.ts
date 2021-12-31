import { Socket } from 'net';

import AMF0 from '../../support/amf/AMF0';

import ChunkConsts from './constants/Chunk';

import ChunkParserStateEnum from './enumerators/ChunkParserState';
import ChunkTypesEnum from './enumerators/ChunkTypes';
import ChunkFMTEnum from './enumerators/ChunkFMT';

import ChunkParser from './interfaces/ChunkParser';
import ChunkHeader from './interfaces/ChunkHeader';
import ChunkData from './interfaces/ChunkData';
import ChunkOptions from './interfaces/ChunkOptions';
import ChunkAck from './interfaces/ChunkAck';

export class RTMPChunkHelper {
  // inChunkSize is controlled by the client
  // outChunkSize is conteolled by the server
  //
  // inChunkSize must stay at the default (128) value, as its used
  // to calculate the initial requests
  // outChunkSize can be of any value - the higher the value,
  // the more CPU intensive it is, but should deal better with higher bitrates
  inChunkSize: number = ChunkConsts.defaultChunkSize;
  outChunkSize: number = ChunkConsts.defaultChunkSize;

  ack: ChunkAck = {
    size: 0,
    inSize: 0,
    lastSize: 0
  };

  parser: ChunkParser = {
    byteSize: 0,
    basicHeaderByteSize: 0,
    buffer: Buffer.alloc(ChunkConsts.headerMaxSize),
    state: ChunkParserStateEnum.INIT,
    last: {
      byteSize: 0,
      reqId: null,
      chunkIndex: 0
    },
  };

  data: ChunkData[] = [];

  constructor(options: ChunkOptions = {}) {
    if (options.data) {
      this.data = [
        ...this.data,
        ...options.data
      ];
    }
  }

  setAckSize(size: number): void {
    if (size < 1) {
      return;
    }

    this.ack.size = size;
  }

  setInChunkSize(size: number): void {
    if (size < 1) {
      return;
    }

    this.inChunkSize = size;
  }

  read(data: Buffer, offset: number, byteSize: number, reqId: string): {
    done: boolean;
    // only required when done is equal to false
    // a sum of offset + iOffset. Determines where to start a new loop at
    offset?: number;
  } {
    const prevDataChunk = this.data[this.parser.last.chunkIndex];

    this.parser.last = {
      ...this.parser.last,
      reqId,
      byteSize,
    };

    // parser state resets back to INIT(0) state after a succesful buffer decode
    // in case of an unexpected buffer end, its assumed the remaining chunk of data
    // will come with a new message
    if (this.parser.state === ChunkParserStateEnum.INIT
      && (!prevDataChunk || prevDataChunk?.isStarted)
      && !prevDataChunk?.isAwaiting
    ) {
      this.data.push({
        ...ChunkConsts.defaultDataObj,
        id: [reqId],
      });
      this.parser.last.chunkIndex = this.data.length - 1;
    } else {
      const pIndex = this.parser.last.chunkIndex > -1 ? this.parser.last.chunkIndex : this.data.length - 1;
      this.data = [
        ...this.data.slice(0, pIndex),
        {
          ...this.data[pIndex],
          id: [
            ...this.data[pIndex].id,
            reqId
          ].reduce((acc: string[], key: string) => acc.includes(key) ? acc : [...acc, key], [])
        },
        ...this.data.slice(pIndex + 1),
      ];
    }

    let iDataIndex = this.parser.last.chunkIndex;
    let iByteSize: number = 0;
    let iOffset: number = 0;

    while (byteSize > iOffset) {
      switch(this.parser.state) {
        case ChunkParserStateEnum.INIT: {
          this.data[iDataIndex].isStarted = true;

          this.parser.buffer[0] = data[offset + iOffset];
          this.parser.byteSize = 1;
          iOffset += 1;

          // im not sure about this solution myself.
          const bitAndRes = (this.parser.buffer[0] & 0x3f);
          this.parser.basicHeaderByteSize = bitAndRes === 0 ? 2 : bitAndRes === 1 ? 3 : 1;

          this.parser.state = ChunkParserStateEnum.BASIC_HEADER;
          break;
        }
        case ChunkParserStateEnum.BASIC_HEADER: {
          while (this.parser.byteSize < this.parser.basicHeaderByteSize && iOffset < byteSize) {
            this.parser.buffer[this.parser.byteSize] = data[offset + iOffset];
            this.parser.byteSize += 1;
            iOffset += 1;
          }

          if (this.parser.byteSize >= this.parser.basicHeaderByteSize) {
            this.parser.state = ChunkParserStateEnum.MESSAGE_HEADER;
          }

          break;
        }
        case ChunkParserStateEnum.MESSAGE_HEADER: {
          const fmt = RTMPChunkHelper.findFMT(this.parser.buffer, offset + iOffset);
          iByteSize = ChunkConsts.headerSizes[fmt] + this.parser.basicHeaderByteSize;

          while (this.parser.byteSize < iByteSize && iOffset < byteSize) {
            this.parser.buffer[this.parser.byteSize] = data[offset + iOffset];
            this.parser.byteSize += 1;
            iOffset += 1;
          }

          if (this.parser.byteSize >= iByteSize) {
            const nHeader = RTMPChunkHelper.parseMessageHeader(
              this.parser.buffer,
              this.parser.basicHeaderByteSize,
              fmt
            );

            const csId = RTMPChunkHelper.findCSID(this.parser.buffer, this.parser.basicHeaderByteSize);
            let lastMatch = null;

            for (let i = this.data.length - 1; i > -1; i--) {
              const item = this.data[i];
              if (item.header.csId === csId) {
                lastMatch = item;
                break;
              }
            }

            this.data[iDataIndex] = {
              // im not sure if thats necessary
              ...lastMatch || {},
              ...this.data[iDataIndex],
              timer: lastMatch?.timer || 0,
              header: {
                ...this.data[iDataIndex].header,
                // this one is though. Some clients may decide to not send
                // full headers for chunks with csid they sent before.
                // We want to make sure the header data is carried over and fill the spots that changed
                ...lastMatch?.header || {},
                ...nHeader,
                fmt,
                csId,
              }
            };

            this.parser.state = ChunkParserStateEnum.EXT_TIMESTAMP;
          }

          break;
        }
        case ChunkParserStateEnum.EXT_TIMESTAMP: {
          iByteSize = ChunkConsts.headerSizes[this.data[iDataIndex].header.fmt] + this.parser.basicHeaderByteSize;

          if (this.data[iDataIndex].header.timestamp === 0xffffff) {
            iByteSize += 4;
          }

          while (iByteSize > this.parser.byteSize && iOffset < byteSize) {
            this.parser.buffer[this.parser.byteSize] = data[offset + iOffset];
            this.parser.byteSize += 1;
            iOffset += 1;
          }

          if (this.parser.byteSize >= iByteSize) {
            const timestamp = RTMPChunkHelper.formatExtTimestamp(
              this.data[iDataIndex].header.timestamp,
              this.parser.buffer,
              this.parser.basicHeaderByteSize,
              this.data[iDataIndex].header.fmt
            );

            this.data[iDataIndex].extTimestamp += timestamp;

            if (this.data[iDataIndex].byteSize === 0) {
              // reset timer at TYPE 0
              if (this.data[iDataIndex].header.fmt === ChunkFMTEnum.TYPE_0) {
                this.data[iDataIndex].timer = this.data[iDataIndex].extTimestamp;
              } else {
                this.data[iDataIndex].timer = this.data[iDataIndex].timer + this.data[iDataIndex].extTimestamp;
              }
            }

            this.parser.state = ChunkParserStateEnum.PRE_PAYLOAD;
          }
          break;
        }
        case ChunkParserStateEnum.PRE_PAYLOAD: {
          // DO NOT OVERRIDE THE PAYLOAD, IF ITS BEEN PREVIOUSLY SET
          if (this.data[iDataIndex].byteSize <= 0) {
            this.data[iDataIndex].capacity = this.data[iDataIndex].header.length + 1024;
            this.data[iDataIndex].payload = Buffer.alloc(this.data[iDataIndex].capacity);
          }
          this.parser.state = ChunkParserStateEnum.PAYLOAD;
          break;
        }
        case ChunkParserStateEnum.PAYLOAD: {
          iByteSize = Math.min(
            Math.min(
              // remaining chunk size
              this.inChunkSize - (this.data[iDataIndex].byteSize % this.inChunkSize),
              // message size, defined in the header (-) what was already set
              this.data[iDataIndex].header.length - this.data[iDataIndex].byteSize
            ),
            // remaining message size
            // WOULD ONLY WORK FOR SINGLE MESSAGE PAYLOADS
            byteSize - iOffset
          );

          if (iByteSize > 0) {
            data.copy(
              this.data[iDataIndex].payload,
              this.data[iDataIndex].byteSize,
              offset + iOffset,
              offset + iOffset + iByteSize,
            );
          }

          this.data[iDataIndex].byteSize += iByteSize;
          iOffset += iByteSize;

          // if chunk is equal or larger than pre-defined size
          if (this.data[iDataIndex].byteSize >= this.data[iDataIndex].header.length) {

            // if all data was parsed
            if (iOffset >= byteSize) {
              this.parser.state = ChunkParserStateEnum.INIT;
              //this.parser.last.chunkIndex = 0;
              this.data[iDataIndex].isParsed = true;
              this.data[iDataIndex].isAwaiting = false;

              return {
                done: true,
              };
            } else if (this.data[iDataIndex].header.type === 1) {
              this.parser.state = ChunkParserStateEnum.INIT;
              //this.parser.last.chunkIndex = 0;
              this.data[iDataIndex].isParsed = true;
              this.data[iDataIndex].isAwaiting = false;

              return {
                done: false,
                offset: offset + iOffset
              };
            } else {
              this.data[iDataIndex].isParsed = true;
              this.data[iDataIndex].isAwaiting = false;
              // its not the end of the packet, loop through again, store as a SEPERATE chunk
              this.data.push({
                ...ChunkConsts.defaultDataObj,
                id: [reqId],
              });
              iDataIndex = this.data.length - 1;
              this.parser.last.chunkIndex = iDataIndex;
              this.parser.state = ChunkParserStateEnum.INIT;
            }

            break;
          } else if (this.data[iDataIndex].byteSize % this.inChunkSize === 0) {
            this.parser.state = ChunkParserStateEnum.INIT;
            break;
          }
          // thats super important. Keep parsnig until any of the above matches
          break;
        }
      }
    }

    // if the loop ended. but chunk is not done yet - mark it appropriately
    if (!this.data[iDataIndex].isParsed) {
      this.data[iDataIndex].isAwaiting = true;
    }

    return {
      done: true,
    };
  }

  toBuffer(): Buffer {
    const type3BasicHeader = RTMPChunkHelper.generateBasicHeader(ChunkFMTEnum.TYPE_3, this.data[0].header.csId);
    const basicHeader = RTMPChunkHelper.generateBasicHeader(this.data[0].header.fmt, this.data[0].header.csId);
    const messageHeader = RTMPChunkHelper.generateMessageHeader(this.data[0].header);
    const isTimestampExt = this.data[0].header.timestamp >= 0xffffff;
    const fullHeaderSize = basicHeader.length + messageHeader.length + (isTimestampExt ? 4 : 0);

    let bufferSize = (this.data[0].header.length
      + fullHeaderSize
      + Math.floor(this.data[0].header.length / this.outChunkSize)
    );

    if (isTimestampExt) {
      bufferSize += Math.floor(this.data[0].header.length / this.outChunkSize) * 4;
    }

    if ((this.data[0].header.length % this.outChunkSize) === 0) {
      bufferSize -= 1;

      if (isTimestampExt) {
        bufferSize -= 4;
      }
    }

    let payloadOffset = 0;
    let payloadSize = this.data[0].header.length;
    let bufferOffset = 0;
    const buffer = Buffer.alloc(bufferSize);

    basicHeader.copy(buffer, 0);
    bufferOffset += basicHeader.length;

    messageHeader.copy(buffer, bufferOffset);
    bufferOffset += messageHeader.length;

    if (isTimestampExt) {
      buffer.writeUInt32BE(this.data[0].header.timestamp, bufferOffset);
      bufferOffset += 4;
    }

    while (payloadSize > 0) {
      if (payloadSize > this.outChunkSize) {
        // temp?: assume the data is only available at the first index
        this.data[0].payload.copy(
          buffer,
          bufferOffset,
          payloadOffset,
          payloadOffset + this.outChunkSize
        );
        payloadSize -= this.outChunkSize;
        bufferOffset += this.outChunkSize;
        payloadOffset += this.outChunkSize;

        type3BasicHeader.copy(buffer, bufferOffset);
        bufferOffset += type3BasicHeader.length;

        if (isTimestampExt) {
          buffer.writeUInt32BE(this.data[0].header.timestamp, bufferOffset);
          bufferOffset += 4;
        }
      } else {
        this.data[0].payload.copy(
          buffer,
          bufferOffset,
          payloadOffset,
          payloadOffset + payloadSize
        );
        bufferOffset += payloadSize;
        payloadOffset += payloadSize;
        payloadSize = 0;
      }
    }

    return buffer;
  }

  clearDataDups(): void {
    const data = this.data.reduce((acc: ChunkData[], chunk: ChunkData) => {
      const dupIndex = acc.findIndex((pChunk: ChunkData) => pChunk.header.csId === chunk.header.csId);

      if (dupIndex < 0 || !acc[dupIndex].isHandled) {
        return [
          ...acc,
          chunk
        ];
      }

      return [
        ...acc.slice(0, dupIndex),
        ...acc.slice(dupIndex + 1),
        chunk
      ];
    }, []);

    if (data.length < this.data.length && this.parser.last.chunkIndex > (data.length - 1)) {
      this.parser.last.chunkIndex = data.length - 1;
    }

    this.data = data;
  }

  clearDataForId(id: string): void {
    this.data = this.data.filter((item) => item.id.includes(id));
  }

  static parseCommand(packet: ChunkData): any[] {
    let payload = packet.payload;

    if (packet.header.type === ChunkTypesEnum.FLEX_MESSAGE) {
      payload = payload.slice(1, packet.header.length);
    }

    if (!payload) {
      return [];
    }

    const cmd: any[] = AMF0.decode(payload);
    return cmd;
  }

  // Specs [5.3.1.2.1.] @p14
  static formatExtTimestamp(timestamp: number, buffer: Buffer, offset: number, fmt: number): number {
    if (timestamp === 0xffffff) {
      return buffer.readUInt32BE(ChunkConsts.headerSizes[fmt] + offset);
    }

    return timestamp;
  }

  static generateBasicHeader(fmt: number, csId: number): Buffer {
    if (csId >= 64 + 255) {
      return Buffer.from([
        (fmt << 6) | 1,
        (csId - 64) & 0xff,
        ((csId - 64) >> 8) & 0xff,
      ]);
    }

    if (csId >= 64) {
      return Buffer.from([
        (fmt << 6) | 0,
        (csId - 64) & 0xff,
      ]);
    }

    return Buffer.from([ (fmt << 6) | csId ]);
  }

  static generateMessageHeader(header: ChunkHeader): Buffer {
    const bufferSize = ChunkConsts.headerSizes[header.fmt % 4];
    const buffer = Buffer.alloc(bufferSize);

    // TYPE 4 is empty
    if (header.fmt <= ChunkFMTEnum.TYPE_2) {
      if (header.timestamp >= 0xffffff) {
        buffer.writeUIntBE(0xffffff, 0, 3);
      } else {
        buffer.writeUIntBE(header.timestamp, 0, 3);
      }
    }

    if (header.fmt <= ChunkFMTEnum.TYPE_1) {
      buffer.writeUIntBE(header.length, 3, 3);
      buffer.writeUInt8(header.type, 6);
    }

    if (header.fmt === ChunkFMTEnum.TYPE_0) {
      buffer.writeUInt32LE(header.sId, 7);
    }

    return buffer;
  }

  /*
   * RTMP provides message headers in 4 different types
   * Type 0 - 11 bytes | timestamp | message len | msg type id | msg stream id |
   * Type 1 - 7 bytes | timestamp | msg len | msg type id |
   * Type 2 - 3 bytes | timestamp |
   * Type 4 - empty
   * */
  static parseMessageHeader(buffer: Buffer, offset: number, fmt: number): any {
    const header: {
      timestamp?: number,
      length?: number, 
      type?: number,
      sId?: number
    } = {};

    let iOffset = 0;

    if (fmt <= ChunkFMTEnum.TYPE_2) {
      header.timestamp = buffer.readUIntBE(offset + iOffset, 3);
      iOffset += 3;
    }

    if (fmt <= ChunkFMTEnum.TYPE_1) {
      header.length = buffer.readUIntBE(offset + iOffset, 3);
      header.type = buffer[offset + iOffset + 3];
      iOffset += 4;
    }

    if (fmt === ChunkFMTEnum.TYPE_0) {
      header.sId = buffer.readUInt32LE(offset + iOffset);
    }

    return header;
  }

  static findFMT(buffer: Buffer, offset: number): number {
    return buffer[0] >> 6;
  }

  static findCSID(buffer: Buffer, byteSize: number): number {
    if (byteSize === 2) {
      return 64 + buffer[1];
    }

    if (byteSize === 3) {
      return (64 + buffer[1] + buffer[2]) << 8;
    }

    return buffer[0] & 0x3f;
  }
}

export default RTMPChunkHelper;
