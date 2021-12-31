import HandshakeStateEnum from '../enumerators/HandshakeState';

interface Handshake {
  state: HandshakeStateEnum,
  byteSize: number,
  payload: Buffer | null,
}

export default Handshake;
