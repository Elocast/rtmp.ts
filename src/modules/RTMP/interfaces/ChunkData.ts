import ChunkHeader from './ChunkHeader';

interface ChunkData {
  payload: Buffer;
  extTimestamp: number;
  timer: number;
  byteSize: number;
  capacity: number;
  isAwaiting?: boolean;
  isStarted?: boolean;
  isParsed?: boolean;
  isHandled?: boolean;
  id: string[];
  header: ChunkHeader;
}

export default ChunkData;
