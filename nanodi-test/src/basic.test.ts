import test from "node:test";
import assert from "node:assert/strict";
import { ServiceCollection } from "@nanodi/core";

test("Lifetimes: Singletons are shared, Scoped are unique per scope", async (t) => {
  const services = new ServiceCollection();
  
  class Counter { count = Math.random(); }

  services.registerFactory("singleton", "singleton", () => new Counter());
  services.registerClass("scoped", "scoped", Counter);

  const root = services.createProvider();
  const scope1 = root.createScope();
  const scope2 = root.createScope();

  // Singleton check
  assert.strictEqual(scope1.resolve("singleton"), scope2.resolve("singleton"), "Singletons should be identical across scopes");

  // Scoped check
  assert.notStrictEqual(scope1.resolve("scoped"), scope2.resolve("scoped"), "Scoped instances should be unique to their provider");
});

test("Ambient Context: provide() finds the correct scoped instance", async () => {

  class Service {
    id: number;

    constructor(id: number) {
      this.id = id;
    }
  }

  const services = new ServiceCollection();
  services.registerFactory("id", "scoped", () => Math.random());
  services.registerClass("service", "scoped", Service, "id");
  const root = services.createProvider();

  async function work() {
    const scope = root.createScope();
    await new Promise(resolve => setTimeout(resolve, 10));
    const service = scope.resolve<Service>("service");
    return service.id;
  }

  const [val1, val2] = await Promise.all([
    work(),
    work()
  ]);

  assert.notStrictEqual(val1, val2, "Async call stacks should maintain their own DI context");
});

test("Protection: Circular dependencies throw an error", () => {
  const services = new ServiceCollection();

  class A { constructor(b: B) { } }
  class B { constructor(a: A) { } }

  services.registerClass(A, "singleton", A, B);
  services.registerClass(B, "singleton", B, A);

  const root = services.createProvider();

  assert.throws(() => root.resolve(A), /Circular dependency/);
});

test("Hierarchy: Scoped provider delegates to parent for singletons", () => {
  const services = new ServiceCollection();
  const val = { version: "1.0" };

  services.registerValue("config", val);

  const root = services.createProvider();
  const scope = root.createScope();

  assert.strictEqual(scope.resolve("config"), val, "Child should resolve the parent's value");
  assert.strictEqual(root.resolve("config"), scope.resolve("config"), "Both should point to same instance");
});

test("Factories: Can use provide() inside factory functions", () => {
  const services = new ServiceCollection();
  
  services.registerValue("token", "SECRET_123");
  services.registerFactory("api", "scoped", (provider) => {
    const t = provider.resolve<string>("token");
    return { auth: t };
  });

  const root = services.createProvider();
  const api = root.createScope().resolve<{ auth: string }>("api");

  assert.strictEqual(api.auth, "SECRET_123");
});

test("Errors: Throws clear error for unregistered keys", () => {
  const services = new ServiceCollection();
  const root = services.createProvider();

  assert.throws(
    () => root.resolve("NonExistent"), 
    /No registration found for key: NonExistent/
  );
});

test("Shadowing: Nested scope creates new instance despite parent scope existing", () => {
  const services = new ServiceCollection();
  class UserContext { id = Math.random(); }

  services.registerClass("ctx", "scoped", UserContext);

  const root = services.createProvider();
  const parentScope = root.createScope();
  const parentCtx = parentScope.resolve<UserContext>("ctx");

  const scope = parentScope.createScope();
  const scopeCtx = scope.resolve<UserContext>("ctx");

  assert.notStrictEqual(parentCtx, scopeCtx, "Scope should have its own instance");
});

test("Captive Dependency: Singleton should not be able to provide Scoped via a shared resolution chain", () => {
  const services = new ServiceCollection();

  services.registerFactory("ScopedService", "scoped", () => ({ name: "scoped" }));
  services.registerFactory("SingletonService", "singleton", (provider) => {
    return {
      dependency: provider.resolve("ScopedService") 
    };
  });

  class EntryPoint{
    s;
    constructor(s: any) { this.s = s; }
  };

  services.registerClass("EntryPoint", "singleton", EntryPoint, "SingletonService");

  const root = services.createProvider();
  const scope = root.createScope();

  assert.throws(
    () => scope.resolve("EntryPoint"),
    /Cannot resolve scoped service/
  );
});


test("Captive Dependency: Scoped can depend on transient that depends on scoped", () => {
  const services = new ServiceCollection();

  services.registerFactory("C", "scoped", () => ({ name: "C" }));
  services.registerFactory("B", "transient", (provider) => ({ c: provider.resolve("C") }));
  services.registerFactory("A", "scoped", (provider) => ({ b: provider.resolve("B") }));

  const scope = services.createProvider().createScope();

  assert.doesNotThrow(() => scope.resolve("A"));
  assert.doesNotThrow(() => scope.resolve("B"), "Transient resolved directly from a scope may depend on scoped");
});

