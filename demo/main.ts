import { Parallux } from '../src';

const GAP = 12;

const find = <T extends Element>(selector: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(selector);

  if (!el) throw new Error(`[demo] ${selector} not found`);

  return el;
};

const fromTemplate = (selector: string): HTMLElement => (
  find<HTMLTemplateElement>(selector).content.firstElementChild?.cloneNode(true) as HTMLElement
);

const page = find<HTMLElement>('#page');
const trigger = find<HTMLButtonElement>('#open-menu');
const status = find<HTMLElement>('#status');

let placeMenu = (): void => {};

const app = new Parallux({ zoom: 0.4 })
  .add({
    name: 'page', z: 0, el: page, scrollable: true,
  })
  .onResize(() => placeMenu())
  .mount();

function openModal(action: string): void {
  const el = fromTemplate('#modal-template');
  const no = find<HTMLElement>('[data-answer="no"]', el);

  find('.modal__action', el).textContent = `Действие: «${action}»`;

  find('[data-answer="yes"]', el).addEventListener('click', () => {
    status.textContent = `Выполнено: ${action}`;
    app.closeAll();
  });
  no.addEventListener('click', () => app.close());

  app.open({ name: 'modal', el }, { focus: no });
}

function openMenu(): void {
  const el = fromTemplate('#menu-template');
  const panel = find<HTMLElement>('.menu', el);

  el.addEventListener('click', (event) => {
    if (event.target === el) app.closeAll();
  });

  el.querySelectorAll<HTMLElement>('[data-action]').forEach((item) => {
    item.addEventListener('click', () => openModal(item.dataset.action ?? ''));
  });

  status.textContent = '';
  app.open({ name: 'menu', el });

  // offset*, а не getBoundingClientRect: слои масштабированы и сдвинуты камерой,
  // и измерение зависело бы от её положения. Размер меню известен только после вставки.
  placeMenu = () => {
    const { offsetWidth: width, offsetHeight: height } = panel;
    const left = trigger.offsetLeft + trigger.offsetWidth / 2 - width / 2;
    const top = trigger.offsetTop + trigger.offsetHeight + GAP - page.scrollTop;

    panel.style.left = `${Math.max(GAP, Math.min(left, window.innerWidth - width - GAP))}px`;
    panel.style.top = `${Math.max(GAP, Math.min(top, window.innerHeight - height - GAP))}px`;
  };

  placeMenu();
}

trigger.addEventListener('click', openMenu);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') app.close();
});

/** Промисы камеры позволяют выстраивать движения друг за другом. */
function runCameraDemo(selector: string, script: () => Promise<void>): void {
  const button = find<HTMLButtonElement>(selector);

  button.addEventListener('click', () => {
    button.disabled = true;
    script().finally(() => {
      button.disabled = false;
    });
  });
}

runCameraDemo('#pan', async () => {
  await app.flyTo({ x: 160, y: -60 }, { duration: 700, easing: 'power2.inOut' });
  await app.flyTo({ x: 0, y: 0 }, { duration: 500 });
});

runCameraDemo('#rotate', async () => {
  await app.rotateTo(12, { duration: 600, easing: 'power2.inOut' });
  await app.rotateTo(0, { duration: 400 });
});
