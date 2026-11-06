import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('Camera', () => {
  it('starts at the origin', () => {
    expect(new Camera({ id: 'c' }).toJSON()).toEqual({
      id: 'c', x: 0, y: 0, z: 0, zoom: 1, angle: 0,
    });
  });

  it('moves only the given coordinates', () => {
    const camera = new Camera({ x: 1, y: 2, z: 3 });

    camera.moveTo({ x: 5 });

    expect([camera.x, camera.y, camera.z]).toEqual([5, 2, 3]);
  });

  it('moves relatively', () => {
    const camera = new Camera({ x: 1, z: 1 });

    camera.moveBy({ x: 2, y: 3, z: -1 });

    expect([camera.x, camera.y, camera.z]).toEqual([3, 3, 0]);
  });

  it('zooms absolutely and relatively', () => {
    const camera = new Camera();

    camera.moveTo({ zoom: 2 });
    camera.moveBy({ zoom: -0.5 });

    expect(camera.zoom).toBe(1.5);
  });

  it('never lets the zoom reach zero', () => {
    const camera = new Camera({ zoom: -3 });

    expect(camera.zoom).toBeGreaterThan(0);

    camera.moveTo({ zoom: 0 });

    expect(camera.zoom).toBeGreaterThan(0);
  });

  it('rotates', () => {
    const camera = new Camera();

    camera.rotateTo(10);
    camera.rotateBy(5);

    expect(camera.angle).toBe(15);
  });

  it('clamps only z to the bounds', () => {
    const camera = new Camera({ z: 9 });

    camera.setBounds(-1, 2);
    expect(camera.z).toBe(2);

    camera.moveTo({ x: 100, z: -50 });
    expect([camera.x, camera.z]).toEqual([100, -1]);

    camera.moveBy({ z: 99 });
    expect(camera.z).toBe(2);
  });
});
