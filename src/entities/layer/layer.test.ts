import { describe, expect, it } from 'vitest';
import { Layer } from './layer';

describe('Layer', () => {
  it('has defaults and creates its own element', () => {
    const layer = new Layer();

    expect(layer.id).toHaveLength(36);
    expect(layer).toMatchObject({
      name: '', z: 0, width: '100%', height: '100%',
    });
    expect(layer.el).toBeInstanceOf(HTMLElement);
  });

  it('keeps zero values', () => {
    expect(new Layer({ z: 0, width: 0 }).width).toBe(0);
  });

  it('removes its own element on release', () => {
    const layer = new Layer();

    document.body.append(layer.el);
    layer.release();

    expect(layer.el.isConnected).toBe(false);
  });

  it('leaves a passed element alone on release', () => {
    const el = document.createElement('section');

    document.body.append(el);
    new Layer({ el }).release();

    expect(el.isConnected).toBe(true);
    el.remove();
  });

  it('does not serialize the element', () => {
    const layer = new Layer({ id: 'l', name: 'bg', z: 1 });

    expect(layer.toJSON()).toEqual({
      id: 'l', name: 'bg', z: 1, width: '100%', height: '100%', scrollable: false,
    });
    expect(JSON.parse(layer.toString())).toEqual(layer.toJSON());
  });
});
