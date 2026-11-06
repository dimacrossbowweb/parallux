export const find = <T extends Element>(selector: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(selector);

  if (!el) throw new Error(`[demo] ${selector} not found`);

  return el;
};

export const fromTemplate = (selector: string): HTMLElement => (
  find<HTMLTemplateElement>(selector).content.firstElementChild?.cloneNode(true) as HTMLElement
);
