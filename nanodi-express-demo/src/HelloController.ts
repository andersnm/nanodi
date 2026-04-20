import { z } from "zod";
import { injectable } from "@nanodi/core";
import { controller } from "@nanodi/express";
import { MessageHandler } from "./MessageHandler.js";
import { mergeBody, zodValidate } from "./middlewares.js";

export const HelloRequestSchema = z.object({
  id: z.coerce.number(),
});

export const HelloResponseSchema = z.object({
  echo: z.number(),
  result_code: z.number(),
  error_message: z.string(),
});

export type HelloRequest = z.infer<typeof HelloRequestSchema>;
export type HelloResponse = z.infer<typeof HelloResponseSchema>;

@injectable("scoped")
@controller("get", "/hello")
@controller.middleware(mergeBody(), zodValidate(HelloRequestSchema))
export class HelloController extends MessageHandler<HelloRequest, HelloResponse> {
  async message(request: HelloRequest): Promise<HelloResponse> {
    return {
      echo: request.id,
      result_code: 0,
      error_message: "Hello world!"
    };
  }
}
