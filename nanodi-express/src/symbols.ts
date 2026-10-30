import { registrationSymbol } from "@nanodi/core";
import * as express from "express";

/** Scoped value key for the current request. Register with registerScopedValue(). */
export const RequestKey = registrationSymbol<express.Request>("Request");

/** Scoped value key for the current response. Register with registerScopedValue(). */
export const ResponseKey = registrationSymbol<express.Response>("Response");
