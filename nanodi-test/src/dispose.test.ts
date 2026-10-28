import test from "node:test";
import assert from "node:assert/strict";
import { ServiceCollection, ServiceProvider } from "@nanodi/core";

function createTracker() {
  const log: string[] = [];

  class SyncResource {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    [Symbol.dispose]() {
      log.push(this.name);
    }
  }

  class AsyncResource {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    async [Symbol.asyncDispose]() {
      await new Promise(resolve => setTimeout(resolve, 1));
      log.push(this.name);
    }
  }

  return { log, SyncResource, AsyncResource };
}

test("Dispose: Scope disposes owned scoped instances in reverse creation order", async () => {
  const { log, SyncResource, AsyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerFactory("first", "scoped", () => new SyncResource("first"));
  services.registerFactory("second", "scoped", (provider) => {
    provider.resolve("first");
    return new AsyncResource("second");
  });

  const scope = services.createProvider().createScope();
  scope.resolve("second");

  await scope[Symbol.asyncDispose]();

  assert.deepStrictEqual(log, ["second", "first"], "Dependents are disposed before their dependencies");
});

test("Dispose: Values, scoped values and transients are not disposed", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerValue("value", new SyncResource("value"));
  services.registerScopedValue("scopedValue");
  services.registerFactory("transient", "transient", () => new SyncResource("transient"));

  const root = services.createProvider();
  const scope = root.createScope();
  scope.setScopedValue("scopedValue", new SyncResource("scopedValue"));
  scope.resolve("value");
  scope.resolve("scopedValue");
  scope.resolve("transient");

  await scope[Symbol.asyncDispose]();
  await root[Symbol.asyncDispose]();

  assert.deepStrictEqual(log, []);
});

test("Dispose: Singletons are owned and disposed by the root, not the scope", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerFactory("singleton", "singleton", () => new SyncResource("singleton"));

  const root = services.createProvider();
  const scope = root.createScope();
  scope.resolve("singleton");

  await scope[Symbol.asyncDispose]();
  assert.deepStrictEqual(log, []);

  await root[Symbol.asyncDispose]();
  assert.deepStrictEqual(log, ["singleton"]);
});

test("Dispose: Root waits for live scopes before disposing singletons", async () => {
  const { log, SyncResource, AsyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerFactory("pool", "singleton", () => new SyncResource("pool"));
  services.registerFactory("connection", "scoped", (provider) => {
    provider.resolve("pool");
    return new AsyncResource("connection");
  });

  const root = services.createProvider();
  const scope = root.createScope();
  scope.resolve("connection");

  let rootDisposed = false;
  const rootDispose = root[Symbol.asyncDispose]().then(() => { rootDisposed = true; });

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(rootDisposed, false, "Root should wait for the live scope");
  assert.deepStrictEqual(log, []);

  await scope[Symbol.asyncDispose]();
  await rootDispose;

  assert.deepStrictEqual(log, ["connection", "pool"]);
});

test("Dispose: Draining root rejects new scopes but in-flight scopes can still resolve singletons", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerFactory("dependency", "singleton", () => new SyncResource("dependency"));
  services.registerFactory("lazy", "singleton", (provider) => {
    provider.resolve("dependency");
    return new SyncResource("lazy");
  });

  const root = services.createProvider();
  const scope = root.createScope();

  const rootDispose = root[Symbol.asyncDispose]();

  assert.throws(() => root.createScope(), /disposing or disposed/);
  assert.doesNotThrow(() => scope.resolve("lazy"), "Singletons created during drain are still allowed");

  await scope[Symbol.asyncDispose]();
  await rootDispose;

  assert.deepStrictEqual(log, ["lazy", "dependency"], "Singletons created during drain are disposed too");
});

test("Dispose: Disposed provider cannot resolve, set scoped values or create scopes", async () => {
  const services = new ServiceCollection();
  services.registerFactory("scoped", "scoped", () => ({}));
  services.registerScopedValue("scopedValue");

  const scope = services.createProvider().createScope();
  await scope[Symbol.asyncDispose]();

  assert.throws(() => scope.resolve("scoped"), /disposed/);
  assert.throws(() => scope.setScopedValue("scopedValue", 1), /disposed/);
  assert.throws(() => scope.createScope(), /disposing or disposed/);
});

test("Dispose: Providers resolved as services are not owned", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();
  const ScopeKey = "scope";
  services.registerFactory(ServiceProvider, "singleton", provider => provider);
  services.registerFactory(ScopeKey, "scoped", provider => provider);
  services.registerFactory("resource", "scoped", () => new SyncResource("resource"));

  const root = services.createProvider();
  const scope = root.createScope();
  assert.strictEqual(root.resolve(ServiceProvider), root);
  assert.strictEqual(scope.resolve(ScopeKey), scope);
  scope.resolve("resource");

  await scope[Symbol.asyncDispose]();
  await root[Symbol.asyncDispose]();

  assert.deepStrictEqual(log, ["resource"]);
});

