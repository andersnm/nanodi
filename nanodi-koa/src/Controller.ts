import type * as Koa from "koa";

export interface Controller {
  handle(ctx: Koa.Context, next: Koa.Next): Promise<any>;
}
