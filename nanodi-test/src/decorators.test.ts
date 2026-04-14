import test from 'node:test';
import assert from 'node:assert/strict';

import { ServiceCollection, injectable, inject, autobindInjectables, clearInjectables } from '@nanodi/core';

test('Constructor injection resolves dependencies in correct order', () => {
  clearInjectables();

  @injectable("transient")
  class A { id; constructor() { this.id = Math.random(); } }

  @injectable("transient")
  class B { value; constructor() { this.value = 42; } }

  @injectable("transient", inject(A), inject(B))
  class My {
    a: A;
    b: B;
    constructor(a: A, b: B) {
      this.a = a;
      this.b = b;
    }
  }

  const collection = new ServiceCollection();

  autobindInjectables(collection);

  const provider = collection.createProvider();
  const instance = provider.resolve(My);

  assert.ok(instance.a instanceof A);
  assert.ok(instance.b instanceof B);
  assert.equal(instance.b.value, 42);
});

test('Singleton services return the same instance', () => {
  clearInjectables();

  @injectable("singleton")
  class A {}

  const collection = new ServiceCollection();

  autobindInjectables(collection);

  const provider = collection.createProvider();

  const a1 = provider.resolve(A);
  const a2 = provider.resolve(A);

  assert.equal(a1, a2);
});

test('Transient services return new instances', () => {
  clearInjectables();

  @injectable("transient")
  class A {}

  const collection = new ServiceCollection();

  autobindInjectables(collection);

  const provider = collection.createProvider();

  const a1 = provider.resolve(A);
  const a2 = provider.resolve(A);

  assert.notEqual(a1, a2);
});
