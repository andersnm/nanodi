import test from "node:test";
import assert from "node:assert/strict";
import { ServiceCollection } from "@nanodi/core";

function validationErrors(services: ServiceCollection): string[] {
  try {
    services.validate();
    return [];
  } catch (err: any) {
    assert.ok(err instanceof AggregateError);
    return err.errors.map((e: Error) => e.message);
  }
}

class Dep { }
class Service {
  dep: unknown;
  constructor(dep: unknown) { this.dep = dep; }
}

test("Validate: A valid collection passes", () => {
  const services = new ServiceCollection();

  services.registerValue("config", 1);
  services.registerSeed("req");
  services.registerClass("dep", "transient", Dep);
  services.registerClass("singleton", "singleton", Service, "config");
  services.registerClass("scoped", "scoped", Service, "req");
  services.registerClass("transient", "transient", Service, "dep");

  assert.doesNotThrow(() => services.validate());
});

test("Validate: Reports missing registrations", () => {
  const services = new ServiceCollection();

  services.registerClass(Service, "singleton", Service, "missing");

  assert.deepStrictEqual(validationErrors(services), ["No registration found for key: missing (required by Service)"]);
});

test("Validate: Reports circular dependencies once", () => {
  const services = new ServiceCollection();

  services.registerClass("A", "singleton", Service, "B");
  services.registerClass("B", "singleton", Service, "C");
  services.registerClass("C", "singleton", Service, "A");

  assert.deepStrictEqual(validationErrors(services), ["Circular dependency detected: A -> B -> C -> A"]);
});

test("Validate: Reports singletons depending on scoped or seed services", () => {
  const services = new ServiceCollection();

  services.registerSeed("req");
  services.registerClass("scoped", "scoped", Dep);
  services.registerClass("transient", "transient", Service, "scoped");
  services.registerClass("direct", "singleton", Service, "req");
  services.registerClass("indirect", "singleton", Service, "transient");

  assert.deepStrictEqual(validationErrors(services), [
    "Cannot resolve seed service 'req' from singleton 'direct'",
    "Cannot resolve scoped service 'scoped' from singleton 'indirect'",
  ]);
});

test("Validate: Factory dependencies are not checked", () => {
  const services = new ServiceCollection();

  services.registerFactory("factory", "singleton", provider => provider.resolve("missing"));
  services.registerClass("singleton", "singleton", Service, "factory");

  assert.doesNotThrow(() => services.validate());
});

test("Validate: Reports all problems in one error", () => {
  const services = new ServiceCollection();

  services.registerClass("scoped", "scoped", Dep);
  services.registerClass("A", "singleton", Service, "missing");
  services.registerClass("B", "singleton", Service, "scoped");

  assert.throws(() => services.validate(), (err: any) => {
    assert.equal(err.errors.length, 2);
    assert.match(err.message, /No registration found for key: missing/);
    assert.match(err.message, /Cannot resolve scoped service 'scoped' from singleton 'B'/);
    return true;
  });
});
