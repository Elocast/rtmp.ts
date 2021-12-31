import chai from 'chai';
import AMF0 from '../../src/support/amf/AMF0';
import AMF0Types from '../../src/support/amf/enumerators/AMF0DataTypes';

describe('NUMBER', () => {
  let output: Buffer;
  const value: number = 2;

  it('encode', () => {
    output = AMF0.encode(value);
    chai.assert.equal(output[0], AMF0Types.NUMBER);
  });

  it('decode', () => {
    const decoded: number = AMF0.decode(output);
    chai.assert.equal(typeof decoded[0], 'number');
    chai.assert.equal(decoded[0], value);
  });
});

describe('BOOLEAN', () => {
  let output: Buffer;
  const value: boolean = true;

  it('encode', () => {
    output = AMF0.encode(value);
    chai.assert.equal(output[0], AMF0Types.BOOL);
  });

  it('decode', () => {
    const decoded: boolean = AMF0.decode(output);
    chai.assert.equal(typeof decoded[0], 'boolean');
    chai.assert.equal(decoded[0], value);
  });
});

describe('STRING', () => {
  let output: Buffer;
  const value: string = 'patryk rocks';

  it('encode', () => {
    output = AMF0.encode(value);
    chai.assert.equal(output[0], AMF0Types.STRING);
  });

  it('decode', () => {
    const decoded: string = AMF0.decode(output);
    chai.assert.equal(typeof decoded[0], 'string');
    chai.assert.equal(decoded[0], value);
  });
});

describe('OBJECT', () => {
  let output: Buffer;
  const value: object = { text: 'violets are red', number: 32, bool: false };

  it('encode', () => {
    output = AMF0.encode(value);
    chai.assert.equal(output[0], AMF0Types.OBJ);
  });

  it('decode', () => {
    const decoded: object = AMF0.decode(output);

    chai.assert.equal(typeof decoded[0], 'object');
    chai.assert.equal(decoded[0].text, value.text);
    chai.assert.equal(decoded[0].number, value.number);
    chai.assert.equal(decoded[0].bool, value.bool);
  });
});

describe('NULL', () => {
  let output: Buffer;
  const value: null = null;

  it('encode', () => {
    output = AMF0.encode(value);
    console.log(output);
    chai.assert.equal(output[0], AMF0Types.NULL);
  });

  it('decode', () => {
    const decoded: object = AMF0.decode(output);
    chai.assert.equal(typeof decoded[0], 'object');
    chai.assert.equal(decoded[0] == value, true);
  });
});

describe('UNDEFINED', () => {
  let output: Buffer;
  const value: undefined = undefined;

  it('encode', () => {
    output = AMF0.encode(value);
    chai.assert.equal(output[0], AMF0Types.UNDEFINED);
  });

  it('decode', () => {
    const decoded: object = AMF0.decode(output);
    chai.assert.equal(typeof decoded[0], 'undefined');
    chai.assert.equal(decoded[0] === value, true);
  });
});

// we have no method for decoding ARRAY
// as well no method for encoding EMC_ARRAYS
