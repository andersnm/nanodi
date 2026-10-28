import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { registrationSymbol, ServiceCollection, type ServiceProvider } from "@nanodi/core";
import { type Controller, RequestKey, requestHandler, requestScopeMiddleware, ResponseKey } from "@nanodi/express";

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
  services.registerScopedValue(RequestKey);
  services.registerScopedValue(ResponseKey);
  return services;
}

function createServices() {
  const services = createBaseServices();
  services.registerClass(ResourceKey, "scoped", Resource);
  return services;
}

function createApp(provider: ServiceProvider) {
  const app = express();
  app.use(requestScopeMiddleware(provider, { onDisposeError: err => assert.fail(String(err)) }));
  return app;
}

async function listen(t: TestContext, app: express.Application): Promise<string> {
  const server = http.createServer(app);
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

    async handle(req: express.Request, res: express.Response) {
      resource = this.resource;
      res.send("ok");
    }
  }

  services.registerClass(TestController, "scoped", TestController, ResourceKey);

  const app = createApp(services.createProvider());
  app.use(requestHandler("get", "/", [], TestController));
  const url = await listen(t, app);

  const response = await get(url);
  assert.strictEqual(response.body, "ok");

  await resource!.disposedPromise;
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

    async handle(req: express.Request, res: express.Response) {
      resource = this.resource;
      res.once("close", () => closed.resolve());
      started.resolve();

      await gate.promise;
      result.resolve({ disposedAfterClose: this.resource.disposed });
    }
  }

  services.registerClass(SlowController, "scoped", SlowController, ResourceKey);

  const app = createApp(services.createProvider());
  app.use(requestHandler("get", "/", [], SlowController));
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

test("Controller: Errors are passed to the error handler", async (t) => {
  const services = createBaseServices();

  class FailingController implements Controller {
    async handle() {
      throw new Error("controller failed");
    }
  }

  services.registerClass(FailingController, "scoped", FailingController);

  const app = createApp(services.createProvider());
  app.use(requestHandler("get", "/", [], FailingController));
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).send(err.message);
  });
  const url = await listen(t, app);

  const response = await get(url);
  assert.deepStrictEqual(response, { status: 500, body: "controller failed" });
});

test("Controller: Throws a clear error without requestScopeMiddleware", async (t) => {
  const services = createBaseServices();

  class TestController implements Controller {
    async handle(req: express.Request, res: express.Response) {
      res.send("ok");
    }
  }

  services.registerClass(TestController, "scoped", TestController);
  services.createProvider();

  const app = express();
  app.use(requestHandler("get", "/", [], TestController));
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).send(err.message);
  });
  const url = await listen(t, app);

  const response = await get(url);
  assert.strictEqual(response.status, 500);
  assert.match(response.body, /req.scope is missing/);
});

test("Legacy async handler: retain() keeps req.scope alive after a client disconnect", async (t) => {
  const services = createServices();
  const started = deferred();
  const closed = deferred();
  const gate = deferred();
  const result = deferred<boolean>();
  let resource: Resource | undefined;

  const app = createApp(services.createProvider());
  app.get("/", async (req, res) => {
    const hold = req.scope.retain();
    try {
      resource = req.scope.resolve(ResourceKey);
      res.once("close", () => closed.resolve());
      started.resolve();

      await gate.promise;
      result.resolve(resource.disposed);
    } finally {
      await hold[Symbol.asyncDispose]();
    }
  });
  const url = await listen(t, app);

  const abort = getAndAbort(url);
  await started.promise;
  abort();
  await closed.promise;

  gate.resolve();
  assert.strictEqual(await result.promise, false, "Handler can use services after the client disconnected");

  await resource!.disposedPromise;
});

test("Legacy callback handler: retain() keeps req.scope alive until released in the callback", async (t) => {
  const services = createServices();
  const closed = deferred();
  const result = deferred<boolean>();
  let resource: Resource | undefined;
  let completeQuery: (() => void) | undefined;
  const started = deferred();

  // Callback-style API, like a legacy DB driver
  function query(callback: () => void) {
    completeQuery = callback;
    started.resolve();
  }

  const app = createApp(services.createProvider());
  app.get("/", (req, res) => {
    const hold = req.scope.retain();
    resource = req.scope.resolve(ResourceKey);
    res.once("close", () => closed.resolve());

    query(() => {
      result.resolve(resource!.disposed);
      hold[Symbol.asyncDispose]();
    });
  });
  const url = await listen(t, app);

  const abort = getAndAbort(url);
  await started.promise;
  abort();
  await closed.promise;

  completeQuery!();
  assert.strictEqual(await result.promise, false, "Callback can use services after the client disconnected");

  await resource!.disposedPromise;
});

test("Legacy handler without retain(): req.scope is disposed when the response closes", async (t) => {
  const services = createServices();
  const started = deferred();
  let resource: Resource | undefined;

  const app = createApp(services.createProvider());
  app.get("/", async (req, res) => {
    resource = req.scope.resolve(ResourceKey);
    started.resolve();
    // Never responds
  });
  const url = await listen(t, app);

  const abort = getAndAbort(url);
  await started.promise;
  abort();

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

    async handle(req: express.Request, res: express.Response) {
      started.resolve();
      await gate.promise;
      res.send("done");
    }
  }

  const services = createBaseServices();
  services.registerClass(Pool, "singleton", Pool);
  services.registerClass(Connection, "scoped", Connection, Pool);
  services.registerClass(TestController, "scoped", TestController, Connection);

  const root = services.createProvider();
  const app = createApp(root);
  app.use(requestHandler("get", "/", [], TestController));
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
