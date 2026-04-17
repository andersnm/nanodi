import { RegistrationClass, RegistrationConstructorParameters, RegistrationKey } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";

const registry: RegistrationClass<any>[] = [];

export function injectable<T extends new (...args: any[]) => any>(
  lifetime: "scoped" | "transient" | "singleton",
  ...args: RegistrationConstructorParameters<T>
) {
  return (value: T, context: ClassDecoratorContext<T>) => {
    registry.push({ lifetime, useClass: value, args } );
  };
}

export function inject<T>(key: RegistrationKey<T>): RegistrationKey<T> {
  return key;
}

export function autobindInjectables(collection: ServiceCollection) {
  for (let registration of registry) {
    collection.registerClass(registration.useClass, registration.lifetime, ...(registration.args || []));
  }
}

export function clearInjectables() {
  registry.length = 0;
}
