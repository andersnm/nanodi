import { RegistrationKey } from "./Registration.js";

// Package-internal helper for error messages. Class keys print their name instead of their source.
export function keyName(key: RegistrationKey<any>): string {
  return typeof key === "function" ? key.name : key.toString();
}
