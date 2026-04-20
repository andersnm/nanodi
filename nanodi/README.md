# nanodi

Modern, fast, type-safe, immutable DI container for Node.js and browsers. Synchronous constructor injection with manual bindings or auto-registration using official ECMAScript decorators. Supports constants, singletons, scoped singletons and transients. Rhymes with "melody".

## Design principles
- **Synchronous:** Constructors and factories must not perform async work.
- **Typed Injection:** Register typed constructor argument bindings with `.registerClass()` or `@injectable()`
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
services.registerClass(Database, "singleton", PostgresDb, ConfigKey);
services.registerSeed(RequestKey);

autobindInjectables(services, [ PostgresDb, UserService ]);
```

2. Create the root provider:

```ts
const root = services.createProvider();
```

3. Register type and bind type-safe arguments using decorator syntax:

```ts
@injectable("scoped", Database, RequestKey)
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

## Anonymous object types

Typed symbols preserve the shape of anonymous object types. The original type can be "unwrapped" from the symbol key type:

```ts
const dbConfig = { host: process.env["DB_HOST"], port: process.env["DB_PORT"], };
const ConfigKey = registrationSymbol<typeof dbConfig>("dbConfig");
services.registerValue(ConfigKey, dbConfig);

// Type of "value": { host, port }
let value: RegistrationSymbolType<typeof ConfigKey> = provider.resolve(ConfigKey);
```

## Manual class binding

Decorators-based auto-binding via `@injectable()` uses `.registerClass()` under the hood which supports type-checking against the constructor parameters:

```ts
services.registerClass(Database, "singleton", PostgresDb, ConfigKey);

// Equivalent to:
// @injectable("singleton", ConfigKey)
// @injectable.key(Database)
// class PostgresDb extends Database { ... }
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

* **`register<T>(key, registration)`**

  Adds a service to the collection. Low-level utility. Prefer using the `register*`-helper functions for improved typing.

    * `key: RegistrationKey<T>`: A `string`, `Symbol`, or `Class` identifier for the service.
    * `registration: Registration<T>`: An object defining the lifetime strategy.
    * *Throws:* If called after a provider has been created (frozen).

* **`registerValue<T>(key, value)`**

  Adds a constant value as a service.

    * `key: RegistrationKey<T>`: A `string`, `Symbol`, or `Class` identifier for the service.
    * `value: T`: The value to set.

* **`registerClass<T>(key, lifetime, useClass, ...args)`**

  Adds a class-based service to the collection with type-checked constructor arguments.

    * `key: RegistrationKey<T>`: A `string`, `Symbol`, or `Class` identifier for the service.
    * `lifetime: ClassLifetime`: One of `"singleton"`, `"scoped"`, `"transient"`.
    * `useClass: RegistrationConstructor<T>`: The class to construct from.
    * `...args: RegistrationConstructorParameters<T>`: Constructor arguments.

* **`registerFactory<T>(key, lifetime, useFactory)`**

  Adds a factory-based service to the collection.

    * `key: RegistrationKey<T>`: A `string`, `Symbol`, or `Class` identifier for the service.
    * `lifetime: FactoryLifetime`: One of `"singleton"`, `"scoped"`, `"transient"`.
    * `useFactory: (serviceProvider: ServiceProvider) => T`: The factory callback.

* **`registerSeed<T>(key)`**

  Adds a seed service placeholder.

    * `key: RegistrationKey<T>`: A `string`, `Symbol`, or `Class` identifier for the service.

* **`createProvider()`**

  Freezes the collection and returns the root `ServiceProvider`.

---

### `ServiceProvider`
The engine that resolves and caches instances.

* **`resolve<T>(key: RegistrationKey<T>)`**

  Returns the instance associated with the key. If the instance doesn't exist yet, it is created based on its registration strategy.

* **`createScope()`**: Creates a child `ServiceProvider`.

  This child shares the same service registrations but maintains its own cache for **Scoped** services.

* **`seed<T>(key: RegistrationKey<T>, instance: T)`**

   Registers the instance in the current provider cache. The key must have lifetime "seed".

---

### Class Decorators

* **`@injectable<T>(lifetime: ClassLifetime, ...args: RegistrationConstructorParameters<T>)`**

  Specifies injection lifetime and bindings for `autobindInjectables()`.

* **`@injectable.key<T>(key: RegistrationKey<T>)`**

  Specifies the injection key used to reference the class.

---

### Global Functions

* **`autobindInjectables(collection, useClasses)`**

  Takes an array of classes decorated with `@injectable()` and registers them in the `collection`.

  In Javascript there is no good way to "enumerate decorated classes" without massive drawbacks:

    - Tree shaking: Decorators only run for classes that are actually `import`ed. However, modern bundlers will happily strip out `import`s without explicit references.
    - Potential leaks: Using a global registry can prevent classes from being garbage collected.
    - Global pollution: Using a global registry makes it impossible to run multiple independent DI containers.

  * `collection: ServiceCollection`: The collection where the classes will be registered.
  * `useClasses: RegistrationConstructor<any>[]`: An array of decorated classes to register.
  * *Throws:* If any class was not decorated with @injectable().

* **`registrationSymbol<T>(name: string): RegistrationSymbol<T>`**

  Helper function to create a new registration key `Symbol` instance associated with the instance type.

---

### `RegistrationKey<T>` type

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
const dbConfig = { host: process.env["DB_HOST"], port: process.env["DB_PORT"], };

services.registerValue(ConfigKey, dbConfig);
```

#### Singleton class
```ts
services.registerClass(Database, "singleton", PostgresDb, ConfigKey);
```

#### Scoped factory
```ts
services.registerFactory(RequestId, "scoped", () => crypto.randomUUID());
```

#### Transient class
```ts
services.registerClass(Logger, "transient", Logger);
```

#### Scoped seed value
```ts
services.registerSeed(RequestKey);
```
