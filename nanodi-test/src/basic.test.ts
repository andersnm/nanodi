import test from 'node:test';
import assert from 'node:assert/strict';
import { inject, ServiceCollection } from 'nanodi';

test('Lifetimes: Singletons are shared, Scoped are unique per scope', async (t) => {
  const services = new ServiceCollection();
  
  class Counter { count = Math.random(); }

  services.register('singleton', { lifetime: "singleton", useFactory: () => new Counter() });
  services.register('scoped', { lifetime: "scoped", useClass: Counter });
  
  const root = services.createProvider();
  const scope1 = root.createScope();
  const scope2 = root.createScope();

  // Singleton check
  assert.strictEqual(scope1.resolve('singleton'), scope2.resolve('singleton'), "Singletons should be identical across scopes");

  // Scoped check
  assert.notStrictEqual(scope1.resolve('scoped'), scope2.resolve('scoped'), "Scoped instances should be unique to their provider");
});

test('Ambient Context: inject() finds the correct scoped instance', async () => {

  class Service {
    id: number;

    constructor(id: number = inject<number>('id')) {
      this.id = id;
    }
  }

  const services = new ServiceCollection();
  services.register('id', { lifetime: "scoped", useFactory: () => Math.random() });
  services.register('service', { lifetime: "scoped", useClass: Service } );
  const root = services.createProvider();

  async function work() {
    const scope = root.createScope();
    await new Promise(resolve => setTimeout(resolve, 10));
    const service = scope.resolve<Service>('service');
    return service.id;
  }

  const [val1, val2] = await Promise.all([
    work(),
    work()
  ]);

  assert.notStrictEqual(val1, val2, "Async call stacks should maintain their own DI context");
});

test('Protection: Circular dependencies throw an error', () => {
  const services = new ServiceCollection();

  class A { constructor() { inject('B'); } }
  class B { constructor() { inject('A'); } }

  services.register('A', { lifetime: "singleton", useClass: A });
  services.register('B', { lifetime: "singleton", useClass: B });

  const root = services.createProvider();

  assert.throws(() => root.resolve('A'), /Circular dependency/);
});

test('Hierarchy: Scoped provider delegates to parent for singletons', () => {
  const services = new ServiceCollection();
  const val = { version: "1.0" };
  
  services.register('config', { lifetime: "value", useValue: val });
  
  const root = services.createProvider();
  const scope = root.createScope();

  assert.strictEqual(scope.resolve('config'), val, "Child should resolve the parent's value");
  assert.strictEqual(root.resolve('config'), scope.resolve('config'), "Both should point to same instance");
});

test('Factories: Can use inject() inside factory functions', () => {
  const services = new ServiceCollection();
  
  services.register('token', { lifetime: "value", useValue: 'SECRET_123' });
  services.register('api', { lifetime: "scoped", useFactory: () => {
    const t = inject<string>('token');
    return { auth: t };
  }});

  const root = services.createProvider();
  const api = root.resolve<{ auth: string }>('api');

  assert.strictEqual(api.auth, 'SECRET_123');
});

test('Errors: Throws clear error for unregistered keys', () => {
  const services = new ServiceCollection();
  const root = services.createProvider();

  assert.throws(
    () => root.resolve('NonExistent'), 
    /No registration found for key: NonExistent/
  );
});

test('Shadowing: Scoped registration creates new instance despite parent existing', () => {
  const services = new ServiceCollection();
  class UserContext { id = Math.random(); }

  services.register('ctx', { lifetime: "scoped",useClass: UserContext });

  const root = services.createProvider();
  const rootCtx = root.resolve<UserContext>('ctx');

  const scope = root.createScope();
  const scopeCtx = scope.resolve<UserContext>('ctx');

  assert.notStrictEqual(rootCtx, scopeCtx, "Scope should have its own instance");
});

test('Captive Dependency: Singleton should not be able to inject Scoped via a shared resolution chain', () => {
  const services = new ServiceCollection();

  services.register("ScopedService", {
    lifetime: "scoped",
    useFactory: () => ({ name: 'scoped' })
  });
  services.register("SingletonService", { 
    lifetime: "singleton",
    useFactory: () => {
      return {
        dependency: inject("ScopedService") 
      };
    } 
  });

  services.register("EntryPoint", {
    lifetime: "singleton",
    useClass: class {
      s;
      constructor(s = inject("SingletonService")) { this.s = s; }
    }
  });

  const root = services.createProvider();
  const scope = root.createScope();

  assert.throws(
    () => scope.resolve("EntryPoint"),
    /Cannot resolve scoped service/
  );
});


test('Factories cache falsy values (0, false, null, etc.) instead of re-invoking', () => {
  const services = new ServiceCollection();

  let singletonFactoryCallCount = 0;
  let scopedFactoryCallCount = 0;

  services.register('singletonZero', { 
    lifetime: "singleton",
    useFactory: () => {
      singletonFactoryCallCount++;
      return 0;
    }
  });

  services.register('scopedFalse', { 
    lifetime: "scoped",
    useFactory: () => {
      scopedFactoryCallCount++;
      return false;
    }
  });

  const root = services.createProvider();
  const scope = root.createScope();

  // Singleton factory should only be called once
  const result1 = root.resolve('singletonZero');
  assert.strictEqual(result1, 0, "First call returns 0");
  assert.strictEqual(singletonFactoryCallCount, 1, "Factory called once");

  const result2 = root.resolve('singletonZero');
  assert.strictEqual(result2, 0, "Second call returns 0");
  assert.strictEqual(singletonFactoryCallCount, 1, "Factory should still be called only once (cached)");

  // Scoped factory should only be called once per scope
  const result3 = scope.resolve('scopedFalse');
  assert.strictEqual(result3, false, "First call returns false");
  assert.strictEqual(scopedFactoryCallCount, 1, "Scoped factory called once");

  const result4 = scope.resolve('scopedFalse');
  assert.strictEqual(result4, false, "Second call returns false");
  assert.strictEqual(scopedFactoryCallCount, 1, "Scoped factory should still be called only once (cached in scope)");
});
