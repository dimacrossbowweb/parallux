import { autorun } from 'mobx';
import { describe, expect, it } from 'vitest';
import { Camera } from '../entities/camera/camera';
import { Layer } from '../entities/layer/layer';
import { LayerBufferModel } from './layer-buffer-model';

describe('LayerBufferModel', () => {
  it('reacts to added and removed layers', () => {
    const model = new LayerBufferModel();
    const sizes: number[] = [];
    const stop = autorun(() => sizes.push(model.layers.length));

    model.add(new Layer({ name: 'a' }));
    model.removeByName('a');
    stop();

    expect(sizes).toEqual([0, 1, 0]);
  });

  it('reacts to camera changes, including direct entity calls', () => {
    const model = new LayerBufferModel();
    const seen: number[][] = [];
    const stop = autorun(() => {
      const {
        x, y, z, angle,
      } = model.camera;

      seen.push([x, y, z, angle]);
    });

    model.moveCameraTo({ x: 1 });
    model.moveCameraBy({ y: 2 });
    model.rotateCameraTo(30);
    model.camera.rotateBy(1);
    model.camera.moveTo({ z: 4 });
    stop();

    expect(seen.at(-1)).toEqual([1, 2, 4, 31]);
    expect(seen).toHaveLength(6);
  });

  it('moves the camera reactively when the layer under it is removed', () => {
    const model = new LayerBufferModel({
      layers: new Set([new Layer({ z: 0 }), new Layer({ z: -2 })]),
    });
    const seen: number[] = [];

    model.moveCameraTo({ z: -2 });

    const stop = autorun(() => seen.push(model.camera.z));

    model.removeByZ(-2);
    stop();

    expect(seen).toEqual([-2, 0]);
  });

  it('allows two models to share a camera', () => {
    const camera = new Camera({ z: 5 });
    const first = new LayerBufferModel({ camera });
    const second = new LayerBufferModel({ camera });
    const seen: number[] = [];
    const stop = autorun(() => seen.push(second.camera.z));

    first.moveCameraTo({ z: 6 });
    stop();

    expect(seen).toEqual([5, 6]);
  });

  it('serializes an observable camera', () => {
    const model = new LayerBufferModel({ camera: new Camera({ id: 'c', z: 1 }) });

    expect(model.camera.toJSON()).toEqual({
      id: 'c', x: 0, y: 0, z: 1, angle: 0,
    });
  });
});
