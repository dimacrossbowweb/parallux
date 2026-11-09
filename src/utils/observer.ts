/* eslint-disable max-classes-per-file -- атом, реакция и Set делят состояние модуля */
/**
 * Небольшой наблюдатель вместо внешней библиотеки реактивности.
 *
 * Чтение наблюдаемого значения внутри реакции подписывает её на это значение,
 * запись помечает подписанные реакции как устаревшие. Реакции перезапускаются
 * синхронно: сразу после записи или, если запись шла внутри `batch`, по его окончании.
 */

export type TDisposer = () => void;

export type TEquals<T> = (a: T, b: T) => boolean;

/** Защита от бесконечного цикла, когда реакции меняют то, за чем сами следят. */
const MAX_RUNS = 10_000;

let tracking: Reaction | null = null;

let batchDepth = 0;

let flushing = false;

const pending = new Set<Reaction>();

/** Ошибка в одной реакции не должна останавливать остальные. */
const report = (error: unknown): void => {
  queueMicrotask(() => {
    throw error;
  });
};

class Reaction {
  readonly #onInvalidate: () => void;

  #deps = new Set<Atom>();

  #disposed = false;

  constructor(onInvalidate: () => void) {
    this.#onInvalidate = onInvalidate;
  }

  /** Выполняет `fn`, подписываясь заново ровно на то, что она прочитала. */
  track<T>(fn: () => T): T {
    this.#unsubscribe();

    const previous = tracking;

    // Это не псевдоним, а текущая отслеживающая реакция модуля.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    tracking = this;

    try {
      return fn();
    } finally {
      tracking = previous;
    }
  }

  link(atom: Atom): void {
    if (!this.#disposed) this.#deps.add(atom);
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  run(): void {
    if (this.#disposed) return;

    try {
      this.#onInvalidate();
    } catch (error) {
      report(error);
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#unsubscribe();
    pending.delete(this);
  }

  #unsubscribe(): void {
    this.#deps.forEach((atom) => atom.unobserve(this));
    this.#deps.clear();
  }
}

function flush(): void {
  if (batchDepth > 0 || flushing) return;

  flushing = true;

  // Реакции запускаются вне чужого отслеживания: иначе их чтения достались бы ему.
  const previous = tracking;
  let runs = 0;

  tracking = null;

  try {
    while (pending.size) {
      runs += 1;

      if (runs > MAX_RUNS) {
        pending.clear();
        throw new Error('parallux: reactions keep invalidating each other');
      }

      const [next] = pending;

      pending.delete(next);
      next.run();
    }
  } finally {
    tracking = previous;
    flushing = false;
  }
}

/** Наблюдаемое значение без собственного содержимого: только подписка и оповещение. */
export class Atom {
  #observers = new Set<Reaction>();

  reportObserved(): void {
    if (!tracking || tracking.disposed) return;

    this.#observers.add(tracking);
    tracking.link(this);
  }

  reportChanged(): void {
    this.#observers.forEach((observer) => pending.add(observer));
    flush();
  }

  unobserve(observer: Reaction): void {
    this.#observers.delete(observer);
  }
}

/** Выполняет `fn` без подписки на прочитанное. */
export function untracked<T>(fn: () => T): T {
  const previous = tracking;

  tracking = null;

  try {
    return fn();
  } finally {
    tracking = previous;
  }
}

/** Откладывает реакции до конца `fn`, чтобы несколько изменений дали один перезапуск. */
export function batch<T>(fn: () => T): T {
  batchDepth += 1;

  try {
    return fn();
  } finally {
    batchDepth -= 1;
    flush();
  }
}

/** Выполняет `fn` сейчас и заново при каждом изменении того, что она прочитала. */
export function autorun(fn: () => void): TDisposer {
  const runner: Reaction = new Reaction(() => runner.track(fn));

  runner.run();

  return () => runner.dispose();
}

/**
 * Следит за результатом `expression` и вызывает `effect` с новым значением,
 * когда оно меняется. Сразу `effect` не вызывается. То, что читает `effect`, не отслеживается.
 */
export function reaction<T>(
  expression: () => T,
  effect: (value: T) => void,
  { equals = Object.is }: { equals?: TEquals<T> } = {},
): TDisposer {
  let value: T;
  const watcher: Reaction = new Reaction(() => {
    const next = watcher.track(expression);

    if (equals(value, next)) return;

    value = next;
    untracked(() => effect(next));
  });

  value = watcher.track(expression);

  return () => watcher.dispose();
}

/** Завершается, как только `predicate` станет истинным. */
export function when(predicate: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let stop: TDisposer | null = null;

    stop = autorun(() => {
      if (done || !predicate()) return;

      done = true;
      resolve();
      stop?.();
    });

    if (done) stop();
  });
}

/** Сравнение объектов по собственным полям, на один уровень. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;

  const keys = Object.keys(a);

  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.is(a[key as keyof T], b[key as keyof T]));
}

const observed = new WeakMap<object, Set<PropertyKey>>();

/** Превращает поля объекта в наблюдаемые. Запись того же значения никого не оповещает. */
export function makeObservable<T extends object>(target: T, keys: (keyof T)[]): T {
  const marked = observed.get(target) ?? new Set();

  keys.forEach((key) => {
    if (marked.has(key)) throw new Error(`parallux: ${String(key)} is already observable`);

    const atom = new Atom();
    let value = target[key];

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get() {
        atom.reportObserved();

        return value;
      },
      set(next: T[keyof T]) {
        if (Object.is(next, value)) return;

        value = next;
        atom.reportChanged();
      },
    });
    marked.add(key);
  });

  observed.set(target, marked);

  return target;
}

