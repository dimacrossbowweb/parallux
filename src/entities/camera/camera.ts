import { type TEntityFields } from '../../utils/types';
import { BaseEntity } from '../base-entity/base-entity';
import { type ICamera, type ICameraPosition } from './camera.type';

export type ICameraOptions = Partial<TEntityFields<ICamera>>;

/** Камера: положение среди слоёв и поворот. Границы действуют только на `z`. */
export class Camera extends BaseEntity implements ICamera {
  x: number;

  y: number;

  z: number;

  angle: number;

  #min = -Infinity;

  #max = Infinity;

  constructor(obj: ICameraOptions = {}) {
    super(obj);

    this.x = obj.x ?? 0;
    this.y = obj.y ?? 0;
    this.z = obj.z ?? 0;
    this.angle = obj.angle ?? 0;
  }

  moveTo({ x = this.x, y = this.y, z = this.z }: Partial<ICameraPosition>): void {
    this.x = x;
    this.y = y;
    this.z = Math.min(this.#max, Math.max(this.#min, z));
  }

  moveBy({ x = 0, y = 0, z = 0 }: Partial<ICameraPosition>): void {
    this.moveTo({ x: this.x + x, y: this.y + y, z: this.z + z });
  }

  rotateTo(angle: number): void {
    this.angle = angle;
  }

  rotateBy(delta: number): void {
    this.rotateTo(this.angle + delta);
  }

  setBounds(min: number, max: number): void {
    this.#min = min;
    this.#max = max;
    this.moveTo({});
  }
}
