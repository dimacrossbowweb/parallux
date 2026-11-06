import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from './config';

describe('resolveConfig', () => {
  it('returns defaults without options', () => {
    expect(resolveConfig()).toEqual(defaultConfig);
  });

  it('merges nested settings instead of replacing them', () => {
    const config = resolveConfig({
      drawDistance: 5,
      transition: { duration: 1 },
      rotation: { easing: 'none' },
      pointer: { duration: 2 },
      glare: { enabled: false },
    });

    expect(config.drawDistance).toBe(5);
    expect(config.transition).toEqual({ ...defaultConfig.transition, duration: 1 });
    expect(config.rotation).toEqual({ ...defaultConfig.rotation, easing: 'none' });
    expect(config.pointer).toEqual({ ...defaultConfig.pointer, duration: 2 });
    expect(config.glare).toEqual({ ...defaultConfig.glare, enabled: false });
  });
});
