enum ChunkParserState {
  INIT = 0,
  BASIC_HEADER = 1,
  MESSAGE_HEADER = 2,
  EXT_TIMESTAMP = 3,
  PRE_PAYLOAD = 4,
  PAYLOAD = 5,
  DONE = 6,
}

export default ChunkParserState;
