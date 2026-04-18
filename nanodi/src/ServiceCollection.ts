import { FRIEND } from "./friend.js";
import { Registration, RegistrationConstructor, RegistrationConstructorParameters, RegistrationKey } from "./Registration.js";
import { ServiceProvider } from "./ServiceProvider.js";

export class ServiceCollection {
  private frozen: boolean = false;
  private services: Map<RegistrationKey<any>, Registration<any>> = new Map();

  /** Register a service with a specific key and registration details. */
  register<T>(key: RegistrationKey<T>, registration: Registration<T>): void {
    if (this.frozen) {
      throw new Error("Cannot register new services after provider is created");
    }

    this.services.set(key, registration);
  }

  /** Register a service class with typed constructor bindings. */
  registerClass<T extends RegistrationConstructor<any>>(key: RegistrationKey<InstanceType<T>>, lifetime: "singleton" | "scoped" | "transient", useClass: T, ...args: RegistrationConstructorParameters<T>): void {
    if (this.frozen) {
      throw new Error("Cannot register new services after provider is created");
    }

    this.register<InstanceType<T>>(key, { lifetime, useClass, args });
  }

  /** Register a service instantiated by factory callback. */
  registerFactory<T>(key: RegistrationKey<T>, lifetime: "singleton" | "scoped" | "transient", useFactory: (provider: ServiceProvider) => T): void {
    if (this.frozen) {
      throw new Error("Cannot register new services after provider is created");
    }

    this.register<T>(key, { lifetime, useFactory });
  }

  createProvider(): ServiceProvider {
    this.frozen = true;
    return new ServiceProvider(FRIEND, this);
  }

  get<T>(key: RegistrationKey<T>): Registration<T> | undefined {
    return this.services.get(key);
  }
}
