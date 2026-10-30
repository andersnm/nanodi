import * as express from "express";

/** A request handler class resolved from req.scope for each request. Errors are passed to next(). */
export interface Controller {
  handle(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any>;
}
