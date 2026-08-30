/**
 * One modal, reused for both confirmations. Resolves true on confirm and false
 * on cancel, backdrop click, or Escape — so callers read as a plain `await`.
 */
export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  /** Paints the confirm button as a destructive action. */
  destructive?: boolean;
  /** Renders a labelled number input; its value is passed back on confirm. */
  numberField?: { label: string; value: number; placeholder?: string };
}

export interface ConfirmResult {
  confirmed: boolean;
  numberValue: number;
}

export class ConfirmDialog {
  private readonly backdrop: HTMLElement;

  constructor(private readonly host: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';
    this.backdrop.hidden = true;
    this.host.append(this.backdrop);
  }

  ask(options: ConfirmOptions): Promise<ConfirmResult> {
    return new Promise((resolve) => {
      const card = document.createElement('div');
      card.className = 'modal';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');

      const title = document.createElement('h2');
      title.className = 'modal-title';
      title.textContent = options.title;

      const body = document.createElement('p');
      body.className = 'modal-body';
      body.textContent = options.body;
      card.append(title, body);

      let field: HTMLInputElement | null = null;
      if (options.numberField) {
        const label = document.createElement('label');
        label.className = 'modal-field';
        label.textContent = options.numberField.label;
        field = document.createElement('input');
        field.type = 'number';
        field.step = '0.01';
        field.min = '0';
        field.value = options.numberField.value > 0 ? String(options.numberField.value) : '';
        field.placeholder = options.numberField.placeholder ?? '';
        label.append(field);
        card.append(label);
      }

      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = options.destructive ? 'btn btn-danger' : 'btn btn-primary';
      confirm.textContent = options.confirmLabel;
      actions.append(cancel, confirm);
      card.append(actions);

      const close = (confirmed: boolean): void => {
        document.removeEventListener('keydown', onKey);
        this.backdrop.hidden = true;
        this.backdrop.replaceChildren();
        const parsed = Number(field?.value);
        resolve({ confirmed, numberValue: Number.isFinite(parsed) ? parsed : 0 });
      };

      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') close(false);
        if (event.key === 'Enter' && document.activeElement !== cancel) close(true);
      };

      cancel.addEventListener('click', () => close(false));
      confirm.addEventListener('click', () => close(true));
      this.backdrop.addEventListener('click', (event) => {
        if (event.target === this.backdrop) close(false);
      });
      document.addEventListener('keydown', onKey);

      this.backdrop.replaceChildren(card);
      this.backdrop.hidden = false;
      (field ?? confirm).focus();
    });
  }
}
