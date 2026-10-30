import { registrationSymbol } from "@nanodi/core";
import type * as Koa from "koa";

export const ContextKey = registrationSymbol<Koa.Context>("Context");
