import express from "express";
import { autobindInjectables, ServiceCollection } from "@nanodi/core";
import { autobindInjectableControllers, RequestKey, requestScopeMiddleware, ResponseKey } from "@nanodi/express";
import { HelloController } from "./HelloController.js";
import { defaultErrorHandler, zodErrorHandler } from "./middlewares.js";
import { ExpressServer, runProcess } from "./ExpressServer.js";

async function main() {
  const services = new ServiceCollection();
  services.registerScopedValue(RequestKey);
  services.registerScopedValue(ResponseKey);
  autobindInjectables(services, [ HelloController ]);

  const provider = services.createProvider();

  const app = express();
  app.use(express.json());
  app.use(requestScopeMiddleware(provider));

  autobindInjectableControllers(app, services);

  app.use(zodErrorHandler());
  app.use(defaultErrorHandler());

  const server = new ExpressServer(app);
  await server.start(3000);
  console.log("Server is running on http://localhost:3000");

  await runProcess();

  await server.stop();
  await provider[Symbol.asyncDispose]();
}

main().catch(err => {
  console.error("Error in main:", err);
  process.exit(1);
});
