interface StreamData {
  metaPayload: Buffer;
  audio: {
    codec: number;
    codecHeader: Buffer;
    samplerate: number;
    channels: number;
  },
  video: {
    codec: number;
    codecHeader: Buffer;
    framerate: number;
    height: number;
    width: number;
  }
}

export default StreamData;
