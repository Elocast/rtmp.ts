import DataTypesEnum from './enumerators/AMF0DataTypes';

export class AMF0Encode {
  static fromUnknown(data: any): Buffer {
    switch(typeof data) {
      case 'number': return AMF0Encode.fromNumber(data);
      case 'boolean': return AMF0Encode.fromBool(data);
      case 'string': return AMF0Encode.fromString(data);
      case 'undefined': return AMF0Encode.fromUndefined();
      case 'object':
        if (data == null) {
          return AMF0Encode.fromNull();
        }

        if (data instanceof Array) {
          return AMF0Encode.fromArray(data);
        }

        return AMF0Encode.fromObject(data);
      default:
        return Buffer.alloc(0);
    }
  }

  static fromNumber(data: number): Buffer {
    const buffer = Buffer.alloc(9);
    buffer.writeUInt8(DataTypesEnum.NUMBER, 0);
    buffer.writeDoubleBE(data, 1);

    return buffer;
  }

  static fromBool(data: boolean): Buffer {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(DataTypesEnum.BOOL, 0);
    buffer.writeUInt8(+data, 1);

    return buffer;
  }

  static fromString(data: string): Buffer {
    const hBuffer = Buffer.alloc(3);
    hBuffer.writeUInt8(DataTypesEnum.STRING, 0);
    hBuffer.writeUInt16BE(data.length, 1);

    const dBuffer = Buffer.from(data, 'utf8');

    return Buffer.concat([ hBuffer, dBuffer ]);
  }

  static fromUString(data: string): Buffer {
    const buffer = Buffer.from(data, 'utf8');

    const hBuffer = Buffer.alloc(2);
    hBuffer.writeUInt16BE(buffer.length, 0);

    return Buffer.concat([ hBuffer, buffer]);
  }

  static fromUndefined(): Buffer {
    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(DataTypesEnum.UNDEFINED, 0);

    return buffer;
  }

  static fromNull(): Buffer {
    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(DataTypesEnum.NULL, 0);

    return buffer;
  }

  static fromArray(data: any[]): Buffer {
    const hBuffer = Buffer.alloc(5);
    hBuffer.writeUInt8(DataTypesEnum.ARRAY, 0);
    hBuffer.writeUInt32BE(data.length, 1);

    const buffList: Buffer[] = [];
    data.forEach((item: any) => buffList.push(AMF0Encode.fromUnknown(item)));

    return Buffer.concat([ hBuffer, ...buffList ]);
  }

  static fromObject(data: any): Buffer {
    const hBuffer = Buffer.alloc(1);
    hBuffer.writeUInt8(DataTypesEnum.OBJ, 0);

    const eBuffer = Buffer.alloc(1);
    eBuffer.writeUInt8(DataTypesEnum.OBJ_END, 0);

    const buffList: Buffer[] = [];
    Object.keys(data).forEach((key: any) => {
      const iBuffer = Buffer.concat([
        AMF0Encode.fromUString(key),
        AMF0Encode.fromUnknown(data[key]),
      ]);

      buffList.push(iBuffer);
    });

    return Buffer.concat([ hBuffer, ...buffList, AMF0Encode.fromUString(''), eBuffer ]);
  }
}

export default AMF0Encode;
