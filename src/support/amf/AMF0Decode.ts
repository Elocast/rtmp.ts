import DataTypesEnum from './enumerators/AMF0DataTypes';

export class AMF0Decode {
  static toUnknown(buffer: Buffer): [number, any] {
    if (buffer.length < 1) {
      return [0, null];
    }

    const typeCode: number = buffer.readUInt8(0);

    switch(typeCode) {
      case DataTypesEnum.NUMBER: return AMF0Decode.toNumber(buffer);
      case DataTypesEnum.BOOL: return AMF0Decode.toBool(buffer);
      case DataTypesEnum.STRING: return AMF0Decode.toString(buffer);
      case DataTypesEnum.OBJ: return AMF0Decode.toObject(buffer);
      case DataTypesEnum.NULL: return AMF0Decode.toNull(buffer);
      case DataTypesEnum.UNDEFINED: return AMF0Decode.toUndefined(buffer);
      case DataTypesEnum.ECMA_ARRAY: return AMF0Decode.toAObject(buffer);
      //case DataTypesEnum.OBJ_END:
      //case DataTypesEnum.ARRAY:
      //case DataTypesEnum.DATE:
      default: {
        return [0, null];
      }
    }
  }

  static toNumber(buffer: Buffer): [number, number] {
    return [
      9,
      buffer.readDoubleBE(1),
    ];
  }

  static toBool(buffer: Buffer): [number, boolean] {
    return [ 2, !!(buffer.readUInt8(1)) ];
  }

  /*
   * untyped string
   * this datatype has no int key
   * */
  static toUString(buffer: Buffer): [number, string] {
    const length = buffer.readUInt16BE(0);

    return [ length + 2,
      buffer.toString('utf8', 2, length + 2)
    ];
  }

  static toString(buffer: Buffer): [number, string] {
    const length = buffer.readUInt16BE(1);

    return [ length + 3,
      buffer.toString('utf8', 3, length + 3)
    ];
  }

  static toNull(buffer: Buffer): [number, null] {
    return [ 1, null ];
  }

  static toUndefined(buffer: Buffer): [number, undefined] {
    return [ 1, undefined ];
  }

  static toObject(buffer: Buffer): [number, object] {
    let output: object = {};

    // skip first bit, its an object opening sign
    let length = 1;
    let iOffset = 1;

    while (iOffset < buffer.length && buffer.readUInt8(iOffset) !== DataTypesEnum.OBJ_END) {
      const key = AMF0Decode.toUString(buffer.slice(iOffset));
      iOffset += key[0];
      length += key[0];

      if (iOffset >= buffer.length) {
        break;
      }

      if (buffer.slice(iOffset).readUInt8(0) === DataTypesEnum.OBJ_END) {
        iOffset += 1;
        length += 1;
        break;
      }

      const value: [number, string] = AMF0Decode.toUnknown(buffer.slice(iOffset));

      iOffset += value[0];
      length += value[0];

      // TS is dumb
      output = {
        ...output,
        [key[1]]: value[1]
      };
    }

    return [
      length,
      output,
    ];
  }

  // it seems like the easiest way to process those kind of arrays
  // we use it to parse META DATA packet, and it comes packed like an OBJ,
  // while having an ARRAY prefix
  static toAObject(buffer: Buffer): [number, any] {
    return AMF0Decode.toObject(buffer.slice(4));
  }
}

export default AMF0Decode;
