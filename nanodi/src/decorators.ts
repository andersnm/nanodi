import { RegistrationClass, RegistrationConstructorParameters, RegistrationKey } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";

const registry: RegistrationClass<any>[] = [];
const keyMap: Map<Function, RegistrationKey<any>> = new Map();

function injectableDecorator<T extends new (...args: any[]) => any>(
  lifetime: "scoped" | "transient" | "singleton",
  ...args: RegistrationConstructorParameters<T>
) {
  return (value: T, context: ClassDecoratorContext<T>) => {
    registry.push({ lifetime, useClass: value, args } );
  };
}

function keyDecorator<T extends new (...args: any[]) => any>(
  key: RegistrationKey<InstanceType<T>>
) {
  return (value: T, context: ClassDecoratorContext<T>) => {
    keyMap.set(value, key);
  };
}

// Create magic function-object with @injectable() and @injectable.key()
export const injectable = Object.assign(injectableDecorator, {
  key: keyDecorator,
});

export function inject<T>(key: RegistrationKey<T>): RegistrationKey<T> {
  return key;
}

export function autobindInjectables(collection: ServiceCollection) {
  for (let registration of registry) {
    const key = keyMap.get(registration.useClass) || registration.useClass;
    collection.registerClass(key, registration.lifetime, registration.useClass, ...registration.args || []);
  }
}

export function clearInjectables() {
  registry.length = 0;
  keyMap.clear();
}
