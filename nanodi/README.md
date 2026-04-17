# nanodi

Modern, fast, simple, immutable, synchronous constructor DI container for Node.js and browsers. Manual bindings or auto-registration with official ECMAScript decorators. Supports constants, singletons, scoped singletons and transients. Rhymes with "melody".

## Design principles
- **Synchronous:** Constructors and factories must not perform async work.
- **Type-bound Injection:** Register constructor argument bindings with `.registerClass()` or `@injectable()` decorator
- **Immutability:** The registration map is frozen once a provider is created.
- **Shared Composition:** All providers share the same registration map. Scopes cannot override services.
- **Root Resolution:** Global singletons and values are always resolved and cached in the root provider.
- **Isolation:** Scoped providers cache only scoped instances.
- **Cycle Protection:** Circular dependencies throw an error.
- **Lifetime Integrity:** Scoped services cannot be injected into singletons.

## Usage
1. Register services at startup:

```ts
const services = new ServiceCollection();
services.register(Database, { lifetime: "singleton", useClass: PostgresDb });
services.register(RequestKey, { lifetime: "seed" });

autobindInjectables(services); // Registers decorated types
```

2. Create the root provider:

```ts
const root = services.createProvider();
```

3. Register type and bind type-safe arguments using decorator syntax:

```ts
@injectable<typeof UserService>("scoped", inject(Database), inject(RequestKey))
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
    scope.seed(RequestKey, req);

    try {
        const service = scope.resolve(UserService);
        const user = await service.getUser(req.query.id);

        res.json(user);
    } catch (err) {
        res.status(500).send(err.message);
    }
});
```

## Typed symbols

Injection keys can be symbols. Typed symbols preserve the generic type parameter and enable compile‑time type‑checked injection. To create a typed symbol:

```ts
export const RequestKey = registrationSymbol<express.Request>("req");
```

## Manual binding

Decorators-based auto-binding via `@injectable()` uses `.registerClass()` under the hood which supports type-checking against the constructor parameters:

```ts
services.registerClass(UserService, "scoped", inject(DataBase), inject(RequestKey));

// Equivalent to:
// @injectable("scoped", inject(Database), inject(RequestKey))
// class UserService { ... }
```

## Global fallback injection

It is possible to inject constructor parameters using the global `provide()` function as  a default argument. This creates a tight coupling between the service classes and the service provider and is not recommended.

```ts
class UserService {
  constructor(
    private db: Database = provide(Database),
    private req: express.Request = provide(RequestKey)) {}

  async getUser(id: number) {
    if (!this.req.user) {
      throw new Error("Unauthenticated");
    }
    return await this.db.getUser(id);
  }
}
```

## Resolution logic and order
- If the instance exists in the current provider cache, return it, else:
- If `scoped` and `useClass` is provided, create and cache a new instance in the current provider, else:
- If `scoped` and `useFactory` is provided, create and cache a new instance in the current provider, else:
- If `transient` and `useClass` is provided, create new instance, else:
- If `transient` and `useFactory` is provided, create new instance, else:
- If parent provider exists, resolve from it, otherwise resolve as the root provider:
- If `useValue` is provided, return it, else:
- If `singleton` and `useClass` is provided, create and cache a new instance in the root provider, else:
- If `singleton` and `useFactory` is provided, create and cache a new instance in the root provider, else
- Throw error

## API Reference

### `ServiceCollection`
The container used to define your dependencies before the application starts.

* **`register(key: RegistrationKey<T>, registration: Registration)`**: Adds a service to the collection.
    * `key`: A `string`, `Symbol`, or a `Class`.
    * `registration`: An object defining the lifetime strategy.
    * *Throws:* If called after a provider has been created (frozen).
* **`registerClass<T>(useClass: T, lifetime: ClassLifetime, args: RegistrationConstructorParameters<T>)`**: Adds a class-based service to the collection with type-checked constructor arguments.
* **`registerFactory<T>(key: RegistrationKey<T>, lifetime: FactoryLifetime, useFactory: (serviceProvider: ServiceProvider) => T)`**: Adds a factory-based service to the collection.
* **`createProvider()`**: Freezes the collection and returns the root `ServiceProvider`.

---

### `ServiceProvider`
The engine that resolves and caches instances.

* **`resolve<T>(key: RegistrationKey<T>)`**: Returns the instance associated with the key. If the instance doesn't exist yet, it is created based on its registration strategy.
* **`createScope()`**: Creates a child `ServiceProvider`. This child shares the same service registrations but maintains its own cache for **Scoped** services.
* **`seed<T>(key: RegistrationKey<T>, instance: T)`**: Registers the instance in the current provider cache. The key must have lifetime "seed".

---

### Global Functions

#### `provide<T>(key: RegistrationKey<T>): T`
Resolves an instance inside constructors or functions within an active scope.
* **Context:** Must be called during the execution flow of a `resolve()` call.
* **Usage:** Best used as a default constructor argument.

#### `registrationSymbol<T>(name: string): RegistrationSymbol<T>`
Helper function to create a new registration key `Symbol` instance associated with the instance type.

---

#### `RegistrationKey<T>` type

Defined as `string | RegistrationSymbol<T> | RegistrationConstructor<T>`, where `RegistrationSymbol<T>` is a `symbol` and `RegistrationConstructor<T>` is `new (...args: any[]) => T`.

### `Registration<T>` type

Describes a service type and its lifetime strategy.

| Field | Type | Description |
|---------|-|------------|
|`lifetime`| `Lifetime` enum | One of `"value"`, `"singleton"`, `"scoped"`, `"transient"`, `"seed"`
|`useValue`| any | Valid with lifetime: `"value"`
|`useClass`| Constructor | Valid with lifetime: `"singleton"`, `"scoped"`, `"transient"`
|`useFactory`| Function | Valid with lifetime: `"singleton"`, `"scoped"`, `"transient"`
|`args`| RegistrationKey[] | Valid with `useClass`

#### `Lifetime` enum

| Lifetime | Description |
|---------|-------------|
| **`"value"`** | Always returns the provided constant. No construction. |
| **`"seed"`** | Scoped constant value provided at runtime. No construction. |
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
