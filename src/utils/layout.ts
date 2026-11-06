/**
 * Центр элемента относительно `root`. Считается по `offset*`, а не через
 * `getBoundingClientRect`: те уже искажены камерой и меняются во время анимации.
 */
export function centerWithin(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  let current: HTMLElement | null = el;

  while (current && current !== root) {
    const parent = current.offsetParent as HTMLElement | null;

    x += current.offsetLeft - (parent?.scrollLeft ?? 0);
    y += current.offsetTop - (parent?.scrollTop ?? 0);
    current = parent;
  }

  return { x, y };
}
