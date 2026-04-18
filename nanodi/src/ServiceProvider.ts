import { FRIEND } from "./friend.js";
import { Registration, RegistrationConstructor, RegistrationKey } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";

interface Resolution {
  key: RegistrationKey<any>;
  registration: Registration<any>;
}

export class ServiceProvider {
  private services: ServiceCollection;
  private instances: Map<RegistrationKey<any>, any> = new Map();
  private parentProvider?: ServiceProvider;
  private static resolutionStack: Resolution[] = [];

  constructor(friend: symbol, services: ServiceCollection, parentProvider?: ServiceProvider) {
    if (friend !== FRIEND) {
      throw new Error("ServiceProvider constructor is private. Use ServiceCollection.createProvider() instead.");
    }

    this.services = services;
    this.parentProvider = parentProvider;
  }

  seed<T>(key: RegistrationKey<T>, instance: T): void {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`No registration found for key: ${key.toString()}`);
    }

    if (registration.lifetime !== "seed") {
      throw new Error(`Registration for key: ${key.toString()} must have "seed" lifetime`);
    }

    if (this.instances.has(key)) {
      throw new Error(`Instance for key: ${key.toString()} has already been resolved and cannot be seeded`);
    }

    this.instances.set(key, instance);
  }

  resolve<T>(key: RegistrationKey<T>): T {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`No registration found for key: ${key.toString()}`);
    }

    if (ServiceProvider.resolutionStack.some(r => r.key === key)) {
      const cycle = [...ServiceProvider.resolutionStack.map(r => r.key.toString()), key.toString()].join(" -> ");
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    const resolutionTop = ServiceProvider.resolutionStack[ServiceProvider.resolutionStack.length - 1];

    if (registration.lifetime === "scoped" && resolutionTop && resolutionTop.registration.lifetime !== "scoped") {
      throw new Error(`Cannot resolve scoped service '${key.toString()}' from a transient or singleton context '${resolutionTop.key.toString()}'`);
    }

    ServiceProvider.resolutionStack.push({ key, registration });

    try {
      return this.resolveRegistration(key, registration);
    } finally {
      ServiceProvider.resolutionStack.pop();
    }
  }

  private createInstance<T extends RegistrationConstructor<any>>(useClass: T, args: RegistrationKey<any>[]): InstanceType<T> {
    const factoryArgs = args.map(k => this.resolve(k));
    return new useClass(...factoryArgs);
  }

  private resolveRegistration<T>(key: RegistrationKey<T>, registration: Registration<T>): T {
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    let instance;
    if (registration.lifetime === "scoped" && "useClass" in registration) {
      instance = this.createInstance(registration.useClass, registration.args || []);
      this.instances.set(key, instance);
      return instance;
    }

    if (registration.lifetime === "scoped" && "useFactory" in registration) {
      instance = registration.useFactory(this);
      this.instances.set(key, instance);
      return instance;
    }

    if (registration.lifetime === "transient" && "useClass" in registration) {
      return this.createInstance(registration.useClass, registration.args || []);
    }

    if (registration.lifetime === "transient" && "useFactory" in registration) {
      return registration.useFactory(this);
    }

    if (this.parentProvider) {
      return this.parentProvider.resolveRegistration(key, registration);
    } else {

      if (registration.lifetime === "value" && "useValue" in registration) {
        this.instances.set(key, registration.useValue);
        return registration.useValue;
      }

      if (registration.lifetime === "singleton" && "useClass" in registration) {
        instance = this.createInstance(registration.useClass, registration.args || []);
        this.instances.set(key, instance);
        return instance;
      }

      if (registration.lifetime === "singleton" && "useFactory" in registration) {
        instance = registration.useFactory(this);
        this.instances.set(key, instance);
        return instance;
      }

      if (registration.lifetime === "seed") {
        throw new Error(`Key: ${key.toString()} has not been seeded`);
      }

      throw new Error(`Invalid registration for key: ${key.toString()}`);
    }
  }

  createScope(): ServiceProvider {
    return new ServiceProvider(FRIEND, this.services, this);
  }
}
