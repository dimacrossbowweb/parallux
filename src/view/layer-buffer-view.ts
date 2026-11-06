import gsap from 'gsap';
import { autorun, type IReactionDisposer } from 'mobx';
import { type LayerBufferViewModel } from '../view-model/layer-buffer-view-model';

/** Блик лежит поверх всей страницы. */
const GLARE_Z_INDEX = '2147483647';

export type TResizeListener = (size: { width: number; height: number }) => void;

export class LayerBufferView {
  readonly container: HTMLElement;

  readonly viewModel: LayerBufferViewModel;

  #mounted = new Set<HTMLElement>();

  #dispose: IReactionDisposer | null = null;

  #activeLayerId: string | null = null;

  #glare: HTMLElement | null = null;

  #glareTimeline: gsap.core.Timeline | null = null;

  #resizeObserver: ResizeObserver | null = null;

  #onResize: TResizeListener;

  constructor(
    container: HTMLElement,
    viewModel: LayerBufferViewModel,
    onResize: TResizeListener = () => {},
  ) {
    this.container = container;
    this.viewModel = viewModel;
    this.#onResize = onResize;
  }

  mount(): void {
    if (this.#dispose) return;

    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    this.container.style.overflow = 'hidden';
    // Глубокие слои имеют отрицательный z-index и не должны уходить за контейнер.
    this.container.style.isolation = 'isolate';
    this.container.addEventListener('pointermove', this.#onPointerMove);
    this.container.addEventListener('pointerleave', this.#onPointerLeave);

    this.#createGlare();
    this.viewModel.connect();
    this.#dispose = autorun(() => this.#render());
    this.#observeResize();
  }

  destroy(): void {
    this.#dispose?.();
    this.#dispose = null;
    this.viewModel.disconnect();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;

    this.#activeLayerId = null;
    this.#glareTimeline?.kill();
    this.#glareTimeline = null;
    this.#glare?.remove();
    this.#glare = null;

    this.container.removeEventListener('pointermove', this.#onPointerMove);
    this.container.removeEventListener('pointerleave', this.#onPointerLeave);

    this.#mounted.forEach((el) => el.remove());
    this.#mounted.clear();
  }

  #render(): void {
    const next = new Set<HTMLElement>();

    this.viewModel.layers.forEach(({ el, id: _id, ...style }) => {
      next.add(el);

      if (el.parentElement !== this.container) {
        this.container.append(el);
      }

      Object.assign(el.style, style, { position: 'absolute', top: '0', left: '0' });
    });

    // Переданный снаружи el `release` не трогает, но вставил его сюда именно view.
    this.#mounted.forEach((el) => {
      if (!next.has(el)) el.remove();
    });

    this.#mounted = next;
    this.#updateGlare();
  }

  /** Слои заданы в процентах и подстраиваются сами, а это для всего, что считается в пикселях. */
  #observeResize(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.#resizeObserver = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = this.container;

      this.#onResize({ width, height });
    });
    this.#resizeObserver.observe(this.container);
  }

  #createGlare(): void {
    const { enabled, background } = this.viewModel.glare;

    if (!enabled) return;

    const glare = document.createElement('div');

    glare.setAttribute('aria-hidden', 'true');

    Object.assign(glare.style, {
      position: 'fixed',
      inset: '0',
      zIndex: GLARE_Z_INDEX,
      pointerEvents: 'none',
      opacity: '0',
      willChange: 'opacity',
      background,
    });

    document.body.append(glare);
    this.#glare = glare;
  }

  /** При появлении слоя на плоскости камеры засвет усиливается и спадает до `rest`. */
  #updateGlare(): void {
    const { activeLayerId } = this.viewModel;

    if (activeLayerId === this.#activeLayerId) return;

    this.#activeLayerId = activeLayerId;

    if (activeLayerId === null || !this.#glare) return;

    const {
      peak, rest, duration, easing,
    } = this.viewModel.glare;
    const vars = { duration: duration / 1000, ease: easing };

    this.#glareTimeline?.kill();
    this.#glareTimeline = gsap.timeline()
      .to(this.#glare, { ...vars, opacity: peak })
      .to(this.#glare, { ...vars, opacity: rest });
  }

  #onPointerMove = (event: PointerEvent): void => {
    const {
      left, top, width, height,
    } = this.container.getBoundingClientRect();

    if (!width || !height) return;

    this.viewModel.setPointer(
      ((event.clientX - left) / width) * 2 - 1,
      ((event.clientY - top) / height) * 2 - 1,
    );
  };

  #onPointerLeave = (): void => {
    this.viewModel.resetPointer();
  };
}
