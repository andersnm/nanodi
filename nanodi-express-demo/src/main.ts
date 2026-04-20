import express from "express";
import { autobindInjectables, ServiceCollection } from "@nanodi/core";
import { autobindInjectableControllers, RequestKey, requestScopeMiddleware, ResponseKey } from "@nanodi/express";
import { HelloController } from "./HelloController.js";
import { defaultErrorHandler, zodErrorHandler } from "./middlewares.js";

async function main() {
  const services = new ServiceCollection();
  services.registerSeed(RequestKey);
  services.registerSeed(ResponseKey);
  autobindInjectables(services, [ HelloController ]);

  const provider = services.createProvider();

  const app = express();
  app.use(express.json());
  app.use(requestScopeMiddleware(provider));

  autobindInjectableControllers(app, services);

  app.use(zodErrorHandler());
  app.use(defaultErrorHandler());

  app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });
}

main().catch(err => {
  console.error("Error in main:", err);
  process.exit(1);
});
