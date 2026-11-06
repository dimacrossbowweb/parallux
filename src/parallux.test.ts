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
    const glare = {
      duration: 10, easing: 'none', rest: 0.5,
    };

    it('is a single fixed element over the whole page', () => {
      const container = document.createElement('div');

      document.body.append(container);
      create({ container, glare }).add({ z: 0 }).add({ z: 1 }).mount();

      expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
      expect(glareEl()?.parentElement).toBe(document.body);
      expect(glareEl()?.style).toMatchObject({ position: 'fixed', pointerEvents: 'none' });
    });

    it('settles at the resting strength and stays', async () => {
      create({ glare }).add({ z: 0 }).mount();

      await vi.waitFor(() => expect(glareEl()?.style.opacity).toBe('0.5'));
    });

    it('flares up when the camera reaches another layer', async () => {
      // Дольше интервала опроса `vi.waitFor`, иначе вспышку можно не застать.
      create({ glare: { ...glare, duration: 200 } }).add({ z: 0 }).add({ z: 1 }).mount();
      await vi.waitFor(() => expect(glareEl()?.style.opacity).toBe('0.5'));

      app.moveTo(1);

      await vi.waitFor(() => expect(Number(glareEl()?.style.opacity)).toBeGreaterThan(0.5));
      await vi.waitFor(() => expect(glareEl()?.style.opacity).toBe('0.5'));
    });

    it('does not flare up on pan and rotation', async () => {
      create({ glare }).add({ z: 0 }).mount();
      await vi.waitFor(() => expect(glareEl()?.style.opacity).toBe('0.5'));

      await app.flyTo({ x: 10 });
      await app.rotateTo(5);

      expect(glareEl()?.style.opacity).toBe('0.5');
    });

    it('uses a linear gradient from the configured direction', () => {
      create({ glare: { angle: 90, color: 'red', size: 40 } }).add({ z: 0 });

      expect(app.viewModel.glare.background).toBe('linear-gradient(90deg, red, transparent 40%)');
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
