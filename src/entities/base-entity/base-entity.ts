import { type TEntityFields } from '../../utils/types';
import { type IBaseEntity } from './base-entity.type';

export type IBaseEntityOptions = Partial<TEntityFields<IBaseEntity>>;

export class BaseEntity implements IBaseEntity {
  id: string;

  constructor(obj: IBaseEntityOptions = {}) {
    this.id = obj.id ?? crypto.randomUUID();
  }

  toString(): string {
    return JSON.stringify(this);
  }

  toJSON(): Record<string, any> {
    return { ...this };
  }
}
