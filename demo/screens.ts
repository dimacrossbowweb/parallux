import { type Parallux } from '../src';
import { find, fromTemplate } from './dom';

const PHOTOS = [
  ['Рассвет', '#f2b880', '#d9707a'],
  ['Глубина', '#4a6fa5', '#1d2c4d'],
  ['Туман', '#9aa3b5', '#3d4658'],
  ['Лес', '#5f9e7f', '#1f4238'],
  ['Закат', '#d9707a', '#5b2a58'],
  ['Лёд', '#9fd3e6', '#3f6f9e'],
  ['Песок', '#e5c99a', '#a4733f'],
  ['Ночь', '#3a4466', '#10131a'],
  ['Мох', '#a8b86a', '#4a5a2c'],
  ['Сирень', '#b49ad9', '#544080'],
  ['Глина', '#c98a6b', '#6e3a2a'],
  ['Море', '#4fb3a9', '#14505c'],
];

const VISITS = [32, 48, 41, 66, 58, 74, 62, 88, 71, 96, 84, 100];

const gradient = (from: string, to: string): string => (
  `linear-gradient(145deg, ${from}, ${to})`
);

export function setupScreens(app: Parallux, setStatus: (text: string) => void): void {
  /** Клик по фону и кнопки с `data-close` закрывают слой. */
  const open = (name: string, el: HTMLElement, scrollable = false): void => {
    el.addEventListener('click', (event) => {
      if (event.target === el) app.close();
    });

    el.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => app.close());
    });

    app.open({ name, el, scrollable });
  };

  const openSettings = (): void => {
    const el = fromTemplate('#settings-template');
    const range = find<HTMLInputElement>('input[type="range"]', el);
    const output = find<HTMLOutputElement>('output', el);

    range.addEventListener('input', () => {
      output.value = `${range.value}%`;
    });

    find('form', el).addEventListener('submit', (event) => {
      event.preventDefault();
      setStatus('Настройки сохранены');
      app.close();
    });

    open('settings', el);
  };

  const openViewer = (title: string, from: string, to: string): void => {
    const el = fromTemplate('#viewer-template');

    find('.viewer__image', el).setAttribute('style', `background: ${gradient(from, to)}`);
    find('.viewer__title', el).textContent = title;

    open('viewer', el);
  };

  const openGallery = (): void => {
    const el = fromTemplate('#gallery-template');
    const grid = find('.gallery', el);

    PHOTOS.forEach(([title, from, to]) => {
      const tile = document.createElement('button');

      tile.type = 'button';
      tile.className = 'gallery__tile';
      tile.textContent = title;
      tile.style.background = gradient(from, to);
      tile.addEventListener('click', () => openViewer(title, from, to));
      grid.append(tile);
    });

    open('gallery', el, true);
  };

  const openStats = (): void => {
    const el = fromTemplate('#stats-template');
    const bars = find('.bars', el);

    VISITS.forEach((value) => {
      const bar = document.createElement('span');

      bar.className = 'bars__bar';
      bar.style.height = `${value}%`;
      bars.append(bar);
    });

    open('stats', el);
  };

  const openNotifications = (): void => {
    const el = fromTemplate('#notifications-template');
    const empty = find<HTMLElement>('.notice-empty', el);
    const items = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('.notice')];
    const update = (): void => {
      empty.hidden = items().length > 0;
    };

    items().forEach((item) => {
      find('button', item).addEventListener('click', () => {
        item.remove();
        update();
      });
    });

    find('[data-clear]', el).addEventListener('click', () => {
      items().forEach((item) => item.remove());
      update();
    });

    open('notifications', el);
  };

  const screens: Record<string, () => void> = {
    settings: openSettings,
    gallery: openGallery,
    stats: openStats,
    notifications: openNotifications,
  };

  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => {
      setStatus('');
      screens[button.dataset.screen ?? '']?.();
    });
  });
}
