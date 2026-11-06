import { type Parallux } from '../src';

const SPEED = { duration: 500, easing: 'power2.inOut' };
/** Насколько камера приближается к меню в углах страницы. */
const CLOSE_UP = 1.4;

export interface IDropdowns {
  /** Закрывает открытое меню. Возвращает `false`, если закрывать было нечего. */
  close: () => boolean;
}

export function setupDropdowns(
  app: Parallux,
  setStatus: (text: string) => void,
): IDropdowns {
  let opened: HTMLElement | null = null;

  const menuOf = (trigger: HTMLElement): HTMLElement => (
    trigger.nextElementSibling as HTMLElement
  );

  const lookAt = (menu: HTMLElement): void => {
    app.lookAt(menu, { ...SPEED, zoom: menu.closest('.topbar, .corner') ? CLOSE_UP : 1 });
  };

  const hide = (trigger: HTMLElement): void => {
    trigger.setAttribute('aria-expanded', 'false');
    menuOf(trigger).hidden = true;
  };

  const close = (): boolean => {
    if (!opened) return false;

    hide(opened);
    opened = null;
    app.flyTo({ x: 0, y: 0, zoom: 1 }, SPEED);

    return true;
  };

  const open = (trigger: HTMLElement): void => {
    if (opened) hide(opened);

    const menu = menuOf(trigger);

    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    opened = trigger;
    lookAt(menu);
  };

  // На фазе перехвата: меню должно закрыться раньше, чем сработает клик по фону слоя.
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLElement>('[data-dropdown]');
    const item = target.closest<HTMLElement>('.dropdown__item');

    if (trigger) {
      if (trigger === opened) close();
      else open(trigger);
    } else {
      if (item) setStatus(`Выбрано: ${item.textContent?.trim()}`);

      close();
    }
  }, true);

  app.onResize(() => {
    if (opened) lookAt(menuOf(opened));
  });

  return { close };
}
