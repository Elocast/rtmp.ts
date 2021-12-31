enum ChunkTypes {
  SET_CHUNK_SIZE = 1,
  ABORT = 2,
  ACKNOWLEDGEMENT = 3,
  EVENT = 4,
  WINDOW_ACK_SIZE = 5,
  SET_PEER_BANDWIDTH = 6,
  // 7?
  AUDIO = 8,
  VIDEO = 9,
  // 10-14?
  FLEX_STREAM = 15,
  // 16?
  FLEX_MESSAGE = 17,
  DATA =  18,
  SHARED_OBJECT = 19,
  INVOKE = 20,
  METADATA = 22
}

export default ChunkTypes;
