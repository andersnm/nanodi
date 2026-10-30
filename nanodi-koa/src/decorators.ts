import { RegistrationConstructor, ServiceCollection, getInjectableClassKey } from "@nanodi/core";
import type * as Koa from "koa";
import type Router from "@koa/router";
import { Controller } from "./Controller.js";
import { requestHandler } from "./middlewares.js";

type Method = "get" | "post" | "put" | "patch" | "delete";

function setMetadata<T extends new (...args: any[]) => any>(value: T, context: ClassDecoratorContext<T>, key: string|symbol, metaValue: any) {
  if (context.metadata) {
    // Native ES semantics
    context.metadata[key] = metaValue;
  } else {
    // TS downlevel semantics
    const meta = value[Symbol.metadata] ??= {};
    meta[key] = metaValue;
  }
}

/** `@controller(method, path)` routes requests to the class' handle(). Use with autobindControllers() or autobindInjectableControllers(). */
export function controllerDecorator<T extends RegistrationConstructor<Controller>>(
  method: Method,
  path: string
) {
  return function (value: T, context: ClassDecoratorContext) {
    setMetadata(value, context, "nanodi:controller", { method, path });
  };
}

/** `@controller.middleware(...middlewares)` runs the middlewares before the controller on its route. */
export function middlewareDecorator<T extends RegistrationConstructor<Controller>>(...middlewares: Koa.Middleware[]) {
  return function (value: T, context: ClassDecoratorContext) {
    setMetadata(value, context, "nanodi:controller-middlewares", middlewares);
  };
}

export const controller = Object.assign(controllerDecorator, {
  middleware: middlewareDecorator,
});

function bindController(router: Router, controllerClass: RegistrationConstructor<Controller>) {
  const metadata = controllerClass[Symbol.metadata];
  const route = metadata?.["nanodi:controller"] as { method: Method; path: string } | undefined;
  if (!route) {
    throw new Error(`No @controller metadata found for class: ${controllerClass.name}`);
  }

  const middlewares = metadata!["nanodi:controller-middlewares"] as Koa.Middleware[] ?? [];
  const controllerKey = getInjectableClassKey(controllerClass);
  requestHandler(router, route.method, route.path, middlewares, controllerKey);
}

/** Adds a route to the router for each class decorated with @controller(). The classes must be registered in the provider. */
export function autobindControllers(router: Router, controllerClasses: RegistrationConstructor<Controller>[]) {
  for (const controllerClass of controllerClasses) {
    bindController(router, controllerClass);
  }
}

/** Adds a route to the router for each class in the collection decorated with @controller(). */
export function autobindInjectableControllers(router: Router, services: ServiceCollection) {
  for (const registration of services.getByMetadata("nanodi:controller")) {
    bindController(router, registration.useClass);
  }
}
