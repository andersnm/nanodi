import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import Koa from "koa";
import Router from "@koa/router";
import { registrationSymbol, ServiceCollection, type ServiceProvider } from "@nanodi/core";
import { type Controller, ContextKey, requestHandler, requestScopeMiddleware } from "@nanodi/koa";

class Resource {
  disposed = false;
  disposedPromise: Promise<void>;
  private resolveDisposed!: () => void;

  constructor() {
    this.disposedPromise = new Promise(resolve => this.resolveDisposed = resolve);
  }

  async [Symbol.asyncDispose]() {
    this.disposed = true;
    this.resolveDisposed();
  }
}

const ResourceKey = registrationSymbol<Resource>("Resource");

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => resolve = r);
  return { promise, resolve };
}

function createBaseServices() {
  const services = new ServiceCollection();
  services.registerScopedValue(ContextKey);
  return services;
}

function createServices() {
  const services = createBaseServices();
  services.registerClass(ResourceKey, "scoped", Resource);
  return services;
}

async function errorHandler(ctx: Koa.Context, next: Koa.Next) {
  try {
    await next();
  } catch (err) {
    ctx.status = 500;
    ctx.body = (err as Error).message;
  }
}

function createApp(provider: ServiceProvider) {
  const app = new Koa();
  app.use(errorHandler);
  app.use(requestScopeMiddleware(provider, { onDisposeError: err => assert.fail(String(err)) }));
  return app;
}

function useController(app: Koa, key: new (...args: any[]) => Controller) {
  const router = new Router();
  requestHandler(router, "get", "/", [], key);
  app.use(router.routes());
}

async function listen(t: TestContext, app: Koa): Promise<string> {
  const server = http.createServer(app.callback());
  await new Promise<void>(resolve => server.listen(0, resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const { port } = server.address() as AddressInfo;
  return `http://localhost:${port}`;
}

function get(url: string): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, { agent: false }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    }).on("error", reject);
  });
}

/** Starts a request and returns a function that aborts it, like a client disconnecting. */
function getAndAbort(url: string): () => void {
  const req = http.get(url, { agent: false });
  req.on("error", () => {});
  return () => req.destroy();
}

test("Controller: Request scope is disposed after the response", async (t) => {
  const services = createServices();
  let resource: Resource | undefined;

  class TestController implements Controller {
    resource: Resource;
    constructor(resource: Resource) {
      this.resource = resource;
    }

    async handle(ctx: Koa.Context) {
      resource = this.resource;
      ctx.body = "ok";
    }
  }

  services.registerClass(TestController, "scoped", TestController, ResourceKey);

  const app = createApp(services.createProvider());
  useController(app, TestController);
  const url = await listen(t, app);

  const response = await get(url);
  assert.strictEqual(response.body, "ok");

  await resource!.disposedPromise;
});

test("Controller: ContextKey resolves the Koa context", async (t) => {
  const services = createBaseServices();

  class TestController implements Controller {
    ctx: Koa.Context;
    constructor(ctx: Koa.Context) {
      this.ctx = ctx;
    }

    async handle(ctx: Koa.Context) {
      ctx.body = String(this.ctx === ctx);
    }
  }

  services.registerClass(TestController, "scoped", TestController, ContextKey);

  const app = createApp(services.createProvider());
  useController(app, TestController);
  const url = await listen(t, app);

  assert.strictEqual((await get(url)).body, "true");
});

test("Controller: Scope outlives a client disconnect until handle() settles", async (t) => {
  const services = createServices();
  const started = deferred();
  const closed = deferred();
  const gate = deferred();
  const result = deferred<{ disposedAfterClose: boolean }>();
  let resource: Resource | undefined;

  class SlowController implements Controller {
    resource: Resource;
    constructor(resource: Resource) {
      this.resource = resource;
    }

    async handle(ctx: Koa.Context) {
      resource = this.resource;
      ctx.res.once("close", () => closed.resolve());
      started.resolve();

      await gate.promise;
      result.resolve({ disposedAfterClose: this.resource.disposed });
    }
  }

  services.registerClass(SlowController, "scoped", SlowController, ResourceKey);

  const app = createApp(services.createProvider());
  useController(app, SlowController);
  const url = await listen(t, app);

  const abort = getAndAbort(url);
  await started.promise;
  abort();
  await closed.promise;

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(resource!.disposed, false, "Scope must not be disposed while the controller runs");

  gate.resolve();
  assert.deepStrictEqual(await result.promise, { disposedAfterClose: false }, "Controller can use services after the client disconnected");

  await resource!.disposedPromise;
});

