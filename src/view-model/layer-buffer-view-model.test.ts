import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { type TParalluxConfigOptions } from '../config/config';
import { Layer } from '../entities/layer/layer';
import { LayerBufferModel } from '../model/layer-buffer-model';
import { LayerBufferViewModel } from './layer-buffer-view-model';

const FAST = { duration: 20, easing: 'none' };

const setup = (zs: number[], config: TParalluxConfigOptions = {}) => {
  const layers = zs.map((z) => new Layer({ z }));
  const model = new LayerBufferModel({ layers: new Set(layers) });
  const viewModel = new LayerBufferViewModel(model, {
    transition: FAST, rotation: FAST, pointer: FAST, ...config,
  });

  viewModel.connect();

  const state = (layer: Layer) => {
    const found = viewModel.layers.find(({ id }) => id === layer.id);

    if (!found) throw new Error('no such layer');

    return found;
  };

  return {
    layers, model, viewModel, state,
  };
};

const moveCamera = (viewModel: LayerBufferViewModel, z: number): Promise<void> => (
  viewModel.animate('move', {}, () => viewModel.model.moveCameraTo({ z }))
);

const translate = (value: string): number[] => value.split(' ').map(parseFloat);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LayerBufferViewModel', () => {
  describe('depth', () => {
    it('sorts layers from the bottom up', () => {
      const { viewModel, layers } = setup([0, -2, -1]);

      expect(viewModel.layers.map(({ id }) => id))
        .toEqual([layers[1].id, layers[2].id, layers[0].id]);
    });

    it('fades deep layers out towards the draw distance', () => {
      const { layers: [top, middle, far], state } = setup([0, -1, -2], { drawDistance: 2 });

      expect(state(top).opacity).toBe('1');
      expect(state(middle).opacity).toBe('0.5');
      expect(state(far)).toMatchObject({
        opacity: '0', visibility: 'hidden', pointerEvents: 'none',
      });
    });

    it('shrinks deep layers', () => {
      const { layers: [top, deep], state } = setup([0, -1]);

      expect(state(top).scale).toBe('1');
      expect(Number(state(deep).scale)).toBeLessThan(1);
    });

    it('hides layers behind the camera', async () => {
      const { layers: [behind], viewModel, state } = setup([0, -1]);

      await moveCamera(viewModel, -1);

      expect(state(behind)).toMatchObject({
        opacity: '0', visibility: 'hidden', pointerEvents: 'none',
      });
      expect(Number(state(behind).scale)).toBeGreaterThan(1);
    });

    it('survives a zero draw distance', () => {
      const { layers: [top, deep], state } = setup([0, -1], { drawDistance: 0 });

      expect(state(top).opacity).toBe('1');
      expect(state(deep).opacity).toBe('0');
    });

    it('scrolls only the layers that ask for it', () => {
      const model = new LayerBufferModel({
        layers: new Set([new Layer({ z: 0, scrollable: true }), new Layer({ z: -1 })]),
      });
      const [plain, scrollable] = new LayerBufferViewModel(model).layers;

      expect(scrollable.overflowY).toBe('auto');
      expect(plain).not.toHaveProperty('overflowY');
    });

    it('converts numeric sizes to pixels', () => {
      const model = new LayerBufferModel({
        layers: new Set([new Layer({ width: 100, height: '50%' })]),
      });
      const [state] = new LayerBufferViewModel(model).layers;

      expect(state).toMatchObject({ width: '100px', height: '50%' });
    });
  });

  describe('camera', () => {
    it('leaves the frame at the start, and reaches the target by the end', async () => {
      const { viewModel } = setup([0, -1]);
      const moving = moveCamera(viewModel, -1);

      expect(viewModel.model.camera.z).toBe(-1);
      expect(viewModel.frame.z).toBe(0);

      await moving;

      expect(viewModel.frame.z).toBe(-1);
    });

    it('makes the target layer interactive at once', () => {
      const { layers: [, target], viewModel, state } = setup([0, 1]);

      moveCamera(viewModel, 1);

      expect(state(target)).toMatchObject({ visibility: 'visible', pointerEvents: 'auto' });
    });

    it('resolves at once when nothing changes', async () => {
      const { viewModel } = setup([0]);
      const started = performance.now();

      await viewModel.animate('move', { duration: 5000 }, () => {});

      expect(performance.now() - started).toBeLessThan(1000);
    });

    it('resolves an interrupted animation', async () => {
      const { viewModel } = setup([0, -1, -2]);
      const slow = viewModel.animate('move', { duration: 60000 }, () => {
        viewModel.model.moveCameraTo({ z: -2 });
      });

      await moveCamera(viewModel, -1);
      await expect(slow).resolves.toBeUndefined();
      expect(viewModel.frame.z).toBe(-1);
    });

    it('runs movement and rotation independently', async () => {
      const { viewModel } = setup([0]);
      const move = viewModel.animate('move', { duration: 80 }, () => {
        viewModel.model.moveCameraTo({ x: 100 });
      });
      const rotate = viewModel.animate('rotate', { duration: 10 }, () => {
        viewModel.model.rotateCameraTo(45);
      });

      await rotate;

      expect(viewModel.frame.angle).toBe(45);
      expect(viewModel.frame.x).toBeLessThan(100);

      await move;

      expect(viewModel.frame.x).toBe(100);
    });

    it('animates direct model changes with the default speed', async () => {
      const { viewModel, model } = setup([0, -1], { transition: { duration: 20 } });

      model.moveCameraTo({ z: -1 });
      expect(viewModel.frame.z).toBe(0);

      await vi.waitFor(() => expect(viewModel.frame.z).toBe(-1));
    });

    it('moves far layers less than near ones, and rotates the offset', async () => {
      const {
        layers: [near, far], viewModel, state,
      } = setup([0, -2]);

      await viewModel.animate('move', {}, () => viewModel.model.moveCameraTo({ x: 100 }));

      expect(translate(state(near).translate)[0]).toBeCloseTo(-100);
      expect(translate(state(far).translate)[0]).toBeGreaterThan(-100);

      await viewModel.animate('rotate', {}, () => viewModel.model.rotateCameraTo(90));

      expect(state(near).rotate).toBe('-90deg');
      expect(translate(state(near).translate)[0]).toBeCloseTo(0);
      expect(translate(state(near).translate)[1]).toBeCloseTo(100);
    });

    it('stops following the camera after disconnect', () => {
      const { viewModel, model } = setup([0, -1]);

      viewModel.disconnect();
      model.moveCameraTo({ z: -1 });

      expect(viewModel.frame.z).toBe(0);
    });
  });

  describe('pointer', () => {
    it('shifts deep layers in proportion to depth', async () => {
      const { layers: [top, deep], viewModel, state } = setup([0, -1], {
        strength: 10,
        pointer: { ...FAST, focusShift: 0 },
      });

      viewModel.setPointer(1, -1);

      await vi.waitFor(() => expect(viewModel.frame.pointerX).toBe(1));

      expect(translate(state(top).translate)).toEqual([0, 0]);
      expect(translate(state(deep).translate)).toEqual([10, -10]);
    });

    it('shifts the layer under the camera by focusShift', async () => {
      const { layers: [top, deep], viewModel, state } = setup([0, -1], {
        strength: 10,
        pointer: { ...FAST, focusShift: 4 },
      });

      viewModel.setPointer(1, 0);

      await vi.waitFor(() => expect(viewModel.frame.pointerX).toBe(1));

      expect(translate(state(top).translate)[0]).toBe(4);
      expect(translate(state(deep).translate)[0]).toBe(14);
    });

    it('inverts each axis separately', async () => {
      const { viewModel: horizontal } = setup([0], { pointer: { ...FAST, invertX: true } });

      horizontal.setPointer(1, 1);

      await vi.waitFor(() => expect(horizontal.frame.pointerX).toBe(-1));
      expect(horizontal.frame.pointerY).toBe(1);

      const { viewModel: vertical } = setup([0], { pointer: { ...FAST, invertY: true } });

      vertical.setPointer(1, 1);

      await vi.waitFor(() => expect(vertical.frame.pointerY).toBe(-1));
      expect(vertical.frame.pointerX).toBe(1);
    });

    it('clamps the pointer', async () => {
      const { viewModel } = setup([0]);

      viewModel.setPointer(5, -5);

      await vi.waitFor(() => expect(viewModel.frame.pointerX).toBe(1));
      expect(viewModel.frame.pointerY).toBe(-1);
    });
  });

  describe('reduced motion', () => {
    const stubSystem = (matches: boolean): void => {
      vi.stubGlobal('matchMedia', () => ({
        matches, addEventListener() {}, removeEventListener() {},
      }));
    };

    it('follows the system setting by default', () => {
      stubSystem(true);

      expect(setup([0]).viewModel.reducedMotion).toBe(true);
    });

    it('can be forced on and off', () => {
      stubSystem(true);
      expect(setup([0], { reducedMotion: 'never' }).viewModel.reducedMotion).toBe(false);

      stubSystem(false);
      expect(setup([0], { reducedMotion: 'always' }).viewModel.reducedMotion).toBe(true);
    });

    it('keeps fades but removes zoom, pointer shift and the glare flash', async () => {
      const { layers: [, deep], viewModel, state } = setup([0, -1], {
        reducedMotion: 'always',
        glare: { rest: 0.4 },
      });

      viewModel.setPointer(1, 1);

      expect(viewModel.glare.peak).toBe(0.4);
      expect(state(deep).scale).toBe('1');
      expect(Number(state(deep).opacity)).toBeLessThan(1);
      expect(viewModel.frame.pointerX).toBe(0);
    });

    it('applies pan and rotation at once, and still fades between layers', async () => {
      const { viewModel } = setup([0, -1], {
        reducedMotion: 'always',
        rotation: { duration: 60000 },
      });

      await viewModel.animate('rotate', {}, () => viewModel.model.rotateCameraTo(30));
      expect(viewModel.frame.angle).toBe(30);

      const moving = viewModel.animate('move', {}, () => {
        viewModel.model.moveCameraTo({ x: 50, z: -1 });
      });

      expect(viewModel.frame.z).toBe(0);

      await moving;

      expect(viewModel.frame).toMatchObject({ x: 50, z: -1 });
    });
  });
});
