import { FRIEND } from "./friend.js";
import { MapToKeys, Registration, RegistrationConstructor, RegistrationKey } from "./Registration.js";
import { ServiceProvider } from "./ServiceProvider.js";

export class ServiceCollection {
  private frozen: boolean = false;
  private services: Map<RegistrationKey<any>, Registration> = new Map();
  private factories: Map<RegistrationConstructor<any>, RegistrationKey<any>[]> = new Map();

  register(key: RegistrationKey<any>, registration: Registration): void {
    if (this.frozen) {
      throw new Error("Cannot register new services after provider is created");
    }

    this.services.set(key, registration);
  }

  bind<T extends RegistrationConstructor<any>>(constructor: T, keys: MapToKeys<ConstructorParameters<T>>): void {
    if (this.frozen) {
      throw new Error("Cannot bind new services after provider is created");
    }

    this.factories.set(constructor, keys);
  }

  createProvider(): ServiceProvider {
    this.frozen = true;
    return new ServiceProvider(FRIEND, this);
  }

  get(key: RegistrationKey<any>): Registration | undefined {
    return this.services.get(key);
  }

  getFactory<T extends RegistrationConstructor<any>>(key: T): MapToKeys<ConstructorParameters<T>> | undefined {
    return this.factories.get(key) as MapToKeys<ConstructorParameters<T>> | undefined;
  }
}
