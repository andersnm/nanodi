import { RegistrationConstructor, RegistrationConstructorParameters, RegistrationKey } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";

/*
typesafe syntax:

@injectable<typeof My>("scoped", inject("test"), inject("hallo")) 
class My {
  constructor(public test: string, public hallo: number) {
  }
}
*/

interface Injectee<T extends RegistrationConstructor<any>> {
  lifetime: "scoped" | "transient" | "singleton";
  type: RegistrationConstructor<T>;
  tokens: RegistrationConstructorParameters<T>;
}

const registry: Injectee<any>[] = [];

export function injectable<T extends new (...args: any[]) => any>(
  lifetime: "scoped" | "transient" | "singleton",
  ...tokens: RegistrationConstructorParameters<T>
) {
  return (value: T, context: ClassDecoratorContext<T>) => {
    registry.push({ lifetime, type: value, tokens } );
  };
}

export function inject<T>(key: RegistrationKey<T>): RegistrationKey<T> {
  return key;
}

export function autobindInjectables(collection: ServiceCollection) {
  for (let registration of registry) {
    collection.register(registration.type, { lifetime: registration.lifetime, useClass: registration.type });
    collection.bind(registration.type, registration.tokens);
  }
}

export function clearInjectables() {
  registry.length = 0;
}