test("Dispose: Is idempotent and disposes each instance once", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();
  services.registerFactory("scoped", "scoped", () => new SyncResource("scoped"));

  const scope = services.createProvider().createScope();
  scope.resolve("scoped");

  const first = scope[Symbol.asyncDispose]();
  const second = scope[Symbol.asyncDispose]();
  assert.strictEqual(first, second, "Repeated calls return the same promise");

  await first;
  await scope[Symbol.asyncDispose]();

  assert.deepStrictEqual(log, ["scoped"]);
});

test("Dispose: Continues after failing disposers and throws AggregateError", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerFactory("ok", "scoped", () => new SyncResource("ok"));
  services.registerFactory("failSync", "scoped", () => ({ [Symbol.dispose]() { throw new Error("sync failed"); } }));
  services.registerFactory("failAsync", "scoped", () => ({ async [Symbol.asyncDispose]() { throw new Error("async failed"); } }));

  const root = services.createProvider();
  const scope = root.createScope();
  scope.resolve("ok");
  scope.resolve("failSync");
  scope.resolve("failAsync");

  const rootDispose = root[Symbol.asyncDispose]();

  await assert.rejects(scope[Symbol.asyncDispose](), (err: any) => {
    assert.ok(err instanceof AggregateError);
    assert.deepStrictEqual(err.errors.map((e: Error) => e.message), ["async failed", "sync failed"]);
    return true;
  });

  assert.deepStrictEqual(log, ["ok"], "Remaining disposers still run");
  await rootDispose; // A failed scope still counts as drained
});

test("Dispose: Parent scope waits for nested scopes", async () => {
  const { log, AsyncResource } = createTracker();
  const services = new ServiceCollection();

  let child: ServiceProvider | undefined;
  services.registerFactory("scoped", "scoped", (provider) => new AsyncResource(provider === child ? "child" : "parent"));

  const root = services.createProvider();
  const parent = root.createScope();
  child = parent.createScope();
  parent.resolve("scoped");
  child.resolve("scoped");

  const parentDispose = parent[Symbol.asyncDispose]();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepStrictEqual(log, []);

  await child[Symbol.asyncDispose]();
  await parentDispose;

  assert.deepStrictEqual(log, ["child", "parent"]);
});

test("Retain: Scope waits for holds before disposing", async () => {
  const { log, SyncResource } = createTracker();
  const services = new ServiceCollection();
  services.registerFactory("scoped", "scoped", () => new SyncResource("scoped"));

  const root = services.createProvider();
  const scope = root.createScope();
  scope.resolve("scoped");

  const hold1 = scope.retain();
  const hold2 = scope.retain();

  let scopeDisposed = false;
  const scopeDispose = scope[Symbol.asyncDispose]().then(() => { scopeDisposed = true; });

  await hold1[Symbol.asyncDispose]();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(scopeDisposed, false, "Scope should wait for the remaining hold");
  assert.deepStrictEqual(log, []);

  assert.doesNotThrow(() => scope.resolve("scoped"), "Retained scope can still resolve while draining");

  await hold2[Symbol.asyncDispose]();
  await scopeDispose;
  assert.deepStrictEqual(log, ["scoped"]);
});

test("Retain: Releasing a hold twice is a no-op", async () => {
  const services = new ServiceCollection();
  const scope = services.createProvider().createScope();

  const hold = scope.retain();
  const other = scope.retain();

  const first = hold[Symbol.asyncDispose]();
  assert.strictEqual(hold[Symbol.asyncDispose](), first, "Repeated release returns the same promise");
  await first;

  let scopeDisposed = false;
  const scopeDispose = scope[Symbol.asyncDispose]().then(() => { scopeDisposed = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(scopeDisposed, false, "Double release must not release the other hold");

  await other[Symbol.asyncDispose]();
  await scopeDispose;
});

test("Retain: Throws when the provider is disposing or disposed", async () => {
  const services = new ServiceCollection();
  const scope = services.createProvider().createScope();

  const scopeDispose = scope[Symbol.asyncDispose]();
  assert.throws(() => scope.retain(), /Cannot retain a disposing or disposed provider/);

  await scopeDispose;
  assert.throws(() => scope.retain(), /Cannot retain a disposing or disposed provider/);
});

test("Retain: Root waits for holds on scopes", async () => {
  const { log, SyncResource, AsyncResource } = createTracker();
  const services = new ServiceCollection();

  services.registerFactory("pool", "singleton", () => new SyncResource("pool"));
  services.registerFactory("connection", "scoped", (provider) => {
    provider.resolve("pool");
    return new AsyncResource("connection");
  });

  const root = services.createProvider();
  const scope = root.createScope();
  scope.resolve("connection");
  const hold = scope.retain();

  // Like a response "close" while a handler is still running
  const scopeDispose = scope[Symbol.asyncDispose]();
  const rootDispose = root[Symbol.asyncDispose]();

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepStrictEqual(log, []);

  await hold[Symbol.asyncDispose]();
  await scopeDispose;
  await rootDispose;

  assert.deepStrictEqual(log, ["connection", "pool"]);
});
