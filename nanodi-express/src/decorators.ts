import { RegistrationConstructor, ServiceCollection, getInjectableClassKey } from "@nanodi/core";
import * as express from "express";
import { Controller } from "./Controller.js";
import { requestHandler } from "./middlewares.js";

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
  method: "get" | "post" | "put" | "delete",
  path: string
) {
  return function (value: T, context: ClassDecoratorContext) {
    setMetadata(value, context, "nanodi:controller", { method, path });
  };
}

/** `@controller.middleware(...middlewares)` runs the middlewares before the controller on its route. */
export function middlewareDecorator<T extends RegistrationConstructor<Controller>>(...middlewares: express.RequestHandler[]) {
  return function (value: T, context: ClassDecoratorContext) {
    setMetadata(value, context, "nanodi:controller-middlewares", middlewares);
  };
}

export const controller = Object.assign(controllerDecorator, {
  middleware: middlewareDecorator,
});

function bindController(app: express.Application, controllerClass: RegistrationConstructor<Controller>) {
  const metadata = controllerClass[Symbol.metadata];
  const route = metadata?.["nanodi:controller"] as { method: "get" | "post" | "put" | "delete"; path: string } | undefined;
  if (!route) {
    throw new Error(`No @controller metadata found for class: ${controllerClass.name}`);
  }

  const middlewares = metadata!["nanodi:controller-middlewares"] as express.RequestHandler[] ?? [];
  const controllerKey = getInjectableClassKey(controllerClass);
  app.use(requestHandler(route.method, route.path, middlewares, controllerKey));
}

/** Adds a route for each class decorated with @controller(). The classes must be registered in the provider. */
export function autobindControllers(app: express.Application, controllerClasses: RegistrationConstructor<Controller>[]) {
  for (const controllerClass of controllerClasses) {
    bindController(app, controllerClass);
  }
}

/** Adds a route for each class in the collection decorated with @controller(). */
export function autobindInjectableControllers(app: express.Application, services: ServiceCollection) {
  for (const registration of services.getByMetadata("nanodi:controller")) {
    bindController(app, registration.useClass);
  }
}
