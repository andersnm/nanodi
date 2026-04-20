import { ServiceProvider } from '@nanodi/core';

export * from './decorators.js';
export * from './middlewares.js';
export * from './symbols.js';
export * from './Controller.js';

declare global {
  namespace Express {
    interface Request {
      scope: ServiceProvider;
    }
  }
}
