import { EventEmitter } from 'events';

export class GlobalEmitter {
  events: EventEmitter;

  constructor() {
    this.events = new EventEmitter();
  }

  on(event: string, handler: any): void {
    this.events.on(event, handler);
  }

  emit(event: string, ...params: any[]): void {
    console.log(`[Global Emitter] [${event}]: ${params.length} params`);
    this.events.emit(event, ...params);
  }
}

export default GlobalEmitter;
