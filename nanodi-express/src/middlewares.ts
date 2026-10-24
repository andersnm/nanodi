import * as express from "express";
import { RegistrationKey, ServiceProvider } from "@nanodi/core";
import { RequestKey, ResponseKey } from "./symbols.js";
import { Controller } from "./Controller.js";

export interface RequestScopeOptions {
  /** Called when disposing a request scope fails. Defaults to console.error. */
  onDisposeError?: (err: unknown) => void;
}

/**
 * app.use() this before any routes - makes req.scope available to all following middlewares. 
 * NOTE: Non-controller request handlers using req.scope must run inside scope.retain() / .dispose() to 
 * avoid unexpected resolve errors if the client disconnects mid-flight.
 */
export function requestScopeMiddleware(provider: ServiceProvider, options?: RequestScopeOptions): express.RequestHandler {
  const onDisposeError = options?.onDisposeError ?? (err => console.error("Error disposing request scope", err));

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const scope = provider.createScope();
    req.scope = scope;

    scope.seed(RequestKey, req);
    scope.seed(ResponseKey, res);

    res.once("close", () => {
      scope[Symbol.asyncDispose]().catch(onDisposeError);
    });

    next();
  }
}

/** app.use() this to run controllers as middleware on every request */
export function requestHandlerMiddleware(key: RegistrationKey<Controller>): express.RequestHandler {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      if (!req.scope) {
        throw new Error("req.scope is missing. Use requestScopeMiddleware() before any routes");
      }

      // Keep the scope alive while the controller runs, also if the response closes early
      await using hold = req.scope.retain();
      const controller = req.scope.resolve(key);
      await controller.handle(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// app.use() this for each route
export function requestHandler(method: "get" | "post" | "put" | "delete", path: string, middlewares: express.RequestHandler[], key: RegistrationKey<Controller>): express.Router {
  const router = express.Router();
  router[method](path, ...middlewares, requestHandlerMiddleware(key));
  return router;
}
