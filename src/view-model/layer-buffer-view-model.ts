import gsap from 'gsap';
import {
  compareStructural,
  makeAutoObservable,
  observableRef,
  reaction,
  runInAction,
} from 'mobx';
import {
  resolveConfig,
  type IParalluxConfig,
  type IParalluxTransition,
  type TCameraSpeed,
  type TParalluxConfigOptions,
} from '../config/config';
import { type LayerBufferModel } from '../model/layer-buffer-model';
import { toCssSize } from '../utils/css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const clamp = (value: number): number => Math.min(1, Math.max(-1, value));

/** Слой виден на глубине от -1 (камера только что прошла его) до дальности отрисовки. */
const opacityAt = (depth: number, drawDistance: number): number => {
  if (depth < 0) return Math.max(0, 1 + depth);
  if (depth === 0) return 1;

  return drawDistance > 0 ? Math.max(0, 1 - depth / drawDistance) : 0;
};

export type TCameraMotion = 'move' | 'rotate';

/** То, что сейчас на экране. Модель хранит цель, а GSAP ведёт к ней этот кадр. */
export interface IViewFrame {
  x: number;
  y: number;
  z: number;
  angle: number;
  pointerX: number;
  pointerY: number;
}

export interface ILayerViewState {
  id: string;
  el: HTMLElement;
  width: string;
  height: string;
  zIndex: string;
  translate: string;
  rotate: string;
  scale: string;
  opacity: string;
  visibility: string;
  pointerEvents: string;
  willChange: string;
  /** Только у прокручиваемых слоёв: у остальных стили приложения не трогаем. */
  overflowY?: string;
}

export interface IGlareViewState {
  enabled: boolean;
  background: string;
  rest: number;
  peak: number;
  duration: number;
  easing: string;
}

export class LayerBufferViewModel {
  readonly model: LayerBufferModel;

  readonly config: IParalluxConfig;

  frame: IViewFrame;

  systemReducedMotion = false;

  #proxy: IViewFrame;

  #tweens: Partial<Record<TCameraMotion | 'pointer', gsap.core.Tween>> = {};

  #speeds: Partial<Record<TCameraMotion, IParalluxTransition>> = {};

  #pending: Partial<Record<TCameraMotion, Promise<void>>> = {};

  #disconnect: (() => void)[] = [];

