import express from "express";

export abstract class MessageHandler<TRequest, TResponse> {
  async handle(req: express.Request, res: express.Response) {
    try {
      const response = await this.message(req.body)
      res.send(JSON.stringify(response));
    } catch (err: any) {
      console.error("Message error", err);
      res.send("Error: " + err.message);
    }
  }

  abstract message(request: TRequest): Promise<TResponse>;
}
