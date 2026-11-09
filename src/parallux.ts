import { type TCameraSpeed, type TParalluxConfigOptions } from './config/config';
import { type ICamera, type ICameraPosition } from './entities/camera/camera.type';
import { Layer, type ILayerOptions } from './entities/layer/layer';
import { type ILayer } from './entities/layer/layer.type';
import { LayerBufferModel } from './model/layer-buffer-model';
import { LayerBufferViewModel } from './view-model/layer-buffer-view-model';
import { centerWithin } from './utils/layout';
import { sameZ } from './utils/z';
import { LayerBufferView, type TResizeListener } from './view/layer-buffer-view';

/** Отступ от края экрана в `lookAt`, пиксели. */
const VIEW_MARGIN = 8;

/**
 * Кандидаты на фокус. Отключённые, скрытые и прочие неподходящие отсеиваются
 * проверкой `document.activeElement` после `focus()`.
 */
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(', ');

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

export interface IParalluxLookAtOptions extends TCameraSpeed {
  /** Какую часть пути до центра экрана проехать, от 0 до 1. */
  approach?: number;
  /** Масштаб камеры на месте. По умолчанию текущий. */
  zoom?: number;
}

interface IOpenedLayer {
  layer: Layer;
  /** Куда вернуть камеру при закрытии. */
  previousZ: number;
  /** Слои, на время открытия закрытые от клавиатуры и кликов. */
  covered: ILayer[];
  returnFocus: Element | null;
}

/** Фокус на первый подходящий элемент, а если такого нет, то на сам слой. */
function focusInside(layer: ILayer, preferred?: HTMLElement): void {
  const candidates = [
    ...(preferred ? [preferred] : []),
    ...[...layer.el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0),
  ];
  const focused = candidates.some((el) => {
    el.focus();

    return document.activeElement === el;
  });

  if (focused) return;

  // Иначе фокус останется в слое, который только что закрыли от клавиатуры.
  if (!layer.el.hasAttribute('tabindex')) Object.assign(layer.el, { tabIndex: -1 });

  layer.el.focus();
}

/**
 * Верхний слой наследует контекст удалённого нижнего: вернуться туда, откуда
 * открывали нижний, и держать закрытым то, что закрывал он.
 */
const inherit = (upper: IOpenedLayer, lower: IOpenedLayer): IOpenedLayer => ({
  ...upper,
  previousZ: lower.previousZ,
  covered: [...lower.covered, ...upper.covered],
  returnFocus: upper.returnFocus?.isConnected ? upper.returnFocus : lower.returnFocus,
});

