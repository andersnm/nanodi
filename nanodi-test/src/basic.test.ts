import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { inject, ServiceCollection } from 'nanodi';

test('Lifetimes: Singletons are shared, Scoped are unique per scope', async (t) => {
  const services = new ServiceCollection();
  
  class Counter { count = Math.random(); }

  services.register('singleton', { useSingletonClass: Counter });
  services.register('scoped', { useScopedClass: Counter });
  
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
  services.register('id', { useScopedFactory: () => Math.random() });
  services.register('service', { useScopedClass: Service } );
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

  services.register('A', { useSingletonClass: A });
  services.register('B', { useSingletonClass: B });

  const root = services.createProvider();

  assert.throws(() => root.resolve('A'), /Circular dependency/);
});

test('Hierarchy: Scoped provider delegates to parent for singletons', () => {
  const services = new ServiceCollection();
  const val = { version: "1.0" };
  
  services.register('config', { useValue: val });
  
  const root = services.createProvider();
  const scope = root.createScope();

  assert.strictEqual(scope.resolve('config'), val, "Child should resolve the parent's value");
  assert.strictEqual(root.resolve('config'), scope.resolve('config'), "Both should point to same instance");
});

test('Factories: Can use inject() inside factory functions', () => {
  const services = new ServiceCollection();
  
  services.register('token', { useValue: 'SECRET_123' });
  services.register('api', { useScopedFactory: () => {
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

  services.register('ctx', { useScopedClass: UserContext, useSingletonClass: UserContext });

  const root = services.createProvider();
  const rootCtx = root.resolve<UserContext>('ctx');

  const scope = root.createScope();
  const scopeCtx = scope.resolve<UserContext>('ctx');

  assert.notStrictEqual(rootCtx, scopeCtx, "Scope should have its own instance");
});

test('Captive Dependency: Singleton should not be able to inject Scoped via a shared resolution chain', () => {
  const services = new ServiceCollection();

  // 1. A Scoped service that we want to protect
  services.register("ScopedService", { useScopedFactory: () => ({ name: 'scoped' }) });

  // 2. A Singleton that incorrectly tries to grab that Scoped service
  // In a real app, this might happen deep down a dependency tree
  services.register("SingletonService", { 
    useSingletonFactory: () => {
      // This should blow up because we are currently inside a 
      // Singleton resolution, but 'ScopedService' is scoped.
      return {
        dependency: inject("ScopedService") 
      };
    } 
  });

  // 3. An Entry Point to kick things off
  services.register("EntryPoint", { useScopedClass: class {
    s;
    constructor(s = inject("SingletonService")) { this.s = s; }
  }});

  const root = services.createProvider();
  const scope = root.createScope();

  // EXECUTION:
  // scope.resolve("EntryPoint") -> [EntryPoint] (Scoped)
  //   inject("SingletonService") -> delegates to Root Provider
  
  /* WITHOUT AMBIENT STACK:
     RootProvider starts 'resolveInternal("SingletonService")'.
     Its local this.resolutionStack is EMPTY [].
     It calls the factory.
     The factory calls inject("ScopedService").
     The RootProvider looks at its empty stack and says "No parent, I guess I'm the boss!"
     IT INCORRECTLY SUCCEEDS.
  */

  /* WITH AMBIENT STACK:
     The stack ['EntryPoint'] is preserved in AsyncLocalStorage.
     RootProvider sees the stack has ['EntryPoint'].
     The Lifetime Guard sees 'EntryPoint' is the caller.
     IT CORRECTLY THROWS.
  */

  assert.throws(
    () => scope.resolve("EntryPoint"),
    /Cannot resolve scoped service/
  );
});

test('Concurrency: Shared instance stack fails with async factories', async () => {
  const services = new ServiceCollection();

  services.register("ServiceA", {
    useSingletonFactory: async () => {
      // 1. ServiceA starts and pushes "ServiceA" to the instance stack
      await new Promise(r => setTimeout(r, 50)); 
      // 3. ServiceA resumes. 
      // IF THE STACK IS ON THE INSTANCE, it now contains ["ServiceA", "ServiceB"]
      // because ServiceB pushed itself while A was asleep!
      return "A";
    }
  });

  services.register("ServiceB", {
    useSingletonFactory: async () => {
      // 2. ServiceB starts while A is waiting. 
      // It pushes "ServiceB" to the same instance stack.
      return "B";
    }
  });

  const root = services.createProvider();

  // Run them in parallel
  const [a, b] = await Promise.all([
    root.resolve("ServiceA"),
    root.resolve("ServiceB")
  ]);

  // If this test finishes without throwing "Circular Dependency", 
  // and you have the stack on the instance, it's usually because 
  // you aren't actually checking the stack correctly.
  
  // With the stack on the instance, the final stack state after 
  // both finish might even be [ "ServiceA" ] (leftover) if the 
  // pops happened in the wrong order.
});

test('Factories cache falsy values (0, false, null, etc.) instead of re-invoking', () => {
  const services = new ServiceCollection();

  let singletonFactoryCallCount = 0;
  let scopedFactoryCallCount = 0;

  services.register('singletonZero', { 
    useSingletonFactory: () => {
      singletonFactoryCallCount++;
      return 0;
    }
  });

  services.register('scopedFalse', { 
    useScopedFactory: () => {
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
