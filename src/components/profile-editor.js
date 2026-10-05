/**
 * Shared profile editor sheet.
 *
 * Both the onboarding "edit card" flow and the settings profile screen need
 * the same name + color + photo editor. This module centralises that logic so
 * the two callers stay in sync and never drift apart again.
 */
export function registerProfileEditor(app) {
  const { h, icon, avatarEl, COLORS } = app.core;
  const { S, save } = app.state;
  const { openSheet, closeOverlays, confirmDialog, toast } = app.components;
  const { pickImage, setPhotoEl } = app.services;

  function profileEditorSheet(profile, { onSaved } = {}) {
    openSheet('Editar perfil', () => {
      let newColor = profile.color;
      let newPhoto = profile.photo || '';
      const body = h('div');

      // --- Avatar preview -------------------------------------------------
      const avatarPreview = h('div', { style: 'display:flex;justify-content:center;margin-bottom:16px;position:relative' });
      const nameInput = h('input', {
        class: 'input', type: 'text', value: profile.name,
        maxlength: '24', style: 'text-align:center;font-weight:700;font-size:17px'
      });
      const photoButton = h('button', {
        class: 'btn btn-soft',
        // El avatar, el nombre y los colores van centrados; el boton se
        // quedaba pegado al margen izquierdo por no ser bloque.
        style: 'display:block;margin:10px auto 0;padding:8px 14px;font-size:12px'
      });

      function drawAvatar() {
        avatarPreview.innerHTML = '';
        // El botón de quitar foto va anclado a la esquina del avatar. Antes se
        // posicionaba contra el contenedor centrado entero, así que acababa
        // pegado al borde de la hoja y casi encima del aspa de cerrar.
        const frame = h('div', { style: 'position:relative;display:inline-flex' });
        frame.append(avatarEl(nameInput.value || profile.name, newColor, 64, newPhoto));
        if (newPhoto) {
          frame.append(h('button', {
            class: 'rm-photo',
            'aria-label': 'Quitar foto',
            onclick: () => {
              newPhoto = '';
              drawAvatar();
              setPhotoEl(photoButton, '');
            },
            html: icon('x', 15)
          }));
        }
        avatarPreview.append(frame);
        setPhotoEl(photoButton, newPhoto);
      }

      photoButton.onclick = () => pickImage(data => { newPhoto = data; drawAvatar(); }, 512);
      drawAvatar();
      nameInput.addEventListener('input', drawAvatar);

      // --- Color swatches -------------------------------------------------
      const swatches = h('div', { class: 'swatches', style: 'justify-content:center;margin:16px 0 22px' });
      for (const swatchColor of COLORS) {
        swatches.append(h('button', {
          class: 'swatch' + (swatchColor === newColor ? ' on' : ''),
          style: 'background:' + swatchColor,
          onclick: event => {
            newColor = swatchColor;
            [...swatches.children].forEach(item => item.classList.remove('on'));
            event.currentTarget.classList.add('on');
            drawAvatar();
          }
        }));
      }

      // --- Actions --------------------------------------------------------
      body.append(
        avatarPreview,
        photoButton,
        h('div', { class: 'field', style: 'margin-top:14px' }, h('label', null, 'Nombre'), nameInput),
        swatches,
        h('button', {
          class: 'btn btn-primary btn-block btn-lg',
          onclick: () => {
            const name = nameInput.value.trim();
            if (!name) {
              toast('El nombre no puede estar vacío');
              nameInput.focus();
              return;
            }
            const apply = () => {
              profile.name = name;
              profile.color = newColor;
              profile.photo = newPhoto;
              save();
              closeOverlays();
              if (typeof app.render === 'function') app.render();
              toast('Perfil actualizado');
              if (onSaved) onSaved();
            };
            if (name !== profile.name) {
              confirmDialog({
                title: '¿Cambiar el nombre?',
                message: 'Tu perfil pasará a llamarse "' + name + '" en toda la aplicación.',
                confirmText: 'Cambiar nombre',
                onConfirm: apply
              });
            } else {
              apply();
            }
          }
        }, 'Guardar cambios')
      );

      const submitButton = body.querySelector('.btn-primary');
      if (submitButton) nameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); submitButton.click(); }
      });
      return body;
    });
  }

  Object.assign(app.components, { profileEditorSheet });
}
