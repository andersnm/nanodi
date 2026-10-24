// @ts-ignore
Symbol.dispose ??= Symbol("Symbol.dispose");
// @ts-ignore
Symbol.asyncDispose ??= Symbol("Symbol.asyncDispose");

function isDisposable(instance: any): instance is Disposable | AsyncDisposable {
  return instance !== null && (typeof instance === "object" || typeof instance === "function") && (Symbol.asyncDispose in instance || Symbol.dispose in instance);
}

/** Disposal bookkeeping for a provider. Forms a tree mirroring the provider and its scopes. */
export class ServiceDisposer implements AsyncDisposable {
  state: "active" | "draining" | "disposed" = "active";
  private parent?: ServiceDisposer;
  private disposables: (Disposable | AsyncDisposable)[] = [];
  private children: Set<ServiceDisposer> = new Set();
  private childrenDrained?: () => void;
  private disposePromise?: Promise<void>;

  constructor(parent?: ServiceDisposer) {
    this.parent = parent;
    parent?.children.add(this);
  }

  /** Dispose the instance with this disposer, if it implements Symbol.asyncDispose or Symbol.dispose. */
  track(instance: unknown): void {
    if (isDisposable(instance)) {
      this.disposables.push(instance);
    }
  }

  /**
   * Waits for all child disposers to be disposed, then disposes tracked instances in reverse creation order.
   * Never resolves while a child is not disposed. Repeated calls return the same promise.
   */
  [Symbol.asyncDispose](): Promise<void> {
    this.disposePromise ??= this.dispose();
    return this.disposePromise;
  }

  private async dispose(): Promise<void> {
    this.state = "draining";

    if (this.children.size > 0) {
      await new Promise<void>(resolve => this.childrenDrained = resolve);
    }

    this.state = "disposed";

    const errors: unknown[] = [];
    for (const instance of this.disposables.reverse()) {
      try {
        if (Symbol.asyncDispose in instance) {
          await instance[Symbol.asyncDispose]();
        } else {
          instance[Symbol.dispose]();
        }
      } catch (err) {
        errors.push(err);
      }
    }

    this.disposables = [];
    this.parent?.childDisposed(this);

    if (errors.length > 0) {
      throw new AggregateError(errors, "Errors occurred while disposing services");
    }
  }

  private childDisposed(child: ServiceDisposer): void {
    this.children.delete(child);
    if (this.children.size === 0) {
      this.childrenDrained?.();
    }
  }
}
