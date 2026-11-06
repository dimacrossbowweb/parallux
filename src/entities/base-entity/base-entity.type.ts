export interface IBaseEntity {
  id: string;
  toString: () => string;
  toJSON: () => Record<string, any>;
}
