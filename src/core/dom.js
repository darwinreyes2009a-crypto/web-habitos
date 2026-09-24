export function registerDom(app) {
  const $ = (selector, root) => (root || document).querySelector(selector);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value') el.value = value;
      else if (key === 'checked') el.checked = value;
      else if (key === 'disabled') el.disabled = true;
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(child));
    }
    return el;
  }

  const uid = (prefix) => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const random = Math.random() * 16 | 0;
      return (c === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
    }));

  const avatarEl = (name, color, size, photo) => h(
    'div',
    {
      class: 'avatar',
      style: `width:${size}px;height:${size}px;${photo ? '' : 'background:' + (color || '#2563EB') + ';'}font-size:${Math.round(size * 0.42)}px`
    },
    photo ? h('img', { src: photo, alt: '' }) : (name || '?').trim().charAt(0).toUpperCase()
  );

  Object.assign(app.core, { $, h, uid, avatarEl });
}
