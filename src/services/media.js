export function registerMedia(app) {
  const { h, icon } = app.core;
  const { toast } = app.components;

  function setPhotoEl(button, hasPhoto) {
    if (button) button.textContent = hasPhoto ? 'Cambiar foto' : 'Añadir foto de la galería';
  }

  function viewImage(src, title) {
    const overlay = h('div', {
      class: 'overlay',
      style: 'z-index:75;align-items:center;padding:20px',
      onclick: event => { if (event.target === overlay) overlay.remove(); }
    });
    const box = h('div', { style: 'max-width:92vw;max-height:88vh;display:flex;flex-direction:column;gap:12px;align-items:center' },
      h('img', { src, alt: title || 'Foto', style: 'max-width:92vw;max-height:74vh;border-radius:var(--r-xl);box-shadow:var(--sh-l);object-fit:contain;background:#fff' }),
      title ? h('b', { style: 'color:#fff;font-size:14px;text-shadow:0 1px 4px rgba(0,0,0,.4)' }, title) : null,
      h('button', { class: 'btn btn-soft', onclick: () => overlay.remove() }, 'Cerrar')
    );
    overlay.append(box);
    document.body.appendChild(overlay);
  }

  function openImageEditor(src, callback, max) {
    const image = new Image();
    image.onload = () => {
      const size = Math.min(330, Math.max(240, Math.floor(Math.min(window.innerWidth * 0.82, 330))));
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.style.cssText = `width:${size}px;height:${size}px;border-radius:18px;background:#111;touch-action:none;display:block`;
      const zoom = h('input', { type: 'range', min: '1', max: '3', step: '.01', value: '1', style: 'width:100%' });
      const rotateButton = h('button', { class: 'btn btn-soft', style: 'padding:9px 14px;font-size:12px' }, 'Girar 90°');
      let rotation = 0;
      rotateButton.onclick = () => { rotation = (rotation + 90) % 360; draw(); };
      const hint = h('p', { style: 'font-size:12px;color:var(--text-2);text-align:center;margin:2px 0 4px' }, 'Arrastra para encuadrar · amplía o gira con los controles');
      const reset = h('button', { class: 'btn btn-soft', style: 'padding:9px 14px;font-size:12px' }, 'Centrar');
      const cancel = h('button', { class: 'btn btn-soft', style: 'padding:9px 16px' }, 'Cancelar');
      const accept = h('button', { class: 'btn btn-primary', style: 'padding:9px 16px' }, 'Usar foto');
      const overlay = h('div', {
        class: 'overlay',
        style: 'z-index:90;align-items:center;padding:18px',
        onclick: event => { if (event.target === overlay) overlay.remove(); }
      });
      const box = h('div', { class: 'sheet', style: 'max-width:390px;width:100%;padding:20px', role: 'dialog', 'aria-label': 'Ajustar foto' },
        h('div', { class: 'sheet-head', style: 'margin-bottom:14px' },
          h('h3', null, 'Ajustar foto'),
          h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => overlay.remove(), html: icon('x', 18) })
        ),
        canvas,
        hint,
        zoom,
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px' },
          h('div', { style: 'display:flex;gap:8px' }, reset, rotateButton),
          h('div', { style: 'display:flex;gap:8px' }, cancel, accept)
        )
      );
      overlay.append(box);
      document.body.appendChild(overlay);

      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let pointerX = 0;
      let pointerY = 0;

      function draw() {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, size, size);
        context.fillStyle = '#111';
        context.fillRect(0, 0, size, size);
        const base = Math.max(size / image.width, size / image.height);
        const width = image.width * base * scale;
        const height = image.height * base * scale;
        context.save();
        context.translate(size / 2, size / 2);
        context.rotate(rotation * Math.PI / 180);
        context.translate(-size / 2, -size / 2);
        context.drawImage(image, (size - width) / 2 + offsetX, (size - height) / 2 + offsetY, width, height);
        context.restore();
      }

      zoom.addEventListener('input', () => { scale = Number(zoom.value); draw(); });
      reset.onclick = () => { scale = 1; offsetX = 0; offsetY = 0; zoom.value = '1'; draw(); };
      canvas.addEventListener('pointerdown', event => {
        dragging = true;
        pointerX = event.clientX;
        pointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', event => {
        if (!dragging) return;
        offsetX += event.clientX - pointerX;
        offsetY += event.clientY - pointerY;
        pointerX = event.clientX;
        pointerY = event.clientY;
        draw();
      });
      canvas.addEventListener('pointerup', () => { dragging = false; });
      canvas.addEventListener('pointercancel', () => { dragging = false; });
      cancel.onclick = () => overlay.remove();
      accept.onclick = () => {
        try {
          const output = document.createElement('canvas');
          output.width = max;
          output.height = max;
          output.getContext('2d').drawImage(canvas, 0, 0, max, max);
          callback(output.toDataURL('image/jpeg', 0.84));
          overlay.remove();
        } catch (error) {
          toast('No se pudo guardar el recorte');
        }
      };
      draw();
    };
    image.onerror = () => toast('Formato de imagen no válido');
    image.src = src;
  }

  function pickImage(callback, max = 720) {
    const input = h('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => openImageEditor(reader.result, callback, max);
      reader.readAsDataURL(file);
    });
    input.click();
  }

  Object.assign(app.services, { setPhotoEl, viewImage, openImageEditor, pickImage });
}