/**
 * Центральная точка библиотеки. Методы возвращают `this`, а после `mount()` можно
 * продолжать добавлять слои и двигать камеру. Исключение — анимированные методы
 * `flyTo`, `flyBy`, `lookAt`, `zoomTo`, `rotateTo`, `rotateBy`, `open`, `close` и `closeAll`: они
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

  /** Слои, которым библиотека поставила `inert`. */
  #inert = new Set<ILayer>();

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
    this.#remove(() => {
      const layer = this.model.pop();

      return layer ? [layer] : [];
    });

    return this;
  }

  removeByName(name: string): this {
    this.#remove(() => this.model.removeByName(name));

    return this;
  }

  removeById(id: string): this {
    this.#remove(() => this.model.removeById(id));

    return this;
  }

  removeByZ(z: number): this {
    this.#remove(() => this.model.removeByZ(z));

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

  /** Подводит камеру к элементу, например к только что появившемуся меню. */
  lookAt(
    el: HTMLElement,
    {
      approach = this.viewModel.config.approach,
      zoom = this.camera.zoom,
      ...speed
    }: IParalluxLookAtOptions = {},
  ): Promise<void> {
    const root = this.#root;
    const { x, y } = centerWithin(el, root);
    // На экране остаётся доля `1 - approach` от исходного расстояния до центра,
    // но не больше, чем позволяет увеличенный размер элемента.
    const target = (center: number, size: number, rootSize: number): number => {
      const distance = center - rootSize / 2;
      const limit = Math.max(0, rootSize / 2 - (size * zoom) / 2 - VIEW_MARGIN);
      const onScreen = Math.min(limit, Math.max(-limit, distance * (1 - approach)));

      return distance - onScreen / zoom;
    };

    return this.flyTo({
      x: target(x, el.offsetWidth, root.clientWidth),
      y: target(y, el.offsetHeight, root.clientHeight),
      zoom,
    }, speed);
  }

  zoomTo(zoom: number, speed: TCameraSpeed = {}): Promise<void> {
    return this.flyTo({ zoom }, speed);
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

    this.#opened.push({
      layer,
      previousZ,
      covered: this.layers.filter((item) => sameZ(item.z, previousZ)),
      returnFocus: document.activeElement,
    });
    this.#syncInert();

    this.add(layer);

    // Сначала камера: слой должен стать видимым, иначе фокус на него не встанет.
    const moving = this.flyTo(layer.z, speed);

    focusInside(layer, focus);

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
      this.#root,
      this.viewModel,
      (size) => this.#resizeListeners.forEach((listener) => listener(size)),
    );
    this.#view.mount();

    return this;
  }

  /**
   * Снимает слои и обработчики. Слои, открытые через `open`, закрываются сразу,
   * без анимации, а камера возвращается туда, откуда открывали первый из них.
   */
  destroy(): this {
    this.#view?.destroy();

    const opened = this.#opened;
    const [bottom] = opened;

    this.#opened = [];
    this.#syncInert();
    opened.forEach(({ layer }) => this.model.removeById(layer.id));

    if (bottom) this.model.moveCameraTo({ z: bottom.previousZ });

    return this;
  }

  get #root(): HTMLElement {
    return this.#container ?? document.body;
  }

  #nextZ(): number {
    return Math.max(this.camera.z, ...this.layers.map((layer) => layer.z)) + 1;
  }

  async #closeLayers(closing: IOpenedLayer[], speed: TCameraSpeed): Promise<void> {
    const [bottom] = closing;

    if (!bottom) return;

    this.#opened = this.#opened.filter((item) => !closing.includes(item));
    this.#syncInert();

    // Сначала камера: слой, далёкий больше `drawDistance`, скрыт, и фокус на нём не встанет.
    const moving = this.flyTo(bottom.previousZ, speed);

    if (bottom.returnFocus instanceof HTMLElement) bottom.returnFocus.focus();

    await moving;
    // Движение могли прервать, а слой удаляем только после ухода камеры,
    // иначе он исчезнет, не успев раствориться.
    await this.viewModel.settled();

    closing.forEach(({ layer }) => this.removeById(layer.id));
  }

  /** `inert` стоит ровно у тех слоёв, что закрыты открытыми через `open`. */
  #syncInert(): void {
    const present = new Set(this.layers);
    const next = new Set(
      this.#opened.flatMap(({ covered }) => covered).filter((layer) => present.has(layer)),
    );

    this.#inert.forEach((layer) => {
      if (!next.has(layer)) Object.assign(layer.el, { inert: false });
    });
    next.forEach((layer) => {
      Object.assign(layer.el, { inert: true });
    });
    this.#inert = next;
  }

  /**
   * Удаление в обход `close`. Удалённые слои уходят из списка открытых, а верхний
   * из оставшихся наследует их контекст. Если удалили верхний, камера и фокус
   * возвращаются, как при `close`.
   */
  #remove(remove: () => ILayer[]): void {
    const active = document.activeElement;
    const removed = remove();
    const isRemoved = ({ layer }: IOpenedLayer): boolean => removed.includes(layer);

    if (!this.#opened.some(isRemoved)) {
      // Удалённый слой мог быть закрыт `inert`: снимаем, элемент может вернуться в работу.
      this.#syncInert();

      return;
    }

    const { kept, carry } = this.#opened.reduce<{
      kept: IOpenedLayer[];
      carry: IOpenedLayer | null;
    }>((acc, entry) => {
      if (isRemoved(entry)) {
        return { kept: acc.kept, carry: acc.carry ? inherit(entry, acc.carry) : entry };
      }

      return { kept: [...acc.kept, acc.carry ? inherit(entry, acc.carry) : entry], carry: null };
    }, { kept: [], carry: null });

    this.#opened = kept;
    this.#syncInert();

    if (!carry) return;

    this.flyTo(carry.previousZ);

    const focusWasInside = removed.some(({ el }) => active instanceof Node && el.contains(active));

    if (focusWasInside && carry.returnFocus instanceof HTMLElement) carry.returnFocus.focus();
  }
}
