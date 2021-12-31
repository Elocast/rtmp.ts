import DataTypesEnum from './enumerators/AMF0DataTypes';

import AMF0Decode from './AMF0Decode';
import AMF0Encode from './AMF0Encode';

export class AMF0 {
  static encode(data: any): Buffer {
    return AMF0Encode.fromUnknown(data);
  }

  static decode(buffer: Buffer): any[] {
    const output = [];

    let iOffset = 0;

    if (buffer.length) {
      while (iOffset <= buffer.length) {
        try {
          const item = AMF0Decode.toUnknown(buffer.slice(iOffset));

          if (!item || item[0] < 1) {
            iOffset += 1;
            break;
          }

          iOffset += item[0];
          output.push(item[1]);
        } catch(err) {
          iOffset += 1;
        }
      }
    }

    return output;
  }

}

export default AMF0;
