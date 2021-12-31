enum DataTypes {
  NUMBER = 0x00,
  BOOL = 0x01,
  STRING = 0x02,
  OBJ = 0x03,
  // 0x04 map?
  NULL = 0x05,
  UNDEFINED = 0x06,
  // 0x07 ref
  // 
  ECMA_ARRAY = 0x08,
  OBJ_END = 0x09,
  ARRAY = 0x0A,
  DATE = 0x0B,
}

export default DataTypes;
