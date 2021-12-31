import chai from 'chai';
import crypto from 'crypto';

import HandshakeHelper from '../../src/modules/RTMP/handshake';
import HandshakeConsts from '../../src/modules/RTMP/constants/Handshake';

describe('Handshake', () => {
  describe('.findMF() (check message format)', () => {
    it('should return 0. Empty buffer', () => {
      const buffer: Buffer = Buffer.from(new Array(1000).fill(0));
      const format: number = HandshakeHelper.findMF(buffer);

      chai.assert.equal(format, 0);
    });

    it('should return 0 - C0', () => {
      const buffer: Buffer = Buffer.alloc(8);
      buffer.writeUInt8(3);
      const format: number = HandshakeHelper.findMF(buffer);

      chai.assert.equal(format, 0);
    });

    it('should return 0 - C1 according to Adobe specs', () => {
      const buffer: Buffer = crypto.randomBytes(HandshakeConsts.size);
      buffer.writeUInt32BE(Date.now() / 1000, 0);
      buffer.writeUInt32BE(0, 4);

      const format: number = HandshakeHelper.findMF(buffer);

      chai.assert.equal(format, 0);
    });

    // not specified in specs. Official Adobe Flash Client expect C1 & S2 formatted differently
    // some clients pretend to be AF Clients or AF Servers
    it('should return 1 - C1 AFC', () => {
      const buffer = HandshakeHelper.genClientFPSig(1);

      const format: number = HandshakeHelper.findMF(buffer);

      chai.assert.equal(format, 1);
    });

    it('should return 2 - C2 AFC', () => {
      const buffer = HandshakeHelper.genClientFPSig(2);

      const format: number = HandshakeHelper.findMF(buffer);

      chai.assert.equal(format, 2);
    });
  });

  describe('.generate() (S1/S2)', () => {
    it('should return TYPE0', () => {
      const buffer: Buffer = crypto.randomBytes(HandshakeConsts.size);
      buffer.writeUInt32BE(Date.now() / 1000, 0);
      buffer.writeUInt32BE(0, 4);

      const output = HandshakeHelper.generate(buffer);
      const expectedOutput = Buffer.concat([
        buffer,
        buffer
      ]);

      chai.assert.equal(output.slice(1).equals(expectedOutput), true);
    });

    it('should NOT return TYPE0', () => {
      const buffer = HandshakeHelper.genClientFPSig(1);
      const output = HandshakeHelper.generate(buffer);

      const bOutput = Buffer.concat([
        buffer,
        buffer
      ]);

      chai.assert.equal(output.slice(1).equals(bOutput), false);
    });
  });
});
