# nanodi

Modern, fast, simple, immutable, synchronous constructor DI container for Node.js and browsers. Manual bindings or auto-registration with decorators. Supports constants, singletons, scoped singletons and transients. Rhymes with "melody".

## Design principles
- **Synchronous:** Constructors and factories must not perform async work.
- **Type-bound Injection:** Register constructor argument bindings with `provider.bind()` or `@injectable()` decorator
- **Global Fallback Injection:** Assign constructor default arguments using `provide()`. This couples the class to the DI system and is not recommended.
- **Immutability:** The registration map is frozen once a provider is created.
- **Shared Composition:** All providers share the same registration map. Scopes cannot override services.
- **Root Resolution:** Global singletons and values are always resolved and cached in the root container.
- **Isolation:** Scoped providers cache only scoped instances.
- **Cycle Protection:** Circular dependencies throw an error.
- **Lifetime Integrity:** Scoped services cannot be injected into singletons.

## Usage
1. Register services at startup:

```ts
const services = new ServiceCollection();
services.register(Database, { lifetime: "singleton", useClass: PostgresDb });
services.register('req', { lifetime: "scoped" });

autobindInjectables(services); // Registers decorated types
```

2. Create the root provider:

```ts
const root = services.createProvider();
```

3. Register type and bind type-safe arguments using decorator syntax:

```ts
@injectable<typeof UserService>("scoped", inject(Database), inject('req'))
class UserService {
  constructor(private db: Database, private req: express.Request) {}

  async getUser(id: number) {
    if (!this.req.user) {
      throw new Error("Unauthenticated");
    }
    return await this.db.getUser(id);
  }
}
```

4. Create scoped providers in requests, resolve services from the provider:

```ts
app.get('/user', async (req, res) => {
    const scope = root.createScope();
    scope.seed('req', req);

    try {
        const service = scope.resolve(UserService);
        const user = await service.getUser(req.query.id);

        res.json(user);
    } catch (err) {
        res.status(500).send(err.message);
    }
});
```

## Manual binding

Decorators-based auto-binding uses `.register()` and `.bind()` under the hood and supports type-checking against the constructor parameters:

```ts
services.register({"lifetime": "scoped", useClass: UserService })
services.bind<typeof UserService>(UserService, [ inject(DataBase), inject("req") ]);

// Equivalent to:
// @injectable("scoped", inject(Database), inject('req'))
// class UserService { ... }
```

## Global fallback injection

It is possible to inject constructor parameters using the global `provide()` function as  a default argument. This creates a tight coupling between the service classes and the service provider and is not recommended.

```ts
class UserService {
  constructor(
    private db: Database = provide(Database),
    private req: express.Request = provide('req')) {}

  async getUser(id: number) {
    if (!this.req.user) {
      throw new Error("Unauthenticated");
    }
    return await this.db.getUser(id);
  }
}
```

## Resolution logic and order
- If the instance exists in the current container cache, return it, else:
- If `scoped` and `useClass` is provided, create and cache a new instance in the current container, else:
- If `scoped` and `useFactory` is provided, create and cache a new instance in the current container, else:
- If `transient` and `useClass` is provided, create new instance, else:
- If `transient` and `useFactory` is provided, create new instance, else:
- If parent container exists, resolve from it, otherwise resolve as the root container:
- If `useValue` is provided, return it, else:
- If `singleton` and `useClass` is provided, create and cache a new instance in the root container, else:
- If `singleton` and `useFactory` is provided, create and cache a new instance in the root container, else
- Throw error

## API Reference

### `ServiceCollection`
The container used to define your dependencies before the application starts.

* **`register(key: RegistrationKey<T>, registration: Registration)`**: Adds a service to the collection.
    * `key`: A `string`, `Symbol`, or a `Class`.
    * `registration`: An object defining the lifetime strategy.
    * *Throws:* If called after a provider has been created (frozen).
* **`createProvider()`**: Freezes the collection and returns the root `ServiceProvider`.

---

### `ServiceProvider`
The engine that resolves and caches instances.

* **`resolve<T>(key: RegistrationKey<T>)`**: Returns the instance associated with the key. If the instance doesn't exist yet, it is created based on its registration strategy.
* **`createScope()`**: Creates a child `ServiceProvider`. This child shares the same service registrations but maintains its own cache for **Scoped** services.
* **`seed<T>(key: RegistrationKey<T>, instance: T)`**: Injects externally‑created instances into a Scoped provider before any resolution happens.

---

### Global Functions

#### `provide<T>(key: RegistrationKey<T>): T`
Resolves an instance inside constructors or functions within an active scope.
* **Context:** Must be called during the execution flow of a `resolve()` call.
* **Usage:** Best used as a default constructor argument.

---

#### `RegistrationKey<T>` type

Defined as `string | Symbol | new (...args: any[]) => T`


### `Registration` type

Describes a service type and its lifetime strategy.

| Field | Type | Description |
|---------|-|------------|
|`lifetime`| `Lifetime` enum | One of `"value"`, `"singleton"`, `"scoped"`, `"transient"`
|`useValue`| any | Valid with lifetime: `"value"`
|`useClass`| Constructor | Valid with lifetime: `"singleton"`, `"scoped"`, `"transient"`
|`useFactory`| Function | Valid with lifetime: `"singleton"`, `"scoped"`, `"transient"`


#### `Lifetime` enum

| Lifetime | Description |
|---------|-------------|
| **`"value"`** | Always returns the provided constant. No construction. |
| **`"singleton"`** | Created once in the **root** provider and reused everywhere. |
| **`"scoped"`** | Created once **per scope**. Scoped instances never leak upward. |
| **`"transient"`** | A new instance is created on every `resolve()`. |

---

### Examples

#### Value
```ts
services.register("config", {
  lifetime: "value",
  useValue: { port: 3000 }
});
```

#### Singleton class
```ts
services.register(Database, {
  lifetime: "singleton",
  useClass: PostgresDb
});
```

#### Scoped factory
```ts
services.register(RequestId, {
  lifetime: "scoped",
  useFactory: () => crypto.randomUUID()
});
```

#### Transient class
```ts
services.register(Logger, {
  lifetime: "transient",
  useClass: Logger
});
```
