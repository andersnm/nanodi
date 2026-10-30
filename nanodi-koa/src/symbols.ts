import { registrationSymbol } from "@nanodi/core";
import type * as Koa from "koa";

/** Scoped value key for the current Koa context. Register with registerScopedValue(). */
export const ContextKey = registrationSymbol<Koa.Context>("Context");
