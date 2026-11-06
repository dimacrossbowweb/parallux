import { gsap } from 'gsap';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { Layer } from './entities/layer/layer';
import { Parallux, type TParalluxOptions } from './parallux';

const FAST = { duration: 20, easing: 'none' };

const glareEl = (): HTMLElement | null => (
  document.body.querySelector<HTMLElement>(':scope > [aria-hidden="true"]')
);

const button = (text: string): HTMLButtonElement => {
  const el = document.createElement('button');

  el.textContent = text;

  return el;
};

const layerWith = (...children: HTMLElement[]): HTMLElement => {
  const el = document.createElement('div');

  el.append(...children);

  return el;
};

describe('Parallux', () => {
  let app: Parallux;

  const create = (options: TParalluxOptions = {}): Parallux => {
    app = new Parallux({ transition: FAST, rotation: FAST, ...options });

    return app;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    app?.destroy();
  });

  describe('chain', () => {
    it('returns itself from every chain method', () => {
      create();

      expect(app.add({ z: 0 }).add(new Layer({ z: 1 })).mount()).toBe(app);
      expect(app.moveTo(1).moveBy(-1).removeByZ(1).removeByName('x')).toBe(app);
      expect(app.removeById('x').pop()).toBe(app);
    });

    it('mounts into the body by default', () => {
      create().add({ z: 0 }).mount();

      expect(app.layers[0].el.parentElement).toBe(document.body);
    });

    it('mounts into a passed container', () => {
      const container = document.createElement('div');

      create({ container }).add({ z: 0 }).mount();

      expect(app.layers[0].el.parentElement).toBe(container);
    });

    it('keeps working after mount', () => {
      create().add({ z: 0 }).mount().add({ z: 1 });

      expect(document.body.querySelectorAll(':scope > div').length).toBe(3);
    });

    it('mounts once, and can mount again after destroy', () => {
      create({ glare: { enabled: false } }).add({ z: 0 }).mount().mount();
      expect(document.body.children).toHaveLength(1);

      app.destroy();
      expect(document.body.children).toHaveLength(0);

      app.mount();
      expect(document.body.children).toHaveLength(1);
    });

    it('accepts a number or coordinates as a target', async () => {
      create().add({ z: 0 }).add({ z: 2 }).mount();

      await app.flyTo(2);
      await app.flyTo({ x: 5 });
      await app.flyBy({ y: 1 });
      await app.flyBy(-1);

      expect(app.camera).toMatchObject({ x: 5, y: 1, z: 1 });
    });

    it('rotates with a promise', async () => {
      create().add({ z: 0 }).mount();

      await app.rotateTo(10);
      await app.rotateBy(5);

      expect(app.viewModel.frame.angle).toBe(15);
    });

    it('moves the camera before mount without waiting', async () => {
      create({ transition: { duration: 60000 } }).add({ z: 0 }).add({ z: 1 });

      await app.flyTo(1);

      expect(app.mount().viewModel.frame.z).toBe(1);
    });
  });

  describe('open and close', () => {
    it('places a layer without z on top and moves the camera to it', async () => {
      create().add({ z: 0 }).mount();

      await app.open({ name: 'menu' });

      expect(app.camera.z).toBe(1);
      expect(app.layers.map(({ name }) => name)).toContain('menu');
    });

    it('accepts a ready layer and an explicit z', async () => {
      create().add({ z: 0 }).mount();

      await app.open(new Layer({ z: 5 }));
      expect(app.camera.z).toBe(5);

      await app.open({ z: 7 });
      expect(app.camera.z).toBe(7);
    });

    it('moves focus into the layer at once and returns it on close', async () => {
      const trigger = button('open');
      const first = button('first');

      create().add({ z: 0, el: layerWith(trigger) }).mount();
      trigger.focus();

      const opening = app.open({ el: layerWith(first, button('second')) });

      expect(document.activeElement).toBe(first);

      await opening;
      await app.close();

      expect(document.activeElement).toBe(trigger);
    });

    it('focuses the requested element', async () => {
      const wanted = button('wanted');

      create().add({ z: 0 }).mount();

      await app.open({ el: layerWith(button('first'), wanted) }, { focus: wanted });

      expect(document.activeElement).toBe(wanted);
    });

    it('makes the covered layer inert until it is uncovered', async () => {
      create().add({ z: 0 }).mount();

      const [page] = app.layers;

      await app.open({ name: 'menu' });
      expect(page.el.inert).toBe(true);

      await app.close();
      expect(page.el.inert).toBe(false);
    });

    it('removes the layer only after the camera has left', async () => {
      create().add({ z: 0 }).mount();
      await app.open({ name: 'menu' });

      const closing = app.close();

      expect(app.layers).toHaveLength(2);

      await closing;

      expect(app.layers).toHaveLength(1);
      expect(app.camera.z).toBe(0);
    });

    it('closes layers one by one', async () => {
      create().add({ z: 0 }).mount();
      await app.open({ name: 'menu' });
      await app.open({ name: 'modal' });

      await app.close();

      expect(app.layers.map(({ name }) => name)).toEqual(['', 'menu']);
      expect(app.camera.z).toBe(1);
      expect(app.layers[1].el.inert).toBe(false);
      expect(app.layers[0].el.inert).toBe(true);
    });

    it('closes everything at once and restores the first focus', async () => {
      const trigger = button('open');

      create().add({ z: 0, el: layerWith(trigger) }).mount();
      trigger.focus();

      await app.open({ el: layerWith(button('a')) });
      await app.open({ el: layerWith(button('b')) });
      await app.closeAll();

      expect(app.layers).toHaveLength(1);
      expect(app.camera.z).toBe(0);
      expect(app.layers[0].el.inert).toBe(false);
      expect(document.activeElement).toBe(trigger);
    });

    it('keeps the layer until the camera has left, even if the move is interrupted', async () => {
      create({ transition: { duration: 150, easing: 'none' } }).add({ z: 0 }).mount();
      await app.open({ name: 'menu' }, { duration: 0 });

      const closing = app.close();

      app.flyTo({ x: 5 });
      await Promise.resolve();
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });

      expect(app.layers).toHaveLength(2);

      await closing;

      expect(app.layers).toHaveLength(1);
      expect(app.viewModel.frame.z).toBe(0);
    });

    it('finishes closing when destroyed halfway', async () => {
      create({ transition: { duration: 60000 } }).add({ z: 0 }).mount();
      await app.open({ name: 'menu' }, { duration: 0 });

      const closing = app.close();

      app.destroy();

      await expect(closing).resolves.toBeUndefined();
    });

    it('does nothing when there is nothing to close', async () => {
      create().add({ z: 0 }).mount();

      await expect(app.close()).resolves.toBeUndefined();
      await expect(app.closeAll()).resolves.toBeUndefined();
      expect(app.layers).toHaveLength(1);
    });

    it('uses the speed passed to open', async () => {
      create({ transition: { duration: 60000 } }).add({ z: 0 }).mount();

      await app.open({ name: 'menu' }, { duration: 10 });

      expect(app.viewModel.frame.z).toBe(1);
    });
  });

  describe('lookAt', () => {
    const place = (el: HTMLElement, props: Record<string, number | HTMLElement>): void => {
      Object.entries(props).forEach(([key, value]) => {
        Object.defineProperty(el, key, { value, configurable: true });
      });
    };

    const scene = () => {
      const container = document.createElement('div');
      const layerEl = document.createElement('div');
      const item = document.createElement('div');

      place(container, { clientWidth: 1000, clientHeight: 600 });
      place(layerEl, {
        offsetLeft: 0, offsetTop: 0, offsetParent: container,
      });
      place(item, {
        offsetLeft: 880, offsetTop: 100, offsetWidth: 40, offsetHeight: 20, offsetParent: layerEl,
      });

      return { container, layerEl, item };
    };

    it('approaches the element by the configured share of the way', async () => {
      const { container, layerEl, item } = scene();

      create({ container, approach: 0.5 }).add({ z: 0, el: layerEl }).mount();

      await app.lookAt(item);

      // Центр элемента: 900, 110. Центр контейнера: 500, 300.
      expect(app.camera).toMatchObject({ x: 200, y: -95 });
    });

    it('accepts its own approach and speed', async () => {
      const { container, layerEl, item } = scene();

      create({ container }).add({ z: 0, el: layerEl }).mount();

      await app.lookAt(item, { approach: 1, duration: 10 });

      expect(app.camera).toMatchObject({ x: 400, y: -190 });
    });

    it('does not depend on where the camera is', async () => {
      const { container, layerEl, item } = scene();

      create({ container }).add({ z: 0, el: layerEl }).mount();
      await app.flyTo({ x: 999, y: 999 });

      await app.lookAt(item, { approach: 1 });

      expect(app.camera).toMatchObject({ x: 400, y: -190 });
    });

    it('takes the scroll of the layer into account', async () => {
      const { container, layerEl, item } = scene();

      place(layerEl, { scrollTop: 50 });
      create({ container }).add({ z: 0, el: layerEl, scrollable: true }).mount();

      await app.lookAt(item, { approach: 1 });

      expect(app.camera.y).toBe(-240);
    });
  });

  describe('view', () => {
    it('sets up the container and positions layers', () => {
      const container = document.createElement('div');

      create({ container }).add({ z: 3, width: 100 }).mount();

      const { style } = app.layers[0].el;

      expect(container.style).toMatchObject({
        position: 'relative', overflow: 'hidden', isolation: 'isolate',
      });
      expect(style).toMatchObject({ position: 'absolute', width: '100px', zIndex: '3' });
    });

    it('removes a passed element from the container with its layer', () => {
      const el = document.createElement('section');

      create().add({ z: 0 }).add({ z: 1, el }).mount();
      expect(el.isConnected).toBe(true);

      app.removeByZ(1);
      expect(el.isConnected).toBe(false);
    });

    it('turns the pointer position into a -1..1 range', async () => {
      const container = document.createElement('div');

      container.getBoundingClientRect = () => ({
        left: 0, top: 0, width: 100, height: 100,
      }) as DOMRect;

      create({ container, pointer: FAST }).add({ z: 0 }).mount();

      container.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 50 }));
      await vi.waitFor(() => expect(app.viewModel.frame.pointerX).toBe(1));
      expect(app.viewModel.frame.pointerY).toBe(0);

      container.dispatchEvent(new MouseEvent('pointerleave'));
      await vi.waitFor(() => expect(app.viewModel.frame.pointerX).toBe(0));
    });
  });

  describe('resize', () => {
    let notify: () => void;
    const disconnect = vi.fn();

    beforeEach(() => {
      disconnect.mockClear();
      vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) {
          notify = callback;
        }

        observe = vi.fn();

        disconnect = disconnect;
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reports the container size to every listener', () => {
      const container = document.createElement('div');
      const first = vi.fn();
      const second = vi.fn();

      Object.defineProperties(container, {
        clientWidth: { value: 300 },
        clientHeight: { value: 200 },
      });

      expect(create({ container }).onResize(first).onResize(second)).toBe(app);

      app.add({ z: 0 }).mount();
      notify();

      expect(first).toHaveBeenCalledWith({ width: 300, height: 200 });
      expect(second).toHaveBeenCalledOnce();
    });

    it('stops observing on destroy', () => {
      create().add({ z: 0 }).mount();

      app.destroy();

      expect(disconnect).toHaveBeenCalledOnce();
    });
  });

  describe('glare', () => {
    const glare = { rest: 0.5 };
    // Дольше интервала опроса `vi.waitFor`, иначе движение можно не застать.
    const transition = { duration: 300, easing: 'none' };

    it('is a single fixed element over the whole page', () => {
      const container = document.createElement('div');

      document.body.append(container);
      create({ container, glare }).add({ z: 0 }).add({ z: 1 }).mount();

      expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
      expect(glareEl()?.parentElement).toBe(document.body);
      expect(glareEl()?.style).toMatchObject({ position: 'fixed', pointerEvents: 'none' });
    });

    const shift = (): number => Math.abs(Number(gsap.getProperty(glareEl(), 'xPercent')));
    const scale = (): number => Number(gsap.getProperty(glareEl(), 'scale'));
    const settled = (): Promise<void> => vi.waitFor(() => {
      expect(scale()).toBe(1);
      expect(glareEl()?.style.opacity).toBe('0.5');
    });

    it('appears from the enlarged state and stays', async () => {
      create({ glare }).add({ z: 0 }).mount();

      expect(scale()).toBeGreaterThan(1);
      expect(shift()).toBeGreaterThan(0);

      await settled();

      expect(shift()).toBe(0);
    });

    it('grows and shifts a little, then returns, when the layer changes', async () => {
      create({ glare, transition }).add({ z: 0 }).add({ z: 1 }).mount();
      await settled();

      const started = performance.now();

      app.moveTo(1);

      await vi.waitFor(() => expect(scale()).toBeGreaterThan(1.05));
      expect(shift()).toBeLessThan(8);
      expect(glareEl()?.style.opacity).toBe('0.5');

      await settled();

      expect(performance.now() - started).toBeLessThan(transition.duration + 200);
    });

    it('follows the speed passed to the camera', async () => {
      create({ glare, transition }).add({ z: 0 }).add({ z: 1 }).mount();
      await settled();

      const moving = app.flyTo(1, { duration: 2000, easing: 'none' });

      await new Promise((resolve) => {
        setTimeout(resolve, transition.duration + 100);
      });

      expect(scale()).toBeGreaterThan(1);

      app.moveTo(0);
      await moving;
    });

    it('fades out when no layer is left under the camera', async () => {
      create({ glare, transition }).add({ name: 'a', z: 0 }).mount();
      await settled();

      app.removeByName('a');

      await vi.waitFor(() => expect(glareEl()?.style.opacity).toBe('0'));
    });

    it('stays still on pan and rotation', async () => {
      create({ glare }).add({ z: 0 }).mount();
      await settled();

      await app.flyTo({ x: 10 });
      await app.rotateTo(5);

      expect(scale()).toBe(1);
    });

    it('shifts towards the source of light by the configured amount', () => {
      create({ glare: { angle: 225, shift: 10 } });

      const { shiftX, shiftY } = app.viewModel.glare;

      expect(shiftX).toBeCloseTo(7.07);
      expect(shiftY).toBeCloseTo(-7.07);
    });

    it('stands in place when motion is reduced', () => {
      create({ reducedMotion: 'always', glare }).add({ z: 0 }).mount();

      expect(scale()).toBe(1);
      expect(glareEl()?.style.opacity).toBe('0.5');
    });

    it('uses a linear gradient from the configured direction', () => {
      create({ glare: { angle: 90, color: 'red', size: 80 } }).add({ z: 0 });

      expect(app.viewModel.glare.background)
        .toBe('linear-gradient(90deg, red 0%, red 30%, transparent 70%, transparent 80%)');
    });

    it('can be turned off', () => {
      create({ glare: { enabled: false } }).add({ z: 0 }).mount();

      expect(glareEl()).toBeNull();
    });

    it('is removed on destroy', () => {
      create({ glare }).add({ z: 0 }).mount();

      app.destroy();

      expect(glareEl()).toBeNull();
    });
  });
});
