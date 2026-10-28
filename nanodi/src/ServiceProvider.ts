import { FRIEND } from "./friend.js";
import { keyName } from "./keyName.js";
import { Registration, RegistrationConstructor, RegistrationKey } from "./Registration.js";
import { ServiceCollection } from "./ServiceCollection.js";
import { ServiceDisposer } from "./ServiceDisposer.js";

interface Resolution {
  key: RegistrationKey<any>;
  registration: Registration<any>;
}

export class ServiceProvider implements AsyncDisposable {
  private services: ServiceCollection;
  private instances: Map<RegistrationKey<any>, any> = new Map();
  private parentProvider?: ServiceProvider;
  private resolutionStack: Resolution[];
  private disposer: ServiceDisposer;

  constructor(friend: symbol, services: ServiceCollection, parentProvider?: ServiceProvider) {
    if (friend !== FRIEND) {
      throw new Error("ServiceProvider constructor is private. Use ServiceCollection.createProvider() instead.");
    }

    this.services = services;
    this.parentProvider = parentProvider;
    this.resolutionStack = parentProvider ? parentProvider.resolutionStack : [];
    this.disposer = new ServiceDisposer(parentProvider?.disposer);
  }

  setScopedValue<T>(key: RegistrationKey<T>, value: T): void {
    if (this.disposer.state === "disposed") {
      throw new Error("Cannot use a disposed provider");
    }

    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`No registration found for key: ${keyName(key)}`);
    }

    if (registration.lifetime !== "scopedValue") {
      throw new Error(`Registration for key: ${keyName(key)} must have "scopedValue" lifetime. Use registerScopedValue()`);
    }

    if (!this.parentProvider) {
      throw new Error(`Cannot set scoped value for key: ${keyName(key)} in the root provider. Use createScope()`);
    }

    if (this.instances.has(key)) {
      throw new Error(`Scoped value for key: ${keyName(key)} has already been set`);
    }

    this.instances.set(key, value);
  }

  resolve<T>(key: RegistrationKey<T>): T {
    if (this.disposer.state === "disposed") {
      throw new Error("Cannot use a disposed provider");
    }

    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`No registration found for key: ${keyName(key)}`);
    }

    if (this.resolutionStack.some(r => r.key === key)) {
      const cycle = [...this.resolutionStack.map(r => keyName(r.key)), keyName(key)].join(" -> ");
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    if (registration.lifetime === "scoped" || registration.lifetime === "scopedValue") {
      const singleton = this.resolutionStack.find(r => r.registration.lifetime === "singleton");
      if (singleton) {
        throw new Error(`Cannot resolve ${registration.lifetime} service '${keyName(key)}' from singleton '${keyName(singleton.key)}'`);
      }

      if (!this.parentProvider) {
        throw new Error(`Cannot resolve ${registration.lifetime} service '${keyName(key)}' from the root provider. Use createScope()`);
      }
    }

    this.resolutionStack.push({ key, registration });

    try {
      return this.resolveRegistration(key, registration);
    } finally {
      this.resolutionStack.pop();
    }
  }

  private createInstance<T extends RegistrationConstructor<any>>(useClass: T, args: RegistrationKey<any>[]): InstanceType<T> {
    const factoryArgs = args.map(k => this.resolve(k));
    return new useClass(...factoryArgs);
  }

  private track(instance: unknown): void {
    // Providers are never owned by another provider, e.g. when a factory returns the provider to make it injectable.
    if (!(instance instanceof ServiceProvider)) {
      this.disposer.track(instance);
    }
  }

  private resolveRegistration<T>(key: RegistrationKey<T>, registration: Registration<T>): T {
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    let instance;
    if (registration.lifetime === "scoped" && "useClass" in registration) {
      instance = this.createInstance(registration.useClass, registration.args || []);
      this.instances.set(key, instance);
      this.track(instance);
      return instance;
    }

    if (registration.lifetime === "scoped" && "useFactory" in registration) {
      instance = registration.useFactory(this);
      this.instances.set(key, instance);
      this.track(instance);
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
        this.track(instance);
        return instance;
      }

      if (registration.lifetime === "singleton" && "useFactory" in registration) {
        instance = registration.useFactory(this);
        this.instances.set(key, instance);
        this.track(instance);
        return instance;
      }

      if (registration.lifetime === "scopedValue") {
        throw new Error(`Scoped value for key: ${keyName(key)} has not been set. Use setScopedValue()`);
      }

      throw new Error(`Invalid registration for key: ${keyName(key)}`);
    }
  }

  createScope(): ServiceProvider {
    if (this.disposer.state !== "active") {
      throw new Error("Cannot create scope from a disposing or disposed provider");
    }

    return new ServiceProvider(FRIEND, this.services, this);
  }

  /** Prevents this provider from completing disposal until the returned hold is disposed. */
  retain(): AsyncDisposable {
    if (this.disposer.state !== "active") {
      throw new Error("Cannot retain a disposing or disposed provider");
    }

    return new ServiceDisposer(this.disposer);
  }

  /**
   * Waits for all scopes created from this provider to be disposed, then disposes owned instances in reverse creation order.
   * Never resolves while a scope is not disposed. Repeated calls return the same promise.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.disposer[Symbol.asyncDispose]();
  }
}
