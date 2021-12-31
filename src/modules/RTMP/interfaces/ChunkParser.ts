import ChunkParserStateEnum from '../enumerators/ChunkParserState';

interface ChunkParser {
  byteSize: number;
  buffer: Buffer;
  state: ChunkParserStateEnum;
  basicHeaderByteSize: number;
  last: {
    byteSize: number;
    reqId: string | null;
    chunkIndex: number;
  };
}

export default ChunkParser;
