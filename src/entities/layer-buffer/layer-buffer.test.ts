import { describe, expect, it } from 'vitest';
import { Camera } from '../camera/camera';
import { Layer } from '../layer/layer';
import { LayerBuffer } from './layer-buffer';

const buffer = (...zs: number[]): LayerBuffer => new LayerBuffer({
  layers: new Set(zs.map((z) => new Layer({ name: `z${z}`, z }))),
});

describe('LayerBuffer', () => {
  it('copies the passed set', () => {
    const layers = new Set([new Layer()]);

    new LayerBuffer({ layers }).pop();

    expect(layers.size).toBe(1);
  });

  it('pops the last added layer and releases it', () => {
    const first = new Layer({ z: 0 });
    const last = new Layer({ z: 1 });
    const lb = new LayerBuffer();

    lb.add(first);
    lb.add(last);
    document.body.append(last.el);

    expect(lb.pop()).toBe(last);
    expect(last.el.isConnected).toBe(false);
    expect(lb.layers.size).toBe(1);
  });

  it('returns undefined when there is nothing to pop', () => {
    expect(new LayerBuffer().pop()).toBeUndefined();
  });

  it('removes every match by name and z, and one by id', () => {
    const lb = buffer(0, 0, 1, 2);
    const [, , one] = [...lb.layers];

    expect(lb.removeByZ(0)).toHaveLength(2);
    expect(lb.removeById(one.id)).toEqual([one]);
    expect(lb.removeByName('z2')).toHaveLength(1);
    expect(lb.removeByName('nope')).toEqual([]);
    expect(lb.layers.size).toBe(0);
  });

  it('keeps the camera inside the layers', () => {
    const lb = buffer(0, -3, -5);

    lb.camera.moveTo({ z: 10 });
    expect(lb.camera.z).toBe(0);

    lb.camera.moveTo({ z: -5 });
    lb.removeByZ(-5);
    expect(lb.camera.z).toBe(-3);
  });

  it('frees the camera when no layers are left, then clamps again', () => {
    const lb = buffer(0);

    lb.pop();
    lb.camera.moveTo({ z: 50 });
    expect(lb.camera.z).toBe(50);

    lb.add(new Layer({ z: 1 }));
    expect(lb.camera.z).toBe(1);
  });

  it('clamps a passed camera on creation', () => {
    const lb = new LayerBuffer({
      layers: new Set([new Layer({ z: 2 })]),
      camera: new Camera({ z: 9 }),
    });

    expect(lb.camera.z).toBe(2);
  });

  it('serializes layers and the camera', () => {
    const lb = new LayerBuffer({ id: 'b', camera: new Camera({ id: 'c' }) });

    expect(JSON.parse(lb.toString())).toEqual({
      id: 'b',
      layers: [],
      camera: {
        id: 'c', x: 0, y: 0, z: 0, zoom: 1, angle: 0,
      },
    });
  });
});
