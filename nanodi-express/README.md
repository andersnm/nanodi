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