test("Controller: Errors propagate to upstream middleware", async (t) => {
  const services = createBaseServices();

  class FailingController implements Controller {
    async handle() {
      throw new Error("controller failed");
    }
  }

  services.registerClass(FailingController, "scoped", FailingController);

  const app = createApp(services.createProvider());
  useController(app, FailingController);
  const url = await listen(t, app);

  const response = await get(url);
  assert.deepStrictEqual(response, { status: 500, body: "controller failed" });
});

test("Controller: Throws a clear error without requestScopeMiddleware", async (t) => {
  const services = createBaseServices();

  class TestController implements Controller {
    async handle(ctx: Koa.Context) {
      ctx.body = "ok";
    }
  }

  services.registerClass(TestController, "scoped", TestController);
  services.createProvider();

  const app = new Koa();
  app.use(errorHandler);
  useController(app, TestController);
  const url = await listen(t, app);

  const response = await get(url);
  assert.strictEqual(response.status, 500);
  assert.match(response.body, /ctx.scope is missing/);
});

test("Plain middleware: ctx.scope is held until the middleware settles, without retain()", async (t) => {
  const services = createServices();
  const started = deferred();
  const closed = deferred();
  const gate = deferred();
  const result = deferred<boolean>();
  let resource: Resource | undefined;

  const app = createApp(services.createProvider());
  app.use(async ctx => {
    resource = ctx.scope.resolve(ResourceKey);
    ctx.res.once("close", () => closed.resolve());
    started.resolve();

    await gate.promise;
    result.resolve(resource.disposed);
  });
  const url = await listen(t, app);

  const abort = getAndAbort(url);
  await started.promise;
  abort();
  await closed.promise;

  gate.resolve();
  assert.strictEqual(await result.promise, false, "Middleware can use services after the client disconnected");

  await resource!.disposedPromise;
});

test("Streamed body: Scope is not disposed until the response is written", async (t) => {
  const services = createServices();
  const gate = deferred();
  let resource: Resource | undefined;

  const app = createApp(services.createProvider());
  app.use(async ctx => {
    resource = ctx.scope.resolve(ResourceKey);
    const r = resource;
    ctx.body = Readable.from((async function* () {
      yield "a";
      await gate.promise;
      yield String(r.disposed);
    })());
  });
  const url = await listen(t, app);

  const response = get(url);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(resource!.disposed, false, "Scope must not be disposed while the body streams");

  gate.resolve();
  assert.strictEqual((await response).body, "afalse");

  await resource!.disposedPromise;
});

test("Root disposal waits for in-flight requests", async (t) => {
  const log: string[] = [];
  const started = deferred();
  const gate = deferred();

  class Pool {
    [Symbol.dispose]() {
      log.push("pool");
    }
  }

  class Connection {
    pool: Pool;
    constructor(pool: Pool) {
      this.pool = pool;
    }
    [Symbol.dispose]() {
      log.push("connection");
    }
  }

  class TestController implements Controller {
    connection: Connection;
    constructor(connection: Connection) {
      this.connection = connection;
    }

    async handle(ctx: Koa.Context) {
      started.resolve();
      await gate.promise;
      ctx.body = "done";
    }
  }

  const services = createBaseServices();
  services.registerClass(Pool, "singleton", Pool);
  services.registerClass(Connection, "scoped", Connection, Pool);
  services.registerClass(TestController, "scoped", TestController, Connection);

  const root = services.createProvider();
  const app = createApp(root);
  useController(app, TestController);
  const url = await listen(t, app);

  const response = get(url);
  await started.promise;

  let rootDisposed = false;
  const rootDispose = root[Symbol.asyncDispose]().then(() => { rootDisposed = true; });

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(rootDisposed, false, "Root must wait for the in-flight request");

  gate.resolve();
  assert.strictEqual((await response).body, "done");
  await rootDispose;

  assert.deepStrictEqual(log, ["connection", "pool"]);
});
