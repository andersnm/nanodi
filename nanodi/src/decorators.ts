import { RegistrationConstructor, RegistrationConstructorParameters, RegistrationKey } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";

// @ts-ignore
Symbol.metadata ??= Symbol("Symbol.metadata");

interface Injectable {
  lifetime: "scoped" | "transient" | "singleton";
  args?: RegistrationKey<any>[];
}

function setMetadata<T extends new (...args: any[]) => any>(value: T, context: ClassDecoratorContext<T>, key: string|symbol, metaValue: any) {
  if (context.metadata) {
    // Native ES semantics
    context.metadata[key] = metaValue;
  } else {
    // TS downlevel semantics
    const meta = value[Symbol.metadata] ??= {};
    meta[key] = metaValue;
  }
}

function injectableDecorator<T extends new (...args: any[]) => any>(
  lifetime: "scoped" | "transient" | "singleton",
  ...args: RegistrationConstructorParameters<T>
) {
  return (value: T, context: ClassDecoratorContext<T>) => {
    const injection: Injectable = { lifetime, args } ;
    setMetadata(value, context, "nanodi:injectable", injection);
  };
}

function keyDecorator<T extends new (...args: any[]) => any>(
  key: RegistrationKey<InstanceType<T>>
) {
  return (value: T, context: ClassDecoratorContext<T>) => {
    setMetadata(value, context, "nanodi:injectable.key", key);
  };
}

// Create magic function-object with @injectable() and @injectable.key()
export const injectable = Object.assign(injectableDecorator, {
  key: keyDecorator,
});

export function inject<T>(key: RegistrationKey<T>): RegistrationKey<T> {
  return key;
}

export function autobindInjectables(collection: ServiceCollection, useClasses: RegistrationConstructor<any>[]) {
  for (let useClass of useClasses) {
    const metadata = useClass[Symbol.metadata];
    if (!metadata) {
      throw new Error(`No @injectable metadata found for class: ${useClass.name}`);
    }

    const registration = metadata["nanodi:injectable"] as Injectable;
    const injectableKey = metadata["nanodi:injectable.key"] as RegistrationKey<any>;
    const key = injectableKey || useClass;
    collection.registerClass(key, registration.lifetime, useClass, ...registration.args || []);
  }
}

export function getInjectableClassKey(useClass: RegistrationConstructor<any>): RegistrationKey<any> {
  const metadata = useClass[Symbol.metadata];
  if (!metadata) {
    throw new Error(`No @injectable metadata found for class: ${useClass.name}`);
  }

  const injectableKey = metadata["nanodi:injectable.key"] as RegistrationKey<any>;
  return injectableKey || useClass;
}
