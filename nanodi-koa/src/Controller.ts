import type * as Koa from "koa";

/** A request handler class resolved from ctx.scope for each request. Errors propagate to upstream middleware. */
export interface Controller {
  handle(ctx: Koa.Context, next: Koa.Next): Promise<any>;
}
