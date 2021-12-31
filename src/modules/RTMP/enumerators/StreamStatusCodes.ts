enum StreamStatusCode {
  BEGIN = 0x00,
  EOF = 0x01,
  DRY = 0x02,
  EMPTY = 0x1f,
  READY = 0x20,
}

export default StreamStatusCode;
