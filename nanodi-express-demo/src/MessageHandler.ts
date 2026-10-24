import express from "express";

export abstract class MessageHandler<TRequest, TResponse> {
  async handle(req: express.Request, res: express.Response) {
    const response = await this.message(req.body);
    res.json(response);
  }

  abstract message(request: TRequest): Promise<TResponse>;
}
