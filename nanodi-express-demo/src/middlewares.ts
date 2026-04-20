import express from "express";
import { z, ZodError } from "zod";

export const zodErrorHandler = (): express.ErrorRequestHandler => {
  return (err, req, res, next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        issues: err.issues,
      });
    }

    next(err);
  };
};

export const defaultErrorHandler = (): express.ErrorRequestHandler => {
  return (err, req, res, next) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
    });
  };
};

export const zodValidate = (schema: z.ZodObject<any>): express.RequestHandler => {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      console.error("Validation error:", err);
      next(err);
    }
  };
};

export const mergeBody = (): express.RequestHandler => {
  return (req, res, next) => {
    let merged = {};
    if (req.body) {
      merged = { ...merged, ...req.body };
    }

    if (req.query) {
      merged = { ...merged, ...req.query };
    }

    if (req.params) {
      merged = { ...merged, ...req.params };
    }

    req.body = merged;
    next();
  };
};
