import {
  action,
  isObservableProp,
  makeAutoObservable,
  makeObservable,
  observable,
} from 'mobx';
import { LayerBuffer, type ILayerBufferOptions } from '../entities/layer-buffer/layer-buffer';
import { type ICamera, type ICameraPosition } from '../entities/camera/camera.type';
import { type ILayer } from '../entities/layer/layer.type';

export class LayerBufferModel {
  readonly layerBuffer: LayerBuffer;

  constructor(obj: ILayerBufferOptions = {}) {
    this.layerBuffer = new LayerBuffer(obj);
    // Сущности не знают про mobx: реактивность подключается здесь, снаружи.
    this.layerBuffer.layers = observable.set(this.layerBuffer.layers, { deep: false });

    const { camera } = this.layerBuffer;

    // Одну камеру могут разделять несколько моделей, а повторная разметка — ошибка.
    if (!isObservableProp(camera, 'z')) {
      makeObservable(camera, {
        x: observable,
        y: observable,
        z: observable,
        zoom: observable,
        angle: observable,
        moveTo: action,
        moveBy: action,
        rotateTo: action,
        rotateBy: action,
        setBounds: action,
      });
    }

    makeAutoObservable(this, { layerBuffer: false });
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

  add(layer: ILayer): void {
    this.layerBuffer.add(layer);
  }

  pop(): ILayer | undefined {
    return this.layerBuffer.pop();
  }

  removeByName(name: string): ILayer[] {
    return this.layerBuffer.removeByName(name);
  }

  removeById(id: string): ILayer[] {
    return this.layerBuffer.removeById(id);
  }

  removeByZ(z: number): ILayer[] {
    return this.layerBuffer.removeByZ(z);
  }
}
