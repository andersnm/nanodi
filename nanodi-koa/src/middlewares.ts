import type * as Koa from "koa";
import type Router from "@koa/router";
import { RegistrationKey, ServiceProvider } from "@nanodi/core";
import { ContextKey } from "./symbols.js";
import { Controller } from "./Controller.js";

export interface RequestScopeOptions {
  /** Called when disposing a request scope fails. Defaults to console.error. */
  onDisposeError?: (err: unknown) => void;
}

/**
 * app.use() this before any routes - makes ctx.scope available to all following middlewares.
 * The scope is held until the downstream middlewares settle, and disposed after the response closes.
 */
export function requestScopeMiddleware(provider: ServiceProvider, options?: RequestScopeOptions): Koa.Middleware {
  const onDisposeError = options?.onDisposeError ?? (err => console.error("Error disposing request scope", err));

  return async (ctx: Koa.Context, next: Koa.Next) => {
    const scope = provider.createScope();
    ctx.scope = scope;

    scope.setScopedValue(ContextKey, ctx);

    // Streamed bodies are written after the middlewares return, so dispose on close rather than here
    ctx.res.once("close", () => {
      scope[Symbol.asyncDispose]().catch(onDisposeError);
    });

    // Keep the scope alive while downstream runs, also if the response closes early
    await using hold = scope.retain();
    await next();
  };
}

/** Runs a controller as middleware */
export function requestHandlerMiddleware(key: RegistrationKey<Controller>): Koa.Middleware {
  return async (ctx: Koa.Context, next: Koa.Next) => {
    if (!ctx.scope) {
      throw new Error("ctx.scope is missing. Use requestScopeMiddleware() before any routes");
    }

    const controller = ctx.scope.resolve(key);
    await controller.handle(ctx, next);
  };
}

/** Registers a controller route on the router */
export function requestHandler(router: Router, method: "get" | "post" | "put" | "patch" | "delete", path: string, middlewares: Koa.Middleware[], key: RegistrationKey<Controller>): void {
  router[method](path, ...middlewares, requestHandlerMiddleware(key));
}
