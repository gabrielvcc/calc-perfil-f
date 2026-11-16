import { getAccount, signOut } from './auth-client.js';

function setOpen(menu, open) {
  menu.classList.toggle('is-open', open);
  menu.querySelector('[data-account-toggle]').setAttribute('aria-expanded', String(open));
  menu.querySelector('[data-account-dropdown]').hidden = !open;
}

export function closeAccountMenus(restoreFocus = false) {
  document.querySelectorAll('[data-account-menu].is-open').forEach((menu) => {
    const focused = menu.contains(document.activeElement);
    setOpen(menu, false);
    if (restoreFocus && focused) menu.querySelector('[data-account-toggle]').focus();
  });
}

function photoAddress(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function updateAccountMenus() {
  const account = getAccount();
  document.querySelectorAll('[data-account-menu]').forEach((menu) => {
    menu.hidden = !account;
    if (!account) return;
    const button = menu.querySelector('[data-account-toggle]');
    const image = menu.querySelector('[data-account-photo]');
    const initials = menu.querySelector('[data-account-initials]');
    const name = account.name || account.email;
    button.title = name;
    button.setAttribute('aria-label', `${name}: opções da conta`);
    initials.textContent = name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase() || '?';
    const photo = photoAddress(account.photoURL);
    if (!photo) {
      image.removeAttribute('src');
      image.hidden = true;
      initials.hidden = false;
    } else if (image.getAttribute('src') !== photo) {
      image.hidden = true;
      initials.hidden = false;
      image.src = photo;
    }
  });
}

export function initializeAccountMenus(root) {
  root.querySelectorAll('[data-account-menu]').forEach((menu) => {
    const button = menu.querySelector('[data-account-toggle]');
    const image = menu.querySelector('[data-account-photo]');
    const initials = menu.querySelector('[data-account-initials]');
    let hovered = false;
    button.addEventListener('click', (event) => {
      const open = hovered && event.detail > 0 ? true : !menu.classList.contains('is-open');
      closeAccountMenus();
      setOpen(menu, open);
    });
    menu.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = true;
      closeAccountMenus();
      setOpen(menu, true);
    });
    menu.addEventListener('pointerleave', () => {
      hovered = false;
      if (!menu.contains(document.activeElement)) setOpen(menu, false);
    });
    menu.addEventListener('focusout', (event) => {
      if (!menu.contains(event.relatedTarget)) setOpen(menu, false);
    });
    image.addEventListener('load', () => { image.hidden = false; initials.hidden = true; });
    image.addEventListener('error', () => { image.hidden = true; initials.hidden = false; });
    menu.querySelector('[data-sign-out]').addEventListener('click', async (event) => {
      const logout = event.currentTarget;
      logout.disabled = true;
      try { await signOut(); }
      finally { logout.disabled = false; }
    });
  });
  updateAccountMenus();
}

document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('[data-account-menu]')) closeAccountMenus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAccountMenus(true);
});
