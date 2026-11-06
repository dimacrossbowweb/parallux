import { type IBaseEntity } from '../base-entity/base-entity.type';
import { type ICamera } from '../camera/camera.type';
import { type ILayer } from '../layer/layer.type';

export interface ILayerBuffer extends IBaseEntity {
  layers: Set<ILayer>;
  camera: ICamera;
  add: (layer: ILayer) => void;
  pop: () => ILayer | undefined;
  removeByName: (name: string) => ILayer[];
  removeById: (id: string) => ILayer[];
  removeByZ: (z: number) => ILayer[];
}
