# nanodi

Modern, simple, immutable, synchronous constructor DI container for Node.js and browsers. No auto-registration nor decorators. Supports constants, singletons, scoped singletons and transients. Rhymes with "melody".

## Design principles
- **Synchronous:** Constructors and factories must not perform async work.
- **Ambient Injection:** `inject()` works only during a synchronous `resolve()` call.
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
services.register(Database, { useSingletonClass: PostgresDb });
services.register(UserService, { useScopedClass: UserService });
```

2. Create the root provider:

```ts
const root = services.createProvider();
```

3. Use ambient injection inside constructors:

```ts
class UserService {
  constructor(
    private db = inject(Database),
  ) {}

  async getUser(id: number) {
    return await this.db.getUser(id);
  }
}
```

4. Create scoped providers in requests, resolve services from the provider:

```ts
app.get('/user', async (req, res) => {
    const scope = root.createScope();

    try {
        const service = scope.resolve(UserService);
        const user = await service.getUser(req.query.id);

        res.json(user);
    } catch (err) {
        res.status(500).send(err.message);
    }
});
```

## Resolution logic and order
- If singleton instance exists in the current container, return it, else:
- If `useScopedClass` is provided, create new singleton in current container, else:
- If `useScopedFactory` is provided, create new singleton in current container, else:
- If `useTransientClass` is provided, create new instance, else:
- If `useTransientFactory` is provided, create new instance, else:
- If parent container exists, resolve singleton from it, otherwise is root container:
- If `useValue` is provided, use that, else:
- If `useSingletonClass` is provided, create singleton, else:
- If `useSingletonFactory` is provided, create singleton, else
- Throw error

## API Reference

### `ServiceCollection`
The container used to define your dependencies before the application starts.

* **`register(key, registration)`**: Adds a service to the collection.
    * `key`: A `string`, `Symbol`, or a `Class`.
    * `registration`: An object defining the lifetime strategy.
    * *Throws:* If called after a provider has been created (frozen).
* **`createProvider()`**: Freezes the collection and returns the root `ServiceProvider`.

---

### `ServiceProvider`
The engine that resolves and caches instances.

* **`resolve<T>(key)`**: Returns the instance associated with the key. If the instance doesn't exist yet, it is created based on its registration strategy.
* **`createScope()`**: Creates a child `ServiceProvider`. This child shares the same service registrations but maintains its own cache for **Scoped** services.

---

### `Registration` Strategies
When registering a service, you must provide exactly one of these properties:

| Property | Type | Description |
| :--- | :--- | :--- |
| `useValue` | `any` | Returns a constant value. |
| `useSingletonClass` | `Constructor` | Instantiates a class once in the root provider. |
| `useSingletonFactory` | `Function` | Calls a function once in the root provider to get the instance. |
| `useScopedClass` | `Constructor` | Instantiates a class once per scope. |
| `useScopedFactory` | `Function` | Calls a function once per scope to get the instance. |
| `useTransientClass` | `Constructor` | Instantiates a new class on every `resolve/inject`. |
| `useTransientFactory` | `Function` | Calls a function for a new instance on every `resolve/inject`. |

---

### Global Functions

#### `inject<T>(key: RegistrationKey<T>): T`
The primary way to retrieve dependencies inside constructors or functions within an active scope.
* **Context:** Must be called during the execution flow of a `resolve()` call.
* **Usage:** Best used as a default constructor argument.

---

### Types

* **`RegistrationKey<T>`**: `string | Symbol | new (...args: any[]) => T`
* **`RegistrationConstructor<T>`**: A class constructor that yields type `T`.

---