test("Captive Dependency: Singleton cannot provide Scoped through a transient", () => {
  const services = new ServiceCollection();

  services.registerFactory("Scoped", "scoped", () => ({ name: "scoped" }));
  services.registerFactory("Transient", "transient", (provider) => ({ s: provider.resolve("Scoped") }));
  services.registerFactory("Singleton", "singleton", (provider) => ({ t: provider.resolve("Transient") }));

  const scope = services.createProvider().createScope();

  assert.throws(
    () => scope.resolve("Singleton"),
    /Cannot resolve scoped service 'Scoped' from singleton 'Singleton'/
  );
});

test("Captive Dependency: Singleton cannot depend on seed", () => {
  const services = new ServiceCollection();

  class Example {
    req: number;
    constructor(req: number) {
      this.req = req;
    }
  }

  services.registerSeed("req");
  services.registerClass(Example, "singleton", Example, "req");

  const scope = services.createProvider().createScope();
  scope.seed("req", 128);

  assert.throws(
    () => scope.resolve(Example),
    /Cannot resolve seed service 'req' from singleton/
  );
});

test("Root: Cannot resolve scoped or seed services, or seed, in the root provider", () => {
  const services = new ServiceCollection();

  services.registerFactory("scoped", "scoped", () => ({}));
  services.registerSeed("req");

  const root = services.createProvider();

  assert.throws(() => root.resolve("scoped"), /Cannot resolve scoped service 'scoped' from the root provider/);
  assert.throws(() => root.resolve("req"), /Cannot resolve seed service 'req' from the root provider/);
  assert.throws(() => root.seed("req", 1), /Cannot seed key: req in the root provider/);
});

test("Factories cache falsy values (0, false, null, etc.) instead of re-invoking", () => {
  const services = new ServiceCollection();

  let singletonFactoryCallCount = 0;
  let scopedFactoryCallCount = 0;

  services.registerFactory("singletonZero", "singleton", () => {
    singletonFactoryCallCount++;
    return 0;
  });

  services.registerFactory("scopedFalse", "scoped", () => {
    scopedFactoryCallCount++;
    return false;
  });

  const root = services.createProvider();
  const scope = root.createScope();

  // Singleton factory should only be called once
  const result1 = root.resolve("singletonZero");
  assert.strictEqual(result1, 0, "First call returns 0");
  assert.strictEqual(singletonFactoryCallCount, 1, "Factory called once");

  const result2 = root.resolve("singletonZero");
  assert.strictEqual(result2, 0, "Second call returns 0");
  assert.strictEqual(singletonFactoryCallCount, 1, "Factory should still be called only once (cached)");

  // Scoped factory should only be called once per scope
  const result3 = scope.resolve("scopedFalse");
  assert.strictEqual(result3, false, "First call returns false");
  assert.strictEqual(scopedFactoryCallCount, 1, "Scoped factory called once");

  const result4 = scope.resolve("scopedFalse");
  assert.strictEqual(result4, false, "Second call returns false");
  assert.strictEqual(scopedFactoryCallCount, 1, "Scoped factory should still be called only once (cached in scope)");
});

test("Seed: throws when key is not registered", () => {
  const services = new ServiceCollection();
  const root = services.createProvider();
  const scope = root.createScope();

  assert.throws(
    () => scope.seed("missing", 123),
    /No registration found for key/
  );
});

test("Seed: throws when registration is not scoped or seed-enabled", () => {
  const services = new ServiceCollection();

  services.registerFactory("notScoped", "singleton", () => 42);

  const root = services.createProvider();
  const scope = root.createScope();

  assert.throws(
    () => scope.seed("notScoped", 123),
    /must have "seed" lifetime/
  );
});

test("Seed: throws when instance has not been seeded", () => {
  const services = new ServiceCollection();
  services.registerSeed("scopedValue");

  const root = services.createProvider();
  const scope = root.createScope();

  assert.throws(
    () => scope.resolve("scopedValue"),
    /Key: scopedValue has not been seeded/
  );
});

test("Seed: seeded instance is returned instead of factory/class result", () => {
  const services = new ServiceCollection();

  class Example {
    n: number;
    constructor(n: number) {
      this.n = n;
    }
  }

  services.registerSeed("req");
  services.registerClass(Example, "scoped", Example, "req");

  const root = services.createProvider();
  const scope = root.createScope();

  const seededReq = 128;
  scope.seed("req", seededReq);

  const resolvedReq = scope.resolve<typeof seededReq>("req");
  assert.strictEqual(resolvedReq, seededReq, "Seeded instance should be returned");

  const handler = scope.resolve(Example);
  assert.ok(handler instanceof Example, "Other scoped services still resolve normally");
  assert.strictEqual(handler.n, seededReq, "Constructor should receive the seeded value");
});

test("Abstract Key: Abstract class can be used as key and dependency", () => {
  const services = new ServiceCollection();

  abstract class Database {
    abstract query(): string;
  }

  class PostgresDb extends Database {
    query() { return "pg"; }
  }

  class UserService {
    db: Database;
    constructor(db: Database) {
      this.db = db;
    }
  }

  services.registerClass(Database, "singleton", PostgresDb);
  services.registerClass(UserService, "singleton", UserService, Database);

  const root = services.createProvider();
  const db: Database = root.resolve(Database);

  assert.ok(db instanceof PostgresDb);
  assert.strictEqual(root.resolve(UserService).db, db);
});
