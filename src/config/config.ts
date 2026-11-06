import defaults from './parallux.json';

export interface IParalluxTransition {
  /** Длительность анимации, мс. */
  duration: number;
  /** Любое значение `ease` из GSAP, например `power2.out`. */
  easing: string;
}

/** Скорость анимированного движения или поворота камеры. */
export type TCameraSpeed = Partial<IParalluxTransition>;

/**
 * Как учитывать системную настройку «уменьшить движение»: `auto` следует ей,
 * `always` включает упрощённый режим всегда, `never` игнорирует настройку.
 */
export type TReducedMotion = 'auto' | 'always' | 'never';

/** Блик: постоянный засвет от солнца поверх всей страницы. Движется вместе со сменой слоёв. */
export interface IParalluxGlare {
  enabled: boolean;
  /** Любой цвет CSS. Прозрачность задаёт силу засвета. */
  color: string;
  /** Направление света, градусы CSS: 225 — из правого верхнего угла. */
  angle: number;
  /** На каком проценте длины градиента засвет сходит на нет. */
  size: number;
  /** Сила засвета, от 0 до 1. */
  rest: number;
  /** На сколько процентов от размера окна блик смещается при смене слоя. */
  shift: number;
  /** До какого масштаба вырастает при смещении: запас прячет его края за экраном. */
  scale: number;
}

/** Реакция слоёв на указатель. */
export interface IParalluxPointer extends IParalluxTransition {
  /** Инверсия сдвига по горизонтали. */
  invertX: boolean;
  /** Инверсия сдвига по вертикали. */
  invertY: boolean;
  /** Сдвиг в пикселях у слоя, на котором стоит камера. Глубокие слои добавляют к нему свой. */
  focusShift: number;
}

export interface IParalluxConfig {
  /** Дальность отрисовки: на сколько единиц `z` в глубину видны слои. */
  drawDistance: number;
  /** Скорость масштабирования: слой уменьшается вдвое каждые `1 / zoom` единиц глубины. */
  zoom: number;
  /** Сдвиг в пикселях на единицу глубины при указателе у края контейнера. */
  strength: number;
  /** Какую часть пути до центра экрана проезжает камера в `lookAt`, от 0 до 1. */
  approach: number;
  reducedMotion: TReducedMotion;
  /** Движение камеры и переход между слоями. */
  transition: IParalluxTransition;
  /** Поворот камеры. */
  rotation: IParalluxTransition;
  pointer: IParalluxPointer;
  glare: IParalluxGlare;
}

type TNestedConfig = 'transition' | 'rotation' | 'pointer' | 'glare';

export type TParalluxConfigOptions = Partial<Omit<IParalluxConfig, TNestedConfig>> & {
  transition?: TCameraSpeed;
  rotation?: TCameraSpeed;
  pointer?: Partial<IParalluxPointer>;
  glare?: Partial<IParalluxGlare>;
};

export const defaultConfig = defaults as IParalluxConfig;

export function resolveConfig(config: TParalluxConfigOptions = {}): IParalluxConfig {
  return {
    ...defaultConfig,
    ...config,
    transition: { ...defaultConfig.transition, ...config.transition },
    rotation: { ...defaultConfig.rotation, ...config.rotation },
    pointer: { ...defaultConfig.pointer, ...config.pointer },
    glare: { ...defaultConfig.glare, ...config.glare },
  };
}
