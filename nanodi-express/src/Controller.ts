import * as express from "express";

export interface Controller {
  handle(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any>;
}
