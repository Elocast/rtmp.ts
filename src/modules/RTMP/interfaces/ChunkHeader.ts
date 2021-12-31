interface ChunkHeader {
  fmt: number; // defines header type
  csId: number; // stream chunk id
  timestamp: number;
  sId: number;
  length: number;
  type: number;
}

export default ChunkHeader;
