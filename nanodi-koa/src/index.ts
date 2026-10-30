import { ServiceProvider } from '@nanodi/core';

export * from './decorators.js';
export * from './middlewares.js';
export * from './symbols.js';
export * from './Controller.js';

declare module 'koa' {
  interface DefaultContext {
    scope: ServiceProvider;
  }
}
