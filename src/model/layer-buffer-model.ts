import { LayerBuffer, type ILayerBufferOptions } from '../entities/layer-buffer/layer-buffer';
import { type ICamera, type ICameraPosition } from '../entities/camera/camera.type';
import { type ILayer } from '../entities/layer/layer.type';
import {
  batch,
  isObservable,
  makeActions,
  makeObservable,
  ObservableSet,
} from '../utils/observer';

export class LayerBufferModel {
  readonly layerBuffer: LayerBuffer;

  constructor(obj: ILayerBufferOptions = {}) {
    this.layerBuffer = new LayerBuffer(obj);
    // Сущности не знают про реактивность: она подключается здесь, снаружи.
    this.layerBuffer.layers = new ObservableSet(this.layerBuffer.layers);

    const { camera } = this.layerBuffer;

    // Одну камеру могут разделять несколько моделей, а повторная разметка — ошибка.
    if (!isObservable(camera, 'z')) {
      makeObservable(camera, ['x', 'y', 'z', 'zoom', 'angle']);
      // Метод меняет сразу несколько полей, а реакции должны увидеть их вместе.
      makeActions(camera, ['moveTo', 'moveBy', 'rotateTo', 'rotateBy', 'setBounds']);
    }
  }

  get layers(): ILayer[] {
    return [...this.layerBuffer.layers];
  }

  get camera(): ICamera {
    return this.layerBuffer.camera;
  }

  moveCameraTo(target: Partial<ICameraPosition>): void {
    this.layerBuffer.camera.moveTo(target);
  }

  moveCameraBy(delta: Partial<ICameraPosition>): void {
    this.layerBuffer.camera.moveBy(delta);
  }

  rotateCameraTo(angle: number): void {
    this.layerBuffer.camera.rotateTo(angle);
  }

  rotateCameraBy(delta: number): void {
    this.layerBuffer.camera.rotateBy(delta);
  }

  /** Слои и границы камеры меняются вместе, поэтому всё в одном `batch`. */
  add(layer: ILayer): void {
    batch(() => this.layerBuffer.add(layer));
  }

  pop(): ILayer | undefined {
    return batch(() => this.layerBuffer.pop());
  }

  removeByName(name: string): ILayer[] {
    return batch(() => this.layerBuffer.removeByName(name));
  }

  removeById(id: string): ILayer[] {
    return batch(() => this.layerBuffer.removeById(id));
  }

  removeByZ(z: number): ILayer[] {
    return batch(() => this.layerBuffer.removeByZ(z));
  }
}
