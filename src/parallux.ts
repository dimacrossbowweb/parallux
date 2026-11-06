import { type TCameraSpeed, type TParalluxConfigOptions } from './config/config';
import { type ICamera, type ICameraPosition } from './entities/camera/camera.type';
import { Layer, type ILayerOptions } from './entities/layer/layer';
import { type ILayer } from './entities/layer/layer.type';
import { LayerBufferModel } from './model/layer-buffer-model';
import { LayerBufferViewModel } from './view-model/layer-buffer-view-model';
import { LayerBufferView, type TResizeListener } from './view/layer-buffer-view';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Число — это `z`, а объект задаёт любые из координат. */
export type TCameraTarget = number | Partial<ICameraPosition>;

const toPosition = (target: TCameraTarget): Partial<ICameraPosition> => (
  typeof target === 'number' ? { z: target } : target
);

export type TParalluxOptions = TParalluxConfigOptions & {
  /** Куда монтировать слои. По умолчанию `document.body`. */
  container?: HTMLElement;
};

export interface IParalluxOpenOptions extends TCameraSpeed {
  /** Что получит фокус. По умолчанию первый фокусируемый элемент слоя. */
  focus?: HTMLElement;
}

interface IOpenedLayer {
  layer: Layer;
  /** Куда вернуть камеру при закрытии. */
  previousZ: number;
  /** Слои, на время открытия закрытые от клавиатуры и кликов. */
  covered: ILayer[];
  returnFocus: Element | null;
}

/**
 * Центральная точка библиотеки. Методы возвращают `this`, а после `mount()` можно
 * продолжать добавлять слои и двигать камеру. Исключение — анимированные методы
 * `flyTo`, `flyBy`, `rotateTo`, `rotateBy`, `open`, `close` и `closeAll`: они
 * возвращают промис, который завершается вместе с анимацией.
 *
 * @example
 * const app = new Parallux({ drawDistance: 3 })
 *   .add({ name: 'page', z: 0 })
 *   .mount();
 *
 * await app.open({ name: 'menu', el: menu });
 * await app.close();
 */
export class Parallux {
  readonly model: LayerBufferModel;

  readonly viewModel: LayerBufferViewModel;

  #container?: HTMLElement;

  #view: LayerBufferView | null = null;

  #opened: IOpenedLayer[] = [];

  #resizeListeners = new Set<TResizeListener>();

  constructor({ container, ...config }: TParalluxOptions = {}) {
    this.#container = container;
    this.model = new LayerBufferModel();
    this.viewModel = new LayerBufferViewModel(this.model, config);
  }

  get layers(): ILayer[] {
    return this.model.layers;
  }

  get camera(): ICamera {
    return this.model.camera;
  }

  add(layer: ILayerOptions | Layer): this {
    this.model.add(layer instanceof Layer ? layer : new Layer(layer));

    return this;
  }

  pop(): this {
    this.model.pop();

    return this;
  }

  removeByName(name: string): this {
    this.model.removeByName(name);

    return this;
  }

  removeById(id: string): this {
    this.model.removeById(id);

    return this;
  }

  removeByZ(z: number): this {
    this.model.removeByZ(z);

    return this;
  }

  moveTo(target: TCameraTarget): this {
    this.model.moveCameraTo(toPosition(target));

    return this;
  }

  moveBy(delta: TCameraTarget): this {
    this.model.moveCameraBy(toPosition(delta));

    return this;
  }

  flyTo(target: TCameraTarget, speed: TCameraSpeed = {}): Promise<void> {
    return this.viewModel.animate('move', speed, () => {
      this.model.moveCameraTo(toPosition(target));
    });
  }

  flyBy(delta: TCameraTarget, speed: TCameraSpeed = {}): Promise<void> {
    return this.viewModel.animate('move', speed, () => {
      this.model.moveCameraBy(toPosition(delta));
    });
  }

  rotateTo(angle: number, speed: TCameraSpeed = {}): Promise<void> {
    return this.viewModel.animate('rotate', speed, () => {
      this.model.rotateCameraTo(angle);
    });
  }

  rotateBy(delta: number, speed: TCameraSpeed = {}): Promise<void> {
    return this.viewModel.animate('rotate', speed, () => {
      this.model.rotateCameraBy(delta);
    });
  }

  /**
   * Добавляет слой, переводит на него камеру и фокус, а текущий слой закрывает
   * от клавиатуры и кликов. Без `z` слой встаёт поверх остальных.
   */
  open(
    target: ILayerOptions | Layer,
    { focus, ...speed }: IParalluxOpenOptions = {},
  ): Promise<void> {
    const layer = target instanceof Layer
      ? target
      : new Layer({ ...target, z: target.z ?? this.#nextZ() });
    const previousZ = this.camera.z;
    const covered = this.layers.filter((item) => item.z === previousZ);

    this.#opened.push({
      layer,
      previousZ,
      covered,
      returnFocus: document.activeElement,
    });

    covered.forEach((item) => {
      Object.assign(item.el, { inert: true });
    });

    this.add(layer);

    const moving = this.flyTo(layer.z, speed);

    (focus ?? layer.el.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    return moving;
  }

  /** Закрывает верхний открытый слой: возвращает камеру, фокус и удаляет слой. */
  close(speed: TCameraSpeed = {}): Promise<void> {
    return this.#closeLayers(this.#opened.slice(-1), speed);
  }

  /** Закрывает все слои, открытые через `open`. */
  closeAll(speed: TCameraSpeed = {}): Promise<void> {
    return this.#closeLayers(this.#opened, speed);
  }

  /**
   * Вызывается при изменении размера контейнера. Слои в процентах подстраиваются сами,
   * а вот содержимое с координатами в пикселях нужно пересчитывать здесь.
   */
  onResize(listener: TResizeListener): this {
    this.#resizeListeners.add(listener);

    return this;
  }

  mount(): this {
    this.#view ??= new LayerBufferView(
      this.#container ?? document.body,
      this.viewModel,
      (size) => this.#resizeListeners.forEach((listener) => listener(size)),
    );
    this.#view.mount();

    return this;
  }

  destroy(): this {
    this.#view?.destroy();

    return this;
  }

  #nextZ(): number {
    return Math.max(this.camera.z, ...this.layers.map((layer) => layer.z)) + 1;
  }

  async #closeLayers(closing: IOpenedLayer[], speed: TCameraSpeed): Promise<void> {
    const [bottom] = closing;

    if (!bottom) return;

    this.#opened = this.#opened.filter((item) => !closing.includes(item));

    closing.forEach(({ covered }) => covered.forEach((item) => {
      Object.assign(item.el, { inert: false });
    }));

    if (bottom.returnFocus instanceof HTMLElement) bottom.returnFocus.focus();

    await this.flyTo(bottom.previousZ, speed);

    // Слой удаляем после ухода камеры, иначе он исчезнет, не успев раствориться.
    closing.forEach(({ layer }) => this.removeById(layer.id));
  }
}
