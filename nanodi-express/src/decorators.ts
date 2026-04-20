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

export function controllerDecorator<T extends RegistrationConstructor<Controller>>(
  method: "get" | "post" | "put" | "delete",
  path: string
) {
  return function (value: T, context: ClassDecoratorContext) {
    setMetadata(value, context, "nanodi:controller", { method, path });
  };
}

export function middlewareDecorator<T extends RegistrationConstructor<Controller>>(...middlewares: express.RequestHandler[]) {
  return function (value: T, context: ClassDecoratorContext) {
    setMetadata(value, context, "nanodi:controller-middlewares", middlewares);
  };
}

export const controller = Object.assign(controllerDecorator, {
  middleware: middlewareDecorator,
});

export function autobindControllers(app: express.Application, controllerClasses: RegistrationConstructor<Controller>[]) {
  for (const controllerClass of controllerClasses) {
    const metadata = controllerClass[Symbol.metadata];
    if (!metadata) {
      throw new Error(`No @controller metadata found for class: ${controllerClass.name}`);
    }

    const { method, path } = metadata["nanodi:controller"] as { method: "get" | "post" | "put" | "delete"; path: string };
    const middlewares = metadata["nanodi:controller-middlewares"] as express.RequestHandler[] ?? [];
    const controllerKey = getInjectableClassKey(controllerClass);
    app.use(requestHandler(method, path, middlewares, controllerKey));
  }
}

export function autobindInjectableControllers(app: express.Application, services: ServiceCollection) {
  const registrations = services.getByMetadata("nanodi:controller");

  for (const registration of registrations) {
    const metadata = registration.useClass[Symbol.metadata];
    if (!metadata) {
      throw new Error(`No @controller metadata found for class: ${registration.useClass.name}`);
    }

    const { method, path } = metadata["nanodi:controller"] as { method: "get" | "post" | "put" | "delete"; path: string };
    const middlewares = metadata["nanodi:controller-middlewares"] as express.RequestHandler[] ?? [];
    const controllerKey = getInjectableClassKey(registration.useClass);
    app.use(requestHandler(method, path, middlewares, controllerKey));
  }
}
