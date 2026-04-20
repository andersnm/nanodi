import * as express from "express";
import { RegistrationKey, ServiceProvider } from "@nanodi/core";
import { RequestKey, ResponseKey } from "./symbols.js";
import { Controller } from "./Controller.js";

// app.use() this before any routes
export function requestScopeMiddleware(provider: ServiceProvider): express.RequestHandler {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const scope = provider.createScope();
    req.scope = scope;

    scope.seed(RequestKey, req);
    scope.seed(ResponseKey, res);

    let finished = false;
    const cleanup = () => {
      if (!finished) {
        finished = true;
        // await scope[Symbol.asyncDispose]?.();
      }
    };

    res.on("finish", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);

    try {
      next();
    } catch (err) {
      cleanup();
      throw err;
    }
  }
}

// app.use() this to run the provided middleware on every request
export function requestHandlerMiddleware(key: RegistrationKey<Controller>): express.RequestHandler {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const scope = req.scope!;
      const controller = scope.resolve(key);
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
