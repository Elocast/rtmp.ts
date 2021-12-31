import crypto from 'crypto';

import HandshakeConsts from './constants/Handshake';
import HandshakeMFEnum from './enumerators/HandshakeMF';

export class RTMPHandshakeHelper {
  static generate(signature: Buffer): Buffer {
    const format = RTMPHandshakeHelper.findMF(signature);

    if (format === HandshakeMFEnum.TYPE_0) {
      return Buffer.concat([
        Buffer.alloc(1, 3),
        signature,
        signature,
      ]);
    } else {
      return Buffer.concat([
        Buffer.alloc(1, 3),
        RTMPHandshakeHelper.genS1(format),
        RTMPHandshakeHelper.genS2(format, signature),
      ]);
    }
  }

  static findSigDigestOffset(data: Buffer, offset: number): number {
    return (
      (data.reduce((a: number, b: number) => a + b, 0) % 728)
      + offset
    );
  }

  static genHmac(data: Buffer, key: string | Buffer): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  static findMF(signature: Buffer): number {
    let format = HandshakeMFEnum.TYPE_0;
    let done = false;
    let loop = 0;

    while(!done && loop < 2) {
      const offset = loop === 0 ? 8 : 772;

      const dOffset = RTMPHandshakeHelper.findSigDigestOffset(
        signature.slice(offset, offset + 4),
        offset + 4
      );

      const message = Buffer.concat([
        signature.slice(0, dOffset),
        signature.slice(dOffset + HandshakeConsts.SHA256DigestLength)
      ], 1504);

      const nSignature = RTMPHandshakeHelper.genHmac(message, HandshakeConsts.GenuineFPKey);
      const oSignature = signature.slice(dOffset, dOffset + HandshakeConsts.SHA256DigestLength);

      if (nSignature.equals(oSignature)) {
        if (loop === 0) {
          format = HandshakeMFEnum.TYPE_1;
        } else {
          format = HandshakeMFEnum.TYPE_2;
        }

        done = true;
      }

      loop += 1;
    }

    return format;
  }

  static genClientFPSig(type: number): Buffer {
    const buffer = Buffer.concat([
      Buffer.from([0, 0, 0, 0, 1, 2, 3, 4]),
      crypto.randomBytes(HandshakeConsts.size - 8)
    ], HandshakeConsts.size);

    const offset = type === HandshakeMFEnum.TYPE_1
      ? RTMPHandshakeHelper.findSigDigestOffset(buffer.slice(8, 12), 12)
      : RTMPHandshakeHelper.findSigDigestOffset(buffer.slice(772, 776), 776);

    const message = Buffer.concat([
      buffer.slice(0, offset),
      buffer.slice(offset + HandshakeConsts.SHA256DigestLength)
    ], HandshakeConsts.size - HandshakeConsts.SHA256DigestLength);

    const hash = RTMPHandshakeHelper.genHmac(message, HandshakeConsts.GenuineFPKey);
    hash.copy(buffer, offset, 0, 32);

    return buffer;
  }

  static genS1(type: number): Buffer {
    const buffer = Buffer.concat([
      Buffer.from([0, 0, 0, 0, 1, 2, 3, 4]),
      crypto.randomBytes(HandshakeConsts.size - 8)
    ], HandshakeConsts.size);

    const offset = type === HandshakeMFEnum.TYPE_1
      ? RTMPHandshakeHelper.findSigDigestOffset(buffer.slice(8, 12), 12)
      : RTMPHandshakeHelper.findSigDigestOffset(buffer.slice(772, 776), 776);

    const message = Buffer.concat([
      buffer.slice(0, offset),
      buffer.slice(offset + HandshakeConsts.SHA256DigestLength)
    ], HandshakeConsts.size - HandshakeConsts.SHA256DigestLength);

    const hash = RTMPHandshakeHelper.genHmac(message, HandshakeConsts.GenuineFMSKey);
    hash.copy(buffer, offset, 0, 32);

    return buffer;
  }

  static genS2(type: number, cSignature: Buffer): Buffer {
    const offset = type === HandshakeMFEnum.TYPE_1
      ? RTMPHandshakeHelper.findSigDigestOffset(cSignature.slice(8, 12), 12)
      : RTMPHandshakeHelper.findSigDigestOffset(cSignature.slice(772, 776), 776);

    const challengeKey = cSignature.slice(offset, offset + 32);
    const fillerBuffer = crypto.randomBytes(HandshakeConsts.size - 32);

    const oSignature = RTMPHandshakeHelper.genHmac(
      fillerBuffer,
      RTMPHandshakeHelper.genHmac(
        challengeKey,
        Buffer.concat([
          Buffer.from(HandshakeConsts.GenuineFMSKey, 'utf8'),
          crypto.randomBytes(32)
        ])
      )
    );

    const buffer = Buffer.concat([
      fillerBuffer,
      oSignature
    ], HandshakeConsts.size);

    return buffer;
  }
}

export default RTMPHandshakeHelper;
