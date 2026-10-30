import { FRIEND } from "./friend.js";
import { keyName } from "./keyName.js";
import { Registration, RegistrationClass, RegistrationConstructor, RegistrationConstructorParameters, RegistrationKey } from "./Registration.js";
import { ServiceProvider } from "./ServiceProvider.js";

export class ServiceCollection {
  private frozen: boolean = false;
  private services: Map<RegistrationKey<any>, Registration<any>> = new Map();

  /** Register a service with a specific key and registration details. */
  register<T>(key: RegistrationKey<T>, registration: Registration<T>): void {
    if (this.frozen) {
      throw new Error("Cannot register new services after provider is created");
    }

    if (this.services.has(key)) {
      throw new Error(`Service already registered for key: ${keyName(key)}`);
    }

    this.services.set(key, registration);
  }

  /** Register a constant value shared by all scopes. Never disposed by the provider. */
  registerValue<T>(key: RegistrationKey<T>, value: T): void {
    this.register<T>(key, { lifetime: "value", useValue: value });
  }

  /** Register a service class with typed constructor bindings. */
  registerClass<K, C extends RegistrationConstructor<K>>(key: RegistrationKey<K>, lifetime: "singleton" | "scoped" | "transient", useClass: C, ...args: RegistrationConstructorParameters<C>): void {
    this.register<K>(key, { lifetime, useClass, args });
  }

  /** Register a service instantiated by factory callback. */
  registerFactory<T>(key: RegistrationKey<T>, lifetime: "singleton" | "scoped" | "transient", useFactory: (provider: ServiceProvider) => T): void {
    this.register<T>(key, { lifetime, useFactory });
  }

  /** Declare a value supplied per scope with ServiceProvider.setScopedValue(), e.g. the current request. */
  registerScopedValue<T>(key: RegistrationKey<T>): void {
    this.register(key, { lifetime: "scopedValue" });
  }

  /**
   * Checks the dependency graph of class registrations: missing registrations, circular dependencies,
   * and singletons depending on scoped or scopedValue services, also through transients.
   * Factory dependencies are not known until called and are not checked.
   * Throws an AggregateError listing every problem found.
   */
  validate(): void {
    const errors: Error[] = [];
    const visiting: RegistrationKey<any>[] = [];
    const visited = new Set<RegistrationKey<any>>();

    const visit = (key: RegistrationKey<any>) => {
      if (visited.has(key)) {
        return;
      }

      const index = visiting.indexOf(key);
      if (index !== -1) {
        const cycle = [...visiting.slice(index), key].map(keyName).join(" -> ");
        errors.push(new Error(`Circular dependency detected: ${cycle}`));
        return;
      }

      const registration = this.services.get(key);
      if (!registration || !("useClass" in registration)) {
        return;
      }

      visiting.push(key);
      for (const arg of registration.args || []) {
        if (!this.services.has(arg)) {
          errors.push(new Error(`No registration found for key: ${keyName(arg)} (required by ${keyName(key)})`));
          continue;
        }

        visit(arg);
      }

      visiting.pop();
      visited.add(key);
    };

    // Same rule as resolve(): a singleton cannot reach a scoped or scopedValue service, also not through transients
    const visitSingleton = (singletonKey: RegistrationKey<any>, key: RegistrationKey<any>, seen: Set<RegistrationKey<any>>) => {
      const registration = this.services.get(key);
      if (!registration || !("useClass" in registration)) {
        return;
      }

      for (const arg of registration.args || []) {
        const argRegistration = this.services.get(arg);
        if (!argRegistration || seen.has(arg)) {
          continue;
        }

        seen.add(arg);
        if (argRegistration.lifetime === "scoped" || argRegistration.lifetime === "scopedValue") {
          errors.push(new Error(`Cannot resolve ${argRegistration.lifetime} service '${keyName(arg)}' from singleton '${keyName(singletonKey)}'`));
        } else if (argRegistration.lifetime === "transient") {
          visitSingleton(singletonKey, arg, seen);
        }
      }
    };

    for (const [key, registration] of this.services) {
      visit(key);

      if (registration.lifetime === "singleton") {
        visitSingleton(key, key, new Set([key]));
      }
    }

    if (errors.length > 0) {
      const details = errors.map(e => `  - ${e.message}`).join("\n");
      throw new AggregateError(errors, `Invalid service registrations:\n${details}`);
    }
  }

  /** Freeze the collection and return the root provider. */
  createProvider(): ServiceProvider {
    this.frozen = true;
    return new ServiceProvider(FRIEND, this);
  }

  /** Get the registration for a key, or undefined if not registered. */
  get<T>(key: RegistrationKey<T>): Registration<T> | undefined {
    return this.services.get(key);
  }

  /** Get the class registrations whose class has the given decorator metadata key. */
  getByMetadata(metadataKey: string | symbol): RegistrationClass<any>[] {
    const registrations: RegistrationClass<any>[] = [];
    for (const registration of this.services.values()) {
      if ("useClass" in registration) {
        const meta = registration.useClass[Symbol.metadata];
        if (meta && metadataKey in meta) {
          registrations.push(registration);
        }
      }
    }

    return registrations;
  }
}
