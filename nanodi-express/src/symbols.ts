import { registrationSymbol } from "@nanodi/core";
import * as express from "express";

export const RequestKey = registrationSymbol<express.Request>("Request");
export const ResponseKey = registrationSymbol<express.Response>("Response");
