export interface NavSection {
  id: string;
  label: string;
  /** Inline SVG path data for the 20x20 icon. */
  icon: string;
  /** Rendered as a pill on the right of the row. */
  badge?: string;
}

/**
 * Left rail. Built as a list from the start — today it holds one section, and
 * adding the next one is a push to the array rather than a rewrite.
 */
export class SidebarNav {
  private activeId: string;

  constructor(
    private readonly host: HTMLElement,
    private readonly sections: NavSection[],
    private readonly onSelect: (id: string) => void
  ) {
    this.activeId = sections[0]?.id ?? '';
  }

  setBadge(id: string, badge: string): void {
    const section = this.sections.find((candidate) => candidate.id === id);
    if (section) section.badge = badge;
    this.render();
  }

  render(): void {
    const nav = document.createElement('nav');
    nav.className = 'nav';

    for (const section of this.sections) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = section.id === this.activeId ? 'nav-item is-active' : 'nav-item';
      item.setAttribute('aria-current', section.id === this.activeId ? 'page' : 'false');

      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 20 20');
      icon.setAttribute('class', 'nav-icon');
      icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', section.icon);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      icon.append(path);

      const label = document.createElement('span');
      label.className = 'nav-label';
      label.textContent = section.label;
      item.append(icon, label);

      if (section.badge) {
        const badge = document.createElement('span');
        badge.className = 'nav-badge';
        badge.textContent = section.badge;
        item.append(badge);
      }

      item.addEventListener('click', () => {
        this.activeId = section.id;
        this.render();
        this.onSelect(section.id);
      });
      nav.append(item);
    }

    this.host.replaceChildren(nav);
  }
}
