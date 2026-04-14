import { ServiceProvider } from "./ServiceProvider.js";

export type RegistrationConstructor<T> = new (...args: any[]) => T;
export type RegistrationKey<T> = string | Symbol | RegistrationConstructor<T>;

export type MapToKeys<T extends any[]> = {
  [K in keyof T]: RegistrationKey<T[K]>
};

type Only<T, K extends keyof T> =
  T & { [P in Exclude<keyof T, K>]?: never };

type Strategy = {
  useValue?: any;
  useClass?: RegistrationConstructor<any>;
  useFactory?: (provider: ServiceProvider) => any;
};

type Lifetime = "value" | "singleton" | "scoped" | "transient";

type RegistrationBase<L extends Lifetime> = { lifetime: L };

export type ValueRegistration =
  RegistrationBase<"value"> &
  Only<Strategy, "useValue">;

export type SingletonRegistration =
  RegistrationBase<"singleton"> &
  (Only<Strategy, "useClass"> | Only<Strategy, "useFactory">);

export type ScopedRegistration =
  RegistrationBase<"scoped"> &
  (Only<Strategy, "useClass"> | Only<Strategy, "useFactory">);

export type TransientRegistration =
  RegistrationBase<"transient"> &
  (Only<Strategy, "useClass"> | Only<Strategy, "useFactory">);

export type Registration =
  | ValueRegistration
  | SingletonRegistration
  | ScopedRegistration
  | TransientRegistration;
