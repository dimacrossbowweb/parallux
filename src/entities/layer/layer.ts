import { type TEntityFields } from '../../utils/types';
import { type ILayer } from './layer.type';
import { BaseEntity } from '../base-entity/base-entity';

export type ILayerOptions = Partial<TEntityFields<ILayer>>;

export class Layer extends BaseEntity implements ILayer {
  name: string;

  z: number;

  width: string | number;

  height: string | number;

  scrollable: boolean;

  el: HTMLElement;

  #ownsEl: boolean;

  constructor(obj: ILayerOptions = {}) {
    super(obj);

    this.name = obj.name ?? '';
    this.z = obj.z ?? 0;
    this.width = obj.width ?? '100%';
    this.height = obj.height ?? '100%';
    this.scrollable = obj.scrollable ?? false;
    this.el = obj.el ?? document.createElement('div');
    this.#ownsEl = !obj.el;
  }

  release(): void {
    if (this.#ownsEl) {
      this.el.remove();
    }
  }

  override toJSON(): Record<string, any> {
    const { el, ...fields } = super.toJSON();

    return fields;
  }
}
