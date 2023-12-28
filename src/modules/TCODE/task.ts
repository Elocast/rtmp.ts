import cProcess from 'child_process';
import fs from 'fs';

import TaskReference from './interfaces/TaskReference';
import StreamParams from './interfaces/StreamParams';
import FFInstance from './interfaces/FFInstance';

export class TCODETask {
  id: string;

  config: any;
  emitter: any; // either that, or GlobalEmitter

  params: StreamParams;
  task: TaskReference;

  ffmpeg: FFInstance;

  constructor(
    id: string,
    params: any, // temp fix
    //params: StreamParams,
    task: TaskReference,
    config: any,
    emitter: any
  ) {
    this.config = config;
    this.emitter = emitter;

    this.id = id;
    this.task = task;

    this.params = params;

    this.ffmpeg = {
      process: null,
      args: []
    };
  }

  onError(error: Error): void {
    console.error('[TCODE ERROR]', error.toString());
  }

  onClose(): void {
    this.emitter.emit('tcode.task.done', this.id, this.task.name, this.params);
  }

  async preUp(): Promise<void> {
    const streamNameSplit = this.params.streamName.split('_');

    const variables = {
      '{STREAM_DIR}': streamNameSplit[0],
      '{SEGMENT_DIR}': `s${streamNameSplit[2]}_${streamNameSplit[1]}`,
      '{RTMP_OUTPUT_PATH}': this.config.output_path
    };

    const outputPath = this.task.output_path
      .replace('{RTMP_OUTPUT_PATH}', variables['{RTMP_OUTPUT_PATH}'])
      .replace('{STREAM_DIR}', variables['{STREAM_DIR}'])
      .replace('{SEGMENT_DIR}', variables['{SEGMENT_DIR}']);

    await fs.promises.mkdir(outputPath, { recursive: true });

    this.ffmpeg.args = [
      ...['-loglevel', '0'],
      ...this.task.params.pre.flat(),
      ...['-i', `rtmp://0.0.0.0:${this.config.rtmp_port}${this.params.path}`],
      ...this.task.params.mid.flat(),
      ...this.task.params.out.flat(),
    ].map(str => str
      .replace('{OUTPUT_PATH}', outputPath)
      .replace('{FILENAME}', this.params.streamName)
    );
  }

  async up(): Promise<void> {
    await this.preUp();

    this.ffmpeg.process = cProcess.spawn(this.config.ffmpeg, this.ffmpeg.args);
    // do we care for the console output?
    this.ffmpeg.process.stderr.on('data', (error: Error) => this.onError(error));
    this.ffmpeg.process.on('close', () => this.onClose());

    this.emitter.emit('tcode.task.start', this.id, this.task.name, this.params);
  }

  down(): void {
    this.ffmpeg.process.kill();
  }
}

export default TCODETask;
