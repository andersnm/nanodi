# nanodi-express

Modern Express controllers with `@nanodi/core`. Supports routing, request-scoped dependency injection and express middlewares. Optional auto-registration and discovery using official ECMAScript decorators.

## Usage

Write controllers like this:

```ts
@injectable("scoped")
@controller("get", "/hello")
@controller.middleware(mergeBody(), zodValidate(HelloRequestSchema))
export class HelloController extends MessageHandler<HelloRequest, HelloResponse> {
  async message(request: HelloRequest): Promise<HelloResponse> {
    return {
      id: request.id,
      message: "Hello world!"
    };
  }
}
```

And wire up like this:

```ts

async function main() {
  const services = new ServiceCollection();
  services.registerSeed(RequestKey);
  services.registerSeed(ResponseKey);
  autobindInjectables(services, [ HelloController ]);

  const provider = services.createProvider();

  const app = express();
  app.use(express.json());
  app.use(requestScopeMiddleware(provider));

  autobindInjectableControllers(app, services);

  app.use(zodErrorHandler());
  app.use(defaultErrorHandler());

  app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });
}
```


## Request scope lifetime

`requestScopeMiddleware()` creates a scope per request, available as `req.scope`, and disposes it when the response closes. Disposal waits for holds from `req.scope.retain()`, so services stay usable while a handler is still running, also when the client disconnects early.

Controllers hold the scope automatically until `handle()` settles. Other handlers that use `req.scope` should hold it themselves.

Async handlers, for example with a per-app wrapper:

```ts
const tracked = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try {
    await using hold = req.scope.retain();
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

app.get("/users", tracked(async (req, res) => {
  res.json(await req.scope.resolve(UserService).list());
}));
```

Callback-based handlers retain first and release in the callback:

```js
app.get("/users", (req, res, next) => {
  const hold = req.scope.retain();
  req.scope.resolve(UserService).list((err, users) => {
    hold[Symbol.asyncDispose]();
    if (err) return next(err);
    res.json(users);
  });
});
```

Handlers that do not retain are only protected until the response closes.
