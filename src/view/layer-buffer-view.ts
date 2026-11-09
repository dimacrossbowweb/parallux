import { gsap } from 'gsap';
import { autorun, type TDisposer } from '../utils/observer';
import { type LayerBufferViewModel } from '../view-model/layer-buffer-view-model';

/** Блик лежит поверх всей страницы. */
const GLARE_Z_INDEX = '2147483647';

export type TResizeListener = (size: { width: number; height: number }) => void;

export class LayerBufferView {
  readonly container: HTMLElement;

  readonly viewModel: LayerBufferViewModel;

  #mounted = new Set<HTMLElement>();

  #dispose: TDisposer | null = null;

  #activeLayerId: string | null = null;

  #glare: HTMLElement | null = null;

  #glareTimeline: gsap.core.Timeline | null = null;

  #glareShown = false;

  #resizeObserver: ResizeObserver | null = null;

  #onResize: TResizeListener;

  /** Собственные стили контейнера до монтирования: `destroy` их возвращает. */
  #containerStyle: Pick<CSSStyleDeclaration, 'position' | 'overflow' | 'isolation'> | null = null;

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

    const { position, overflow, isolation } = this.container.style;

    this.#containerStyle = { position, overflow, isolation };

    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    this.container.style.overflow = 'hidden';
    // Глубокие слои имеют отрицательный z-index и не должны уходить за контейнер.
    this.container.style.isolation = 'isolate';
    this.container.addEventListener('pointermove', this.#onPointerMove);
    this.container.addEventListener('pointerleave', this.#onPointerLeave);

    this.viewModel.connect();
    this.#createGlare();
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
    this.#glareShown = false;
    this.#glare?.remove();
    this.#glare = null;

    this.container.removeEventListener('pointermove', this.#onPointerMove);
    this.container.removeEventListener('pointerleave', this.#onPointerLeave);

    this.#mounted.forEach((el) => el.remove());
    this.#mounted.clear();

    if (this.#containerStyle) Object.assign(this.container.style, this.#containerStyle);
    this.#containerStyle = null;
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
    const {
      enabled, background, rest, shiftX, shiftY, scale, animated,
    } = this.viewModel.glare;

    if (!enabled) return;

    const glare = document.createElement('div');

    glare.setAttribute('aria-hidden', 'true');

    Object.assign(glare.style, {
      position: 'fixed',
      inset: '0',
      zIndex: GLARE_Z_INDEX,
      pointerEvents: 'none',
      opacity: animated ? '0' : String(rest),
      willChange: 'transform, opacity',
      background,
    });

    if (animated) gsap.set(glare, { xPercent: shiftX, yPercent: shiftY, scale });

    document.body.append(glare);
    this.#glare = glare;
  }

  /**
   * При смене слоя блик смещается и вырастает, затем возвращается к 100%. Всё это
   * укладывается в длительность смены слоя: половина туда, половина обратно.
   */
  #updateGlare(): void {
    const { activeLayerId } = this.viewModel;

    if (activeLayerId === this.#activeLayerId) return;

    this.#activeLayerId = activeLayerId;

    const {
      rest, shiftX, shiftY, scale, animated,
    } = this.viewModel.glare;

    if (!this.#glare || !animated) return;

    const { duration, easing } = this.viewModel.moveSpeed();
    const seconds = duration / 1000;
    const away = {
      xPercent: shiftX, yPercent: shiftY, scale, ease: easing,
    };
    const home = {
      xPercent: 0, yPercent: 0, scale: 1, ease: easing,
    };
    const timeline = gsap.timeline();

    if (activeLayerId === null) {
      timeline.to(this.#glare, { ...away, opacity: 0, duration: seconds });
    } else if (this.#glareShown) {
      timeline
        .to(this.#glare, { ...away, duration: seconds / 2 })
        .to(this.#glare, { ...home, duration: seconds / 2 });
    } else {
      timeline.to(this.#glare, { ...home, opacity: rest, duration: seconds });
    }

    this.#glareTimeline?.kill();
    this.#glareTimeline = timeline;
    this.#glareShown = activeLayerId !== null;
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
