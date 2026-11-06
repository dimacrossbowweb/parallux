/** Число — это пиксели, строка уже готовое значение CSS. */
export const toCssSize = (value: string | number): string => (
  typeof value === 'number' ? `${value}px` : value
);
