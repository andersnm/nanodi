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

function keyDecorator<K>(key: RegistrationKey<K>) {
  return <T extends RegistrationConstructor<K>>(value: T, context: ClassDecoratorContext<T>) => {
    setMetadata(value, context, "nanodi:injectable.key", key);
  };
}

// Create magic function-object with @injectable() and @injectable.key()

/**
 * `@injectable(lifetime, ...args)` specifies the lifetime and type-checked constructor bindings used by autobindInjectables().
 * `@injectable.key(key)` registers the class under another key, e.g. an abstract base class.
 */
export const injectable = Object.assign(injectableDecorator, {
  key: keyDecorator,
});

/** Registers classes decorated with @injectable() in the collection. Throws if a class is not decorated. */
export function autobindInjectables(collection: ServiceCollection, useClasses: RegistrationConstructor<any>[]) {
  for (let useClass of useClasses) {
    const metadata = useClass[Symbol.metadata];
    const registration = metadata?.["nanodi:injectable"] as Injectable | undefined;
    if (!registration) {
      throw new Error(`No @injectable metadata found for class: ${useClass.name}`);
    }

    const key = getInjectableClassKey(useClass);
    collection.registerClass(key, registration.lifetime, useClass, ...registration.args || []);
  }
}

/** Returns the key a decorated class is registered under: the @injectable.key() key, or else the class itself. */
export function getInjectableClassKey(useClass: RegistrationConstructor<any>): RegistrationKey<any> {
  const metadata = useClass[Symbol.metadata];
  if (!metadata) {
    throw new Error(`No @injectable metadata found for class: ${useClass.name}`);
  }

  const injectableKey = metadata["nanodi:injectable.key"] as RegistrationKey<any>;
  return injectableKey || useClass;
}
