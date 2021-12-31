export class ChunkConstants {
  static readonly defaultChunkSize = 128;

  static readonly headerMaxSize = 18;

  /*
   * RTMP protocol supports multiple HEADER types
   * type is defined in BASIC HEADER (2 first bytes)
   */
  static readonly headerSizes = [11, 7, 3, 0];

  static readonly defaultDataObj = {
    payload: Buffer.alloc(0),
    extTimestamp: 0,
    timer: 0,
    byteSize: 0,
    capacity: 0,
    isParsed: false,
    isHandled: false,
    header: {
      fmt: -1,
      csId: -1,
      timestamp: -1,
      sId: -1,
      length: 0,
      type: -1,
    }
  };
}

export default ChunkConstants;
