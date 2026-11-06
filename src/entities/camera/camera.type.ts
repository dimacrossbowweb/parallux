import { type IBaseEntity } from '../base-entity/base-entity.type';

export interface ICameraPosition {
  x: number;
  y: number;
  z: number;
  /** Масштаб отображения: 1 — как есть, больше — ближе. */
  zoom: number;
}

export interface ICamera extends IBaseEntity, ICameraPosition {
  /** Поворот вокруг оси OZ, градусы. */
  angle: number;
  moveTo: (target: Partial<ICameraPosition>) => void;
  moveBy: (delta: Partial<ICameraPosition>) => void;
  rotateTo: (angle: number) => void;
  rotateBy: (delta: number) => void;
  setBounds: (min: number, max: number) => void;
}
