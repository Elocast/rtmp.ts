import TCODETask from './task';

import { v4 as uuidv4 } from 'uuid';

export class TCODEManager {
  config: any;
  emitter: any; // either that, or GlobalEmitter

  tasks: TCODETask[];

  constructor(config: any, emitter: any) {
    this.config = config;
    this.emitter = emitter;

    this.tasks = [];
  }

  onPublish(path: string, args: string, sId: string ): void {
    const rtmpApp = path.split('/')[1];

    const id = uuidv4();

    for (let i = 0; i < this.config.flow.tcode.tasks.length; i++) {
      const task = this.config.flow.tcode.tasks[i];

      if (task.source === rtmpApp) {
        const taskInstance = new TCODETask(id, { path, args, streamName: sId }, task, this.config, this.emitter);
        taskInstance.up();

        this.tasks.push(taskInstance);
        // donePublish is PROBABLY not needed. FFMPEG should stop on its own when RTMP source ends
        // forcing process to stop might corrupt the output
        //this.emitter.on('donePublish', (...args) => taskInstance.down());
      }
    }
  }

  up(): void {
    this.emitter.emit('tcode.handler.up');
    this.emitter.on('rtmp.client.publish.authorized', (path: string, args: string, sId: string ) => this.onPublish(path, args, sId));
  }

  down(): void {
    for (let i = 0; i < this.tasks.length; i++) {
      this.tasks[i].down();
    }
  }
}

export default TCODEManager;
