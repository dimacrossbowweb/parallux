import { type IBaseEntity } from '../base-entity/base-entity.type';

export interface ILayer extends IBaseEntity {
  name?: string;
  z: number;
  width: string | number;
  height: string | number;
  /** Прокручивать содержимое внутри слоя, если оно не помещается. */
  scrollable: boolean;
  el: HTMLElement;
  release: () => void;
}
