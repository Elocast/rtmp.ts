import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';

import * as ExpressTypes from './interfaces/express';

export class HTTPServer {
  config: any;
  emitter: any; // either that, or GlobalEmitter

  app: express.Application;
  server: http.Server;

  constructor(config: any, emitter: any) {
    this.config = config;
    this.emitter = emitter;

    this.app = express();
    this.server = http.createServer(this.app);
  }

  init(): void {
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());

    this.app.use((
      req: ExpressTypes.Request,
      res: ExpressTypes.Response,
      next: ExpressTypes.Next
    ) => {
      req.emitter = this.emitter;
      next();
    });


    // routes


    // serves static files
    this.app.use(express.static(this.config.output_path));

    // prevents video players from crashing
    // the player will attempt to fetch a '/live0.ts' file,
    // it will fail, and retry the request, assuming its not procesed yet.
    //
    // m3u8 files aren't always treated that way.
    this.app.use('*.m3u8', (
      req: ExpressTypes.Request,
      res: ExpressTypes.Response
    ) => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:8',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXTINF:0.000000,',
        'live0.ts'
      ];

      res.type('application/vnd.apple.mpegurl');
      res.set('x-content-status', 'not-found');
      res.status(200).send(manifest.join('\r\n'));
    });
  }

  up(): void {
    this.emitter.emit('http.server.up');
    this.server.listen(this.config.http_port);
  }

  down(): void {
    this.server.close();
  }
}

export default HTTPServer;
