const Z_EPSILON = 1e-9;

/** Сравнение `z` с допуском: после `moveBy(0.1)` камера стоит на 0.30000000000000004. */
export const sameZ = (a: number, b: number): boolean => Math.abs(a - b) < Z_EPSILON;