export function isObservable<T extends object>(target: T, key: keyof T): boolean {
  return observed.get(target)?.has(key) ?? false;
}

/**
 * Оборачивает методы объекта в `batch`. Обёртки не перечисляются,
 * поэтому не попадают в `toJSON` и расширение объекта.
 */
export function makeActions<T extends object>(target: T, keys: (keyof T)[]): T {
  keys.forEach((key) => {
    const method = target[key];

    if (typeof method !== 'function') return;

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (...args: unknown[]) => batch(() => method.apply(target, args)),
    });
  });

  return target;
}

/** `Set`, чтение которого отслеживается, а изменение оповещает реакции. */
export class ObservableSet<T> extends Set<T> {
  readonly #atom = new Atom();

  constructor(items?: Iterable<T> | null) {
    super();
    [...(items ?? [])].forEach((item) => super.add(item));
  }

  override get size(): number {
    this.#atom.reportObserved();

    return super.size;
  }

  override has(value: T): boolean {
    this.#atom.reportObserved();

    return super.has(value);
  }

  override forEach(callback: (value: T, key: T, set: Set<T>) => void, thisArg?: unknown): void {
    this.#atom.reportObserved();
    super.forEach(callback, thisArg);
  }

  override values(): SetIterator<T> {
    this.#atom.reportObserved();

    return super.values();
  }

  override keys(): SetIterator<T> {
    this.#atom.reportObserved();

    return super.keys();
  }

  override entries(): SetIterator<[T, T]> {
    this.#atom.reportObserved();

    return super.entries();
  }

  override [Symbol.iterator](): SetIterator<T> {
    this.#atom.reportObserved();

    return super[Symbol.iterator]();
  }

  override add(value: T): this {
    if (!super.has(value)) {
      super.add(value);
      this.#atom.reportChanged();
    }

    return this;
  }

  override delete(value: T): boolean {
    const deleted = super.delete(value);

    if (deleted) this.#atom.reportChanged();

    return deleted;
  }

  override clear(): void {
    if (!super.size) return;

    super.clear();
    this.#atom.reportChanged();
  }
}
