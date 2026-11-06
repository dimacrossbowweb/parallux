import { type TEntityFields } from '../../utils/types';
import { BaseEntity } from '../base-entity/base-entity';
import { Camera } from '../camera/camera';
import { type ICamera } from '../camera/camera.type';
import { type ILayer } from '../layer/layer.type';
import { type ILayerBuffer } from './layer-buffer.type';

export type ILayerBufferOptions = Partial<TEntityFields<ILayerBuffer>>;

export class LayerBuffer extends BaseEntity implements ILayerBuffer {
  layers: Set<ILayer>;

  camera: ICamera;

  constructor(obj: ILayerBufferOptions = {}) {
    super(obj);

    this.layers = new Set(obj.layers);
    this.camera = obj.camera ?? new Camera();
    this.#syncCameraBounds();
  }

  add(layer: ILayer): void {
    this.layers.add(layer);
    this.#syncCameraBounds();
  }

  pop(): ILayer | undefined {
    const last = [...this.layers].pop();

    if (last) {
      this.#removeLayer(last);
    }

    return last;
  }

  removeByName(name: string): ILayer[] {
    return this.#removeLayersWhere((layer) => layer.name === name);
  }

  removeById(id: string): ILayer[] {
    return this.#removeLayersWhere((layer) => layer.id === id);
  }

  removeByZ(z: number): ILayer[] {
    return this.#removeLayersWhere((layer) => layer.z === z);
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      layers: [...this.layers].map((layer) => layer.toJSON()),
      camera: this.camera.toJSON(),
    };
  }

  #removeLayer(layer: ILayer): void {
    this.layers.delete(layer);
    layer.release();
    this.#syncCameraBounds();
  }

  /** Камера не выходит за слои. Пока слоёв нет, ограничивать её нечем. */
  #syncCameraBounds(): void {
    const zs = [...this.layers].map((layer) => layer.z);

    if (zs.length) {
      this.camera.setBounds(Math.min(...zs), Math.max(...zs));
    } else {
      this.camera.setBounds(-Infinity, Infinity);
    }
  }

  #removeLayersWhere(predicate: (layer: ILayer) => boolean): ILayer[] {
    const removed = [...this.layers].filter(predicate);

    removed.forEach((layer) => this.#removeLayer(layer));

    return removed;
  }
}
