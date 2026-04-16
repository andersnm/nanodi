import { test, describe } from "node:test";
import assert from "node:assert";
import { registrationSymbol, ServiceCollection } from "@nanodi/core";

describe("ServiceCollection.bind()", () => {
  test("stores constructor → dependency keys mapping", () => {
    const sc = new ServiceCollection();

    class A {
      constructor(public a: string) {
        this.a = a;
      }
    }

    const AKey = registrationSymbol("A");

    sc.bind(A, [AKey]);

    const factory = sc.getFactory(A);
    assert.ok(factory);
    assert.deepStrictEqual(factory, [AKey]);
  });

  test("allows multiple binds for different constructors", () => {
    const sc = new ServiceCollection();

    class A {
      constructor(v: any) {}
    }

    class B {
      constructor(v: any) {}
    }

    class C {
      constructor(v: any) {}
    }

    const AKey = registrationSymbol("A");
    const BKey = registrationSymbol("B");
    const CKey = registrationSymbol("C");

    sc.bind(A, [BKey]);
    sc.bind(B, [CKey]);

    assert.deepStrictEqual(sc.getFactory(A), [BKey]);
    assert.deepStrictEqual(sc.getFactory(B), [CKey]);
    assert.strictEqual(sc.getFactory(C), undefined);
  });

  test("throws when binding after provider is created (frozen)", () => {
    const sc = new ServiceCollection();

    class A {
      constructor(v: any) {}
    }
    const AKey = registrationSymbol("A");

    sc.createProvider(); // freezes collection

    assert.throws(() => {
      sc.bind(A, [AKey]);
    }, /Cannot bind new services after provider is created/);
  });

  test("constructor args are resolved using bind() mapping", () => {
    const sc = new ServiceCollection();

    const AKey = registrationSymbol("A");
    const BKey = registrationSymbol("B");

    class B {
      value;
      constructor() {
        this.value = 42;
      }
    }

    class A {
      b;
      constructor(b: any) {
        this.b = b;
      }
    }

    sc.register(BKey, { lifetime: "transient", useClass: B });
    sc.register(AKey, { lifetime: "transient", useClass: A });

    // bind A → [BKey]
    sc.bind(A, [BKey]);

    const provider = sc.createProvider();

    const a = provider.resolve(AKey);

    assert.ok(a instanceof A);
    assert.ok(a.b instanceof B);
    assert.strictEqual(a.b.value, 42);
  });

  test("bind() supports multiple constructor parameters", () => {
    const sc = new ServiceCollection();

    const AKey = registrationSymbol("A");
    const BKey = registrationSymbol("B");
    const CKey = registrationSymbol("C");

    class B {
      name;
      constructor() {
        this.name = "B"; } }
    class C {
      name;
      constructor() { this.name = "C"; } }

    class A {
      b; c;
      constructor(b: any, c: any) {
        this.b = b;
        this.c = c;
      }
    }

    sc.register(BKey, { lifetime: "transient", useClass: B });
    sc.register(CKey, { lifetime: "transient", useClass: C });
    sc.register(AKey, { lifetime: "transient", useClass: A });

    sc.bind(A, [BKey, CKey]);

    const provider = sc.createProvider();
    const a = provider.resolve(AKey);

    assert.strictEqual(a.b.name, "B");
    assert.strictEqual(a.c.name, "C");
  });
});
