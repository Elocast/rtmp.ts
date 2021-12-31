import { Request as ExpressRequest } from 'express';

export interface Request extends ExpressRequest {
  emitter?: any;
}

export default Request;
