import test from "node:test";
import assert from "node:assert/strict";
import Router from "@koa/router";
import { injectable } from "@nanodi/core";
import { type Controller, autobindControllers } from "@nanodi/koa";

test("autobindControllers throws a clear error for a class without @controller", () => {
  // Has decorator metadata, but not from @controller()
  @injectable("scoped")
  class NotAController implements Controller {
    async handle() {}
  }

  assert.throws(() => autobindControllers(new Router(), [NotAController]), /No @controller metadata found for class: NotAController/);
});
