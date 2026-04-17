import { test, describe } from "node:test";
import assert from "node:assert";
import { RegistrationClass, ServiceCollection } from "@nanodi/core";

describe("ServiceCollection.bind()", () => {
  test("stores constructor → dependency keys mapping", () => {
    const sc = new ServiceCollection();

    class A {
      constructor(public a: string) {
        this.a = a;
      }
    }

    sc.register(A, { lifetime: "transient", useClass: A, args: [A] });

    const factory = sc.get(A) as RegistrationClass<A>;
    assert.ok(factory);
    assert.deepStrictEqual(factory.args, [A]);
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

    sc.register(A, { lifetime: "transient", useClass: A, args: [B] });
    sc.register(B, { lifetime: "transient", useClass: B, args: [C] });

    const factoryA = sc.get(A) as RegistrationClass<A>;
    const factoryB = sc.get(B) as RegistrationClass<B>;

    assert.deepStrictEqual(factoryA.args, [B]);
    assert.deepStrictEqual(factoryB.args, [C]);
    assert.strictEqual(sc.get(C), undefined);
  });

  test("throws when binding after provider is created (frozen)", () => {
    const sc = new ServiceCollection();

    class A {
      constructor() {}
    }

    sc.createProvider(); // freezes collection

    assert.throws(() => {
      sc.register(A, { lifetime: "transient", useClass: A, args: [] });
    }, /Cannot register new services after provider is created/);
  });

  test("constructor args are resolved using bind() mapping", () => {
    const sc = new ServiceCollection();

    class A {
      value;
      constructor() {
        this.value = 42;
      }
    }

    class B {
      a;
      constructor(a: any) {
        this.a = a;
      }
    }

    sc.register(A, { lifetime: "transient", useClass: A });
    sc.register(B, { lifetime: "transient", useClass: B, args: [A] });

    const provider = sc.createProvider();

    const b = provider.resolve(B);

    assert.ok(b instanceof B);
    assert.ok(b.a instanceof A);
    assert.strictEqual(b.a.value, 42);
  });

  test("bind() supports multiple constructor parameters", () => {
    const sc = new ServiceCollection();

    class A {
      name; tmp1;
      constructor() {
        this.name = "A";
        this.tmp1 = Math.random();
      }
    }

    class B {
      a; name; tmp2;
      constructor(a: A) {
        this.a = a;
        this.name = "B";
        this.tmp2 = Math.random();
      }
    }

    class C {
      a; b; name; tmp3;
      constructor(a: A, b: B) {
        this.a = a;
        this.b = b;
        this.name = "C";
        this.tmp3 = Math.random();
      }
    }

    sc.registerClass(A, "transient");
    sc.registerClass(B, "transient", A);
    sc.registerClass(C, "transient", A, B);

    const provider = sc.createProvider();
    const c = provider.resolve(C);

    assert.strictEqual(c.a.name, "A");
    assert.strictEqual(c.b.name, "B");
    assert.strictEqual(c.b.a.name, "A");
  });
});
