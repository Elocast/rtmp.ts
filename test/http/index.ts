import fs from 'fs';
import path from 'path';

import chai from 'chai';
import chaiHTTP from 'chai-http';

import Server from '../../src/modules/HTTP/server';

import config from './config';

chai.use(chaiHTTP);

const mockEmitter = {
  emit: () => {}
};

const server = new Server(config, mockEmitter);

before(() => {
  server.init();
  server.up();
});

after(() => {
  server.down();
});

describe('static', () => {
  describe('.m3u8', () => {
    let dirPath: string;
    let filePath: string;

    let httpFilePath: string;

    before(() => {
      const relativeDirPath = path.join('/', 'stream', 'hls');
      const relativeFilePath = path.join(relativeDirPath, 'output.m3u8');

      dirPath = path.join(config.output_path, relativeDirPath);
      filePath = path.join(config.output_path, relativeFilePath);

      httpFilePath = relativeFilePath;
    });

    after(async () => {
      await fs.promises.unlink(filePath);
    });

    it('doesnt exist. Serves empty playlist (200)', async () => {
      const resp = await chai.request(server.app).get('/test/test.m3u8');

      chai.assert.equal(resp.res.headers['x-content-status'], 'not-found');
      chai.assert.equal(resp.res.headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
      chai.assert.equal(resp.res.headers['content-length'], '104');
      chai.assert.equal(resp.res.statusCode, 200);
    });

    it('exists (200)', async () => {
      await fs.promises.mkdir(dirPath, { recursive: true });
      await fs.promises.writeFile(filePath, '');

      const resp = await chai.request(server.app).get(httpFilePath);

      chai.assert.equal(typeof resp.res.headers['x-content-status'], 'undefined');
      chai.assert.equal(resp.res.headers['content-length'], '0');
      chai.assert.equal(resp.res.statusCode, 200);
    });
  });
});
