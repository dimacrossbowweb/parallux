import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  autorun,
  batch,
  isObservable,
  makeActions,
  makeObservable,
  ObservableSet,
  reaction,
  shallowEqual,
  untracked,
  when,
} from './observer';

const box = <T>(value: T) => makeObservable({ value }, ['value']);

/** Ошибки реакций уходят в `queueMicrotask`; перехватываем их, чтобы проверить. */
const catchReported = (): unknown[] => {
  const reported: unknown[] = [];

  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
    try {
      callback();
    } catch (error) {
      reported.push(error);
    }
  });

  return reported;
};

describe('observer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('autorun', () => {
    it('runs at once and again on every change of what it read', () => {
      const a = box(1);
      const seen: number[] = [];
      const stop = autorun(() => seen.push(a.value));

      a.value = 2;
      a.value = 2;
      stop();
      a.value = 3;

      expect(seen).toEqual([1, 2]);
    });

    it('follows only what the last run read', () => {
      const flag = box(true);
      const a = box(1);
      const b = box(1);
      const run = vi.fn(() => (flag.value ? a.value : b.value));

      autorun(run);
      flag.value = false;
      run.mockClear();

      a.value = 2;
      expect(run).not.toHaveBeenCalled();

      b.value = 2;
      expect(run).toHaveBeenCalledOnce();
    });

    it('does not follow what is read untracked', () => {
      const a = box(1);
      const run = vi.fn(() => untracked(() => a.value));

      autorun(run);
      a.value = 2;

      expect(run).toHaveBeenCalledOnce();
    });

    it('keeps other reactions running when one throws, and reports the error', () => {
      const reported = catchReported();
      const a = box(1);
      const seen: number[] = [];

      autorun(() => {
        if (a.value === 2) throw new Error('boom');
      });
      autorun(() => seen.push(a.value));

      a.value = 2;

      expect(seen).toEqual([1, 2]);
      expect(reported).toEqual([new Error('boom')]);
    });

    it('stops a reaction that keeps invalidating itself', () => {
      const reported = catchReported();
      const a = box(0);

      autorun(() => {
        a.value += 1;
      });

      expect(reported).toEqual([expect.objectContaining({
        message: expect.stringMatching(/keep invalidating/),
      })]);
    });
  });

  describe('batch', () => {
    it('runs reactions once after all changes', () => {
      const a = box(1);
      const b = box(1);
      const seen: number[] = [];

      autorun(() => seen.push(a.value + b.value));

      const result = batch(() => {
        a.value = 2;
        batch(() => {
          b.value = 3;
        });
        expect(seen).toEqual([2]);

        return 'done';
      });

      expect(result).toBe('done');
      expect(seen).toEqual([2, 5]);
    });

    it('wraps methods so that their changes come together', () => {
      const point = makeObservable({
        x: 0,
        y: 0,
        move(x: number, y: number) {
          this.x = x;
          this.y = y;
        },
      }, ['x', 'y']);
      const seen: number[][] = [];

      makeActions(point, ['move']);
      autorun(() => seen.push([point.x, point.y]));
      point.move(1, 2);

      expect(seen).toEqual([[0, 0], [1, 2]]);
      expect(Object.keys(point)).toEqual(['x', 'y']);
    });
  });

  describe('reaction', () => {
    it('calls the effect only when the value changes', () => {
      const a = box(1);
      const effect = vi.fn();

      reaction(() => a.value > 1, effect);
      a.value = 2;
      a.value = 3;
      a.value = 0;

      expect(effect.mock.calls).toEqual([[true], [false]]);
    });

    it('compares with the passed equality', () => {
      const a = box(1);
      const effect = vi.fn();

      reaction(() => ({ even: a.value % 2 === 0 }), effect, { equals: shallowEqual });
      a.value = 3;
      a.value = 4;

      expect(effect).toHaveBeenCalledOnce();
    });

    it('does not follow what the effect reads', () => {
      const a = box(1);
      const other = box(1);
      const effect = vi.fn(() => other.value);

      reaction(() => a.value, effect);
      a.value = 2;
      other.value = 2;

      expect(effect).toHaveBeenCalledOnce();
    });

    it('runs synchronously when changed from inside another reaction', () => {
      const a = box(1);
      const b = box(0);
      const order: string[] = [];

      reaction(() => a.value, (value) => {
        b.value = value * 10;
        order.push(`a:${value}`);
      });
      autorun(() => order.push(`b:${b.value}`));

      a.value = 2;

      expect(order).toEqual(['b:0', 'a:2', 'b:20']);
    });
  });

  describe('when', () => {
    it('resolves at once if the condition already holds', async () => {
      await expect(when(() => true)).resolves.toBeUndefined();
    });

    it('resolves once the condition becomes true, and stops following', async () => {
      const a = box(0);
      const predicate = vi.fn(() => a.value > 1);
      const done = when(predicate);

      a.value = 1;
      a.value = 2;
      await done;
      predicate.mockClear();
      a.value = 3;

      expect(predicate).not.toHaveBeenCalled();
    });
  });

  describe('makeObservable', () => {
    it('marks fields once and keeps them enumerable', () => {
      const point = makeObservable({ x: 1, y: 2 }, ['x']);

      expect(isObservable(point, 'x')).toBe(true);
      expect(isObservable(point, 'y')).toBe(false);
      expect({ ...point }).toEqual({ x: 1, y: 2 });
      expect(() => makeObservable(point, ['x'])).toThrow(/already observable/);
    });
  });

  describe('ObservableSet', () => {
    it('reports reads and real changes only', () => {
      const set = new ObservableSet([1, 2]);
      const seen: number[][] = [];

      autorun(() => seen.push([...set]));
      set.add(2);
      set.delete(5);
      set.add(3);
      set.delete(1);
      set.clear();
      set.clear();

      expect(seen).toEqual([[1, 2], [1, 2, 3], [2, 3], []]);
    });

    it('follows size and has', () => {
      const set = new ObservableSet<string>();
      const seen: [number, boolean][] = [];

      autorun(() => seen.push([set.size, set.has('a')]));
      set.add('a');

      expect(seen).toEqual([[0, false], [1, true]]);
      expect(set).toBeInstanceOf(Set);
    });
  });

  describe('shallowEqual', () => {
    it('compares own fields one level deep', () => {
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
      expect(shallowEqual<unknown>(1, 1)).toBe(true);
      expect(shallowEqual<unknown>(null, {})).toBe(false);
    });
  });
});
