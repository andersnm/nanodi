import { AsyncLocalStorage } from 'async_hooks';

const FRIEND = Symbol("friend");

export type RegistrationConstructor<T> = new (...args: any[]) => T;
export type RegistrationKey<T> = string | Symbol | RegistrationConstructor<T>;

export type Registration =
  | { useValue: any }
  | { useSingletonClass: RegistrationConstructor<any> }
  | { useSingletonFactory: (...args: any[]) => any }
  | { useScopedClass: RegistrationConstructor<any> }
  | { useScopedFactory: (...args: any[]) => any }
  | { useTransientClass: RegistrationConstructor<any> }
  | { useTransientFactory: () => any };

export class ServiceCollection {
  private frozen: boolean = false;
  private services: Map<RegistrationKey<any>, Registration> = new Map()

  register(key: RegistrationKey<any>, registration: Registration): void {
    if (this.frozen) {
      throw new Error("Cannot register new services after provider is created");
    }

    this.services.set(key, registration);
  }

  createProvider(): ServiceProvider {
    this.frozen = true;
    return new ServiceProvider(FRIEND, this);
  }

  get(key: RegistrationKey<any>): Registration | undefined {
    return this.services.get(key);
  }
}

interface Resolution {
  key: RegistrationKey<any>;
  registration: Registration;
}

function isScopedSingleton(registration: Registration): boolean {
  return "useScopedClass" in registration || "useScopedFactory" in registration;
}

export class ServiceProvider {
  private services: ServiceCollection;
  private instances: Map<RegistrationKey<any>, any> = new Map();
  private parentProvider?: ServiceProvider;
  private resolutionStack: Resolution[] = [];

  constructor(friend: symbol, services: ServiceCollection, parentProvider?: ServiceProvider) {
    if (friend !== FRIEND) {
      throw new Error("ServiceProvider constructor is private. Use ServiceCollection.createProvider() instead.");
    }

    this.services = services;
    this.parentProvider = parentProvider;
  }

  resolve<T>(key: RegistrationKey<T>): T {
    return GlobalServiceManager.runWith(this, () => {
      return this.resolveInternal(key);
    });
  }

  protected resolveInternal<T>(key: RegistrationKey<T>): T {
    let instance = this.instances.get(key);
    if (instance) {
      return instance;
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

    if (isScopedSingleton(registration) && resolutionTop && !isScopedSingleton(resolutionTop.registration)) {
      throw new Error(`Cannot resolve scoped service '${key.toString()}' from a transient or singleton context '${resolutionTop.key.toString()}'`);
    }

    this.resolutionStack.push({ key, registration });

    try {
      return this.resolveRegistration(key, registration);
    } finally {
      this.resolutionStack.pop();
    }

  }

  protected resolveRegistration<T>(key: RegistrationKey<T>, registration: Registration): T {
    let instance;
    if ("useScopedClass" in registration) {
      instance = new registration.useScopedClass();
      this.instances.set(key, instance);
      return instance;
    }

    if ("useScopedFactory" in registration) {
      instance = registration.useScopedFactory();
      this.instances.set(key, instance);
      return instance;
    }

    if ('useTransientClass' in registration) {
      return new registration.useTransientClass();
    }

    if ('useTransientFactory' in registration) {
      return registration.useTransientFactory();
    }

    if (this.parentProvider) {
      return this.parentProvider.resolveInternal(key);
    } else {

      if ("useValue" in registration) {
        this.instances.set(key, registration.useValue);
        return registration.useValue;
      }

      if ("useSingletonClass" in registration) {
        instance = new registration.useSingletonClass();
        this.instances.set(key, instance);
        return instance;
      }

      if ("useSingletonFactory" in registration) {
        instance = registration.useSingletonFactory();
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

class GlobalServiceManager {
  private static storage = new AsyncLocalStorage<ServiceProvider>();

  static runWith<T>(provider: ServiceProvider, fn: () => T): T {
    return this.storage.run(provider, fn);
  }

  static getCurrentProvider(): ServiceProvider {
    const provider = this.storage.getStore();
    if (!provider) throw new Error("No active DI provider in this context");
    return provider;
  }
}

export function inject<T>(key: RegistrationKey<T>): T {
  return GlobalServiceManager.getCurrentProvider().resolve(key);
}
