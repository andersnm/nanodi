# nanodi-koa

Modern Koa controllers with `@nanodi/core`. Supports routing with `@koa/router`, request-scoped dependency injection and Koa middlewares. Optional auto-registration and discovery using official ECMAScript decorators.

## Usage

Write controllers like this:

```ts
@injectable("scoped", UserService)
@controller("get", "/users")
@controller.middleware(requireAuth())
export class UsersController implements Controller {
  constructor(private users: UserService) {}

  async handle(ctx: Koa.Context, next: Koa.Next) {
    ctx.body = await this.users.list();
  }
}
```

And wire up like this:

```ts
async function main() {
  const services = new ServiceCollection();
  services.registerScopedValue(ContextKey);
  autobindInjectables(services, [ UserService, UsersController ]);

  const provider = services.createProvider();

  const app = new Koa();
  app.use(errorHandler());
  app.use(requestScopeMiddleware(provider));

  const router = new Router();
  autobindInjectableControllers(router, services);
  app.use(router.routes());
  app.use(router.allowedMethods());

  app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });
}
```

Errors thrown by controllers propagate to upstream middleware, as usual in Koa.

## Request scope lifetime

`requestScopeMiddleware()` creates a scope per request, available as `ctx.scope`, and disposes it when the response closes.

The scope is held while the downstream middlewares run, so any middleware that awaits its work can use `ctx.scope` without calling `retain()`, also when the client disconnects early. Streamed bodies keep working since disposal waits for the response to close.

Work that is not awaited by the middleware chain, such as callbacks or fire-and-forget promises, should hold the scope itself:

```js
router.get("/users", (ctx) => {
  const hold = ctx.scope.retain();
  ctx.scope.resolve(UserService).refreshCache(() => {
    hold[Symbol.asyncDispose]();
  });
  ctx.status = 202;
});
```