  constructor(model: LayerBufferModel, config: TParalluxConfigOptions = {}) {
    this.model = model;
    this.config = resolveConfig(config);
    this.#proxy = this.#targetFrame();
    this.frame = { ...this.#proxy };

    makeAutoObservable(this, {
      model: false,
      config: false,
      frame: observableRef,
      animate: false,
      connect: false,
      disconnect: false,
    });
  }

  get reducedMotion(): boolean {
    const { reducedMotion } = this.config;

    if (reducedMotion === 'auto') return this.systemReducedMotion;

    return reducedMotion === 'always';
  }

  /** Слой, на котором стоит камера. */
  get activeLayerId(): string | null {
    const { z } = this.model.camera;

    return this.model.layers.find((layer) => layer.z === z)?.id ?? null;
  }

  get glare(): IGlareViewState {
    const {
      enabled, color, angle, size, rest, duration, easing,
    } = this.config.glare;

    return {
      enabled,
      background: `linear-gradient(${angle}deg, ${color}, transparent ${size}%)`,
      rest,
      // Вспышка — тоже движение, поэтому в упрощённом режиме её нет.
      peak: this.reducedMotion ? rest : 1,
      duration,
      easing,
    };
  }

  /**
   * Слои снизу вверх. Глубина — расстояние от камеры: положительная у слоёв
   * впереди неё, отрицательная у тех, что камера уже прошла.
   */
  get layers(): ILayerViewState[] {
    const { drawDistance, zoom, strength } = this.config;
    const { focusShift } = this.config.pointer;
    const { frame, reducedMotion } = this;
    const radians = (-frame.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return [...this.model.layers]
      .sort((a, b) => a.z - b.z)
      .map((layer) => {
        const depth = frame.z - layer.z;
        const opacity = opacityAt(depth, drawDistance);
        // Интерактивность зависит от цели: слой должен принимать клики и фокус сразу.
        const reachable = opacityAt(this.model.camera.z - layer.z, drawDistance) > 0;
        const visible = opacity > 0 || reachable;
        const scale = reducedMotion ? 1 : 2 ** (-depth * zoom);
        // Дальние слои смещаются вслед за камерой слабее, как и положено перспективе.
        const panX = -frame.x * scale;
        const panY = -frame.y * scale;
        const shift = depth * strength + focusShift;
        const x = panX * cos - panY * sin + frame.pointerX * shift;
        const y = panX * sin + panY * cos + frame.pointerY * shift;

        return {
          id: layer.id,
          el: layer.el,
          width: toCssSize(layer.width),
          height: toCssSize(layer.height),
          zIndex: String(layer.z),
          translate: `${x}px ${y}px`,
          rotate: `${-frame.angle}deg`,
          scale: String(scale),
          opacity: String(opacity),
          visibility: visible ? 'visible' : 'hidden',
          pointerEvents: reachable ? 'auto' : 'none',
          // Свой композитный слой убирает рывки перехода, но занимает GPU-память.
          willChange: visible ? 'translate, rotate, scale, opacity' : 'auto',
          ...(layer.scrollable ? { overflowY: 'auto' } : {}),
        };
      });
  }

  /** Начинает следить за камерой. Без этого кадр не обновляется. */
  connect(): void {
    if (this.#disconnect.length) return;

    this.#proxy = this.#targetFrame();
    this.#sync();

    const { camera } = this.model;

    this.#disconnect.push(
      reaction(
        () => ({ x: camera.x, y: camera.y, z: camera.z }),
        (target) => this.#move(target),
        { equals: compareStructural },
      ),
      reaction(() => camera.angle, (angle) => this.#rotate(angle)),
      this.#watchReducedMotion(),
    );
  }

  disconnect(): void {
    this.#disconnect.forEach((stop) => stop());
    this.#disconnect = [];
    Object.values(this.#tweens).forEach((tween) => tween.kill());
    this.#tweens = {};
  }

  /** Меняет камеру со своей скоростью. Промис завершается вместе с анимацией. */
  animate(kind: TCameraMotion, speed: TCameraSpeed, change: () => void): Promise<void> {
    const defaults = kind === 'move' ? this.config.transition : this.config.rotation;

    this.#speeds[kind] = { ...defaults, ...speed };
    this.#pending[kind] = undefined;
    change();
    this.#speeds[kind] = undefined;

    return this.#pending[kind] ?? Promise.resolve();
  }

  setPointer(x: number, y: number): void {
    if (this.reducedMotion) return;

    const {
      duration, easing, invertX, invertY,
    } = this.config.pointer;

    this.#tweens.pointer?.kill();
    this.#tweens.pointer = gsap.to(this.#proxy, {
      pointerX: clamp(x) * (invertX ? -1 : 1),
      pointerY: clamp(y) * (invertY ? -1 : 1),
      duration: duration / 1000,
      ease: easing,
      onUpdate: this.#sync,
    });
  }

  resetPointer(): void {
    this.setPointer(0, 0);
  }

  #targetFrame(): IViewFrame {
    const {
      x, y, z, angle,
    } = this.model.camera;

    return {
      x, y, z, angle, pointerX: 0, pointerY: 0,
    };
  }

  #sync = (): void => {
    runInAction(() => {
      this.frame = { ...this.#proxy };
    });
  };

  #move({ x, y, z }: { x: number; y: number; z: number }): void {
    const speed = this.#speeds.move ?? this.config.transition;

    if (this.reducedMotion) {
      // Смена слоя остаётся плавным проявлением, а движение по экрану убираем.
      Object.assign(this.#proxy, { x, y });
      this.#pending.move = this.#tween('move', { z }, speed);
    } else {
      this.#pending.move = this.#tween('move', { x, y, z }, speed);
    }
  }

  #rotate(angle: number): void {
    const speed = this.#speeds.rotate ?? this.config.rotation;

    this.#pending.rotate = this.#tween(
      'rotate',
      { angle },
      this.reducedMotion ? { ...speed, duration: 0 } : speed,
    );
  }

  /** Прерванная анимация тоже завершает свой промис: ждать больше нечего. */
  #tween(
    kind: TCameraMotion,
    vars: Partial<IViewFrame>,
    { duration, easing }: IParalluxTransition,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.#tweens[kind]?.kill();
      this.#tweens[kind] = gsap.to(this.#proxy, {
        ...vars,
        duration: duration / 1000,
        ease: easing,
        onUpdate: this.#sync,
        onComplete: () => {
          this.#sync();
          resolve();
        },
        onInterrupt: resolve,
      });
    });
  }

  #watchReducedMotion(): () => void {
    if (typeof window.matchMedia !== 'function') return () => {};

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = (): void => {
      runInAction(() => {
        this.systemReducedMotion = query.matches;
      });
    };

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }
}
