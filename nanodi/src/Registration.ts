import { ServiceProvider } from "./ServiceProvider.js";

export type RegistrationConstructor<T> = new (...args: any[]) => T;
export type RegistrationSymbol<T> = symbol & { __type__: T };

/** Injection token type. A reference to an object of type T. Can be a string, symbol, or class. */
export type RegistrationKey<T> = string | RegistrationSymbol<T> | RegistrationConstructor<T>;

/** Helper to get the underlying type of a RegistrationSymbol<T>. Useful when T is anonymous. */
export type RegistrationSymbolType<K> = K extends RegistrationKey<infer T> ? T : never;

/** Helper to transform constructor parameters into an array of named RegistrationKey<T> where T is the original parameter type. */
export type RegistrationConstructorParameters<T extends RegistrationConstructor<any>> = MapToKeys<ConstructorParameters<T>>; 

type MapToKeys<T extends any[]> = {
  [K in keyof T]: RegistrationKey<T[K]>
};

export type Lifetime = "value" | "singleton" | "scoped" | "transient" | "seed";

export interface RegistrationValue<T> {
  lifetime: "value";
  useValue: T;
}

export interface RegistrationSeed {
  lifetime: "seed";
}

export interface RegistrationClass<T> {
  lifetime: "singleton" | "scoped" | "transient";
  useClass: RegistrationConstructor<T>;
  args?: RegistrationKey<any>[]; 
}

export interface RegistrationFactory<T> {
  lifetime: "singleton" | "scoped" | "transient";
  useFactory: (provider: ServiceProvider) => T;
}

export type Registration<T> =
  | RegistrationValue<T>
  | RegistrationSeed
  | RegistrationClass<T>
  | RegistrationFactory<T>;

export function registrationSymbol<T = any>(name: string): RegistrationSymbol<T> {
  return Symbol(name) as RegistrationSymbol<T>;
}
