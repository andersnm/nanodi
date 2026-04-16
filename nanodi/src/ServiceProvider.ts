import { FRIEND } from "./friend.js";
import { Registration, RegistrationConstructor, RegistrationKey, MapToKeys } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";

interface Resolution {
  key: RegistrationKey<any>;
  registration: Registration;
}

export class ServiceProvider {
  private services: ServiceCollection;
  private instances: Map<RegistrationKey<any>, any> = new Map();
  private parentProvider?: ServiceProvider;
  private resolutionStack: Resolution[] = [];
  public static currentProvider?: ServiceProvider;

  constructor(friend: symbol, services: ServiceCollection, parentProvider?: ServiceProvider) {
    if (friend !== FRIEND) {
      throw new Error("ServiceProvider constructor is private. Use ServiceCollection.createProvider() instead.");
    }

    this.services = services;
    this.parentProvider = parentProvider;
  }

  resolve<T>(key: RegistrationKey<T>): T {
    const previousProvider = ServiceProvider.currentProvider;
    ServiceProvider.currentProvider = this;

    try {
      return this.resolveInternal(key);
    } finally {
      ServiceProvider.currentProvider = previousProvider;
    }
  }

  seed<T>(key: RegistrationKey<T>, instance: T): void {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`No registration found for key: ${key.toString()}`);
    }

    if (registration.lifetime !== "scoped") {
      throw new Error(`Registration for key: ${key.toString()} does not support seeding`);
    }

    if (this.instances.has(key)) {
      throw new Error(`Instance for key: ${key.toString()} has already been resolved and cannot be seeded`);
    }

    this.instances.set(key, instance);
  }

  protected resolveInternal<T>(key: RegistrationKey<T>): T {
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`No registration found for key: ${key.toString()}`);
    }

    if (this.resolutionStack.some(r => r.key === key)) {
      const cycle = [...this.resolutionStack.map(r => r.key.toString()), key.toString()].join(" -> ");
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    const resolutionTop = this.resolutionStack[this.resolutionStack.length - 1];

    if (registration.lifetime === "scoped" && resolutionTop && resolutionTop.registration.lifetime !== "scoped") {
      throw new Error(`Cannot resolve scoped service '${key.toString()}' from a transient or singleton context '${resolutionTop.key.toString()}'`);
    }

    this.resolutionStack.push({ key, registration });

    try {
      return this.resolveRegistration(key, registration);
    } finally {
      this.resolutionStack.pop();
    }
  }

  private createInstance<T extends RegistrationConstructor<any>>(useClass: T): InstanceType<T> {
    const factoryKeys = this.services.getFactory<T>(useClass);
    if (factoryKeys) {
      const factoryArgs = factoryKeys.map(k => this.resolveInternal(k));
      return new useClass(...factoryArgs);
    } else {
      return new useClass();
    }
  }

  protected resolveRegistration<T>(key: RegistrationKey<T>, registration: Registration): T {
    let instance;
    if (registration.lifetime === "scoped" && registration.useClass !== undefined) {
      instance = this.createInstance(registration.useClass);
      this.instances.set(key, instance);
      return instance;
    }

    if (registration.lifetime === "scoped" && registration.useFactory !== undefined) {
      instance = registration.useFactory(this);
      this.instances.set(key, instance);
      return instance;
    }

    if (registration.lifetime === "transient" && registration.useClass !== undefined) {
      return this.createInstance(registration.useClass);
    }

    if (registration.lifetime === "transient" && registration.useFactory !== undefined) {
      return registration.useFactory(this);
    }

    if (this.parentProvider) {
      return this.parentProvider.resolveInternal(key);
    } else {

      if (registration.lifetime === "value" && registration.useValue !== undefined) {
        this.instances.set(key, registration.useValue);
        return registration.useValue;
      }

      if (registration.lifetime === "singleton" && registration.useClass !== undefined) {
        instance = this.createInstance(registration.useClass);
        this.instances.set(key, instance);
        return instance;
      }

      if (registration.lifetime === "singleton" && registration.useFactory !== undefined) {
        instance = registration.useFactory(this);
        this.instances.set(key, instance);
        return instance;
      }

      throw new Error(`Invalid registration for key: ${key.toString()}`);
    }
  }

  createScope(): ServiceProvider {
    return new ServiceProvider(FRIEND, this.services, this);
  }
}

export function provide<T>(key: RegistrationKey<T>): T {
  if (!ServiceProvider.currentProvider) throw new Error("No active DI provider in this context");
  return ServiceProvider.currentProvider.resolve(key);
}
