import test from "node:test";
import assert from "node:assert/strict";

import { ServiceCollection, injectable, autobindInjectables, clearInjectables, registrationSymbol } from "@nanodi/core";

test("Constructor injection resolves dependencies in correct order", () => {
  clearInjectables();

  @injectable("transient")
  class A { id; constructor() { this.id = Math.random(); } }

  @injectable("transient")
  class B { value; constructor() { this.value = 42; } }

  @injectable("transient", A, B)
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

test("Singleton services return the same instance", () => {
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

test("Transient services return new instances", () => {
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

test("injectable.key overrides the injection key", () => {
  clearInjectables();

  const AKey = registrationSymbol("A");

  @injectable("singleton")
  @injectable.key(AKey)
  class A {
    value = 123;
  }

  const collection = new ServiceCollection();
  autobindInjectables(collection);

  const provider = collection.createProvider();
  const instance = provider.resolve(AKey);

  assert.ok(instance instanceof A);
  assert.equal(instance.value, 123);
});

test("injectable.key works together with constructor injection", () => {
  clearInjectables();

  const AKey = registrationSymbol("A");

  @injectable("transient")
  @injectable.key(AKey)
  class A {
    id = 999;
  }

  @injectable("transient", AKey)
  class B {
    a: A;
    constructor(a: A) {
      this.a = a;
    }
  }

  const collection = new ServiceCollection();
  autobindInjectables(collection);

  const provider = collection.createProvider();
  const instance = provider.resolve(B);

  assert.ok(instance.a instanceof A);
  assert.equal(instance.a.id, 999);
});
