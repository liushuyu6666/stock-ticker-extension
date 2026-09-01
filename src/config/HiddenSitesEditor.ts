import { sendMessage } from '../shared/messages';
import { normalizeSite } from '../shared/sites';

/**
 * The list of sites the strip stays off. Kept beside the backup block rather
 * than in its own nav section: it is a setting people touch once, when a site
 * turns out to be one the strip cannot share a viewport with.
 */
export class HiddenSitesEditor {
  private sites: string[] = [];

  constructor(
    private readonly form: HTMLFormElement,
    private readonly input: HTMLInputElement,
    private readonly list: HTMLElement,
    private readonly onStatus: (message: string, isError: boolean) => void
  ) {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.add();
    });
    void this.load();
  }

  private async load(): Promise<void> {
    const response = await sendMessage({ type: 'GET_HIDDEN_SITES' });
    if ('sites' in response && response.ok) this.render(response.sites);
  }

  private async add(): Promise<void> {
    const site = normalizeSite(this.input.value);
    if (!site) {
      this.onStatus('Enter a site like meet.google.com.', true);
      return;
    }
    if (this.sites.includes(site)) {
      this.onStatus(`${site} is already hidden.`, false);
      this.input.value = '';
      return;
    }
    await this.save([...this.sites, site], `The strip is now hidden on ${site}.`);
    this.input.value = '';
  }

  private async save(sites: string[], message: string): Promise<void> {
    const response = await sendMessage({ type: 'SET_HIDDEN_SITES', sites });
    if (!response.ok) {
      this.onStatus(response.error, true);
      return;
    }
    if ('sites' in response) this.render(response.sites);
    this.onStatus(message, false);
  }

  private render(sites: string[]): void {
    this.sites = sites;
    this.list.replaceChildren(
      ...sites.map((site) => {
        const chip = document.createElement('span');
        chip.className = 'site-chip';
        chip.append(site);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'site-chip-remove';
        remove.textContent = '×';
        remove.title = `Show the strip on ${site} again`;
        remove.setAttribute('aria-label', `Stop hiding ${site}`);
        remove.addEventListener('click', () =>
          void this.save(
            this.sites.filter((candidate) => candidate !== site),
            `The strip is back on ${site}.`
          )
        );

        chip.append(remove);
        return chip;
      })
    );
    // An empty list is worth saying out loud; an empty row just looks broken.
    if (sites.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'site-empty';
      empty.textContent = 'The strip shows on every page.';
      this.list.append(empty);
    }
  }
}
