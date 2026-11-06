import { type Parallux } from '../src';

const SPEED = { duration: 500, easing: 'power2.inOut' };

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

  const hide = (trigger: HTMLElement): void => {
    trigger.setAttribute('aria-expanded', 'false');
    menuOf(trigger).hidden = true;
  };

  const close = (): boolean => {
    if (!opened) return false;

    hide(opened);
    opened = null;
    app.flyTo({ x: 0, y: 0 }, SPEED);

    return true;
  };

  const open = (trigger: HTMLElement): void => {
    if (opened) hide(opened);

    const menu = menuOf(trigger);

    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    opened = trigger;
    app.lookAt(menu, SPEED);
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
    if (opened) app.lookAt(menuOf(opened), SPEED);
  });

  return { close };
}
