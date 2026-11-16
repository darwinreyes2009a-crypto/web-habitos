export function registerConstants(app) {
  const DEFAULT_CATEGORIES = ['Hábitos', 'Casa', 'Personal', 'Estudio', 'Otros'];
  const DEFAULT_RELATIONSHIPS = ['Pareja', 'Familia', 'Amigo/a', 'Compañero/a', 'Otro'];
  const COLORS = ['#2563EB', '#4F46E5', '#7C3AED', '#A855F7', '#C026D3', '#DB2777', '#E11D48', '#DC2626', '#EA580C', '#D97706', '#F59E0B', '#84CC16', '#16A34A', '#059669', '#0D9488', '#0EA5E9', '#78716C', '#92400E', '#64748B', '#475569'];
  const ICON_CHOICES = [
    { id: 'tooth', label: 'Dientes' }, { id: 'shower', label: 'Ducha' }, { id: 'paw', label: 'Mascota' }, { id: 'home', label: 'Casa' },
    { id: 'dumbbell', label: 'Ejercicio' }, { id: 'book', label: 'Estudio' }, { id: 'cart', label: 'Comprar' }, { id: 'star', label: 'Otro' },
    { id: 'shirt', label: 'Ropa' }, { id: 'coffee', label: 'Café' },
    { id: 'water', label: 'Agua' }, { id: 'walk', label: 'Caminar' }, { id: 'meditate', label: 'Meditar' }, { id: 'cook', label: 'Cocinar' },
    { id: 'clean', label: 'Limpiar' }, { id: 'car', label: 'Coche' }, { id: 'phone', label: 'Llamar' }, { id: 'mail', label: 'Correo' },
    { id: 'music', label: 'Música' }, { id: 'money', label: 'Dinero' }, { id: 'meds', label: 'Medicinas' }, { id: 'plant', label: 'Plantas' },
    { id: 'laptop', label: 'Ordenador' }, { id: 'briefcase', label: 'Trabajo' }, { id: 'heart', label: 'Salud' },
    { id: 'bed', label: 'Dormir' }, { id: 'alarm', label: 'Alarma' }, { id: 'folder', label: 'Archivos' }, { id: 'pencil', label: 'Escribir' },
    { id: 'recycle', label: 'Reciclar' }
  ];
  /* --- Emojis de hábito ---------------------------------------------------
     Los hábitos guardan su emoji en el campo `icon` que ya existía (texto): un
     emoji nativo o, en los antiguos, el id de un icono SVG. No hay migración.
     El selector los agrupa por categoría y admite cualquier emoji escrito a
     mano; `emojiOf` resuelve el avatar de un hábito sin emoji con un emoji
     coherente con su icono o su categoría. -------------------------------- */
  const EMOJI_GROUPS = [
    { id: 'salud', label: 'Salud', emojis: ['🏃', '💧', '🥗', '🦷', '🚿', '🏋️', '🚶', '💊', '🩺', '🌞'] },
    { id: 'mente', label: 'Mente', emojis: ['🧘', '📖', '✍️', '🧠', '🎧', '🎨', '🙏', '🗒️', '🌙'] },
    { id: 'casa', label: 'Casa', emojis: ['🧹', '🪴', '🍳', '🧺', '🛏️', '🧽', '🐾', '🗑️', '🧴'] },
    { id: 'bienestar', label: 'Bienestar', emojis: ['😴', '🛁', '🕯️', '💆', '☕', '🍵', '❤️', '🌿', '🧖'] },
    { id: 'productividad', label: 'Productividad', emojis: ['💻', '🎯', '⏰', '📚', '📅', '✅', '💡', '🔧', '🧾'] }
  ];

  // Emoji por defecto para los hábitos que aún guardan un icono SVG.
  const ICON_EMOJI = {
    tooth: '🦷', shower: '🚿', paw: '🐾', home: '🏠', dumbbell: '🏋️', book: '📖',
    cart: '🛒', star: '✨', shirt: '👕', coffee: '☕', water: '💧', walk: '🚶',
    meditate: '🧘', cook: '🍳', clean: '🧹', car: '🚗', phone: '📱', mail: '✉️',
    music: '🎧', money: '💰', meds: '💊', plant: '🪴', laptop: '💻', briefcase: '💼',
    heart: '❤️', bed: '😴', alarm: '⏰', folder: '📁', pencil: '✍️', recycle: '♻️'
  };
  const CATEGORY_EMOJI = { 'Hábitos': '✨', 'Casa': '🏠', 'Personal': '🌿', 'Estudio': '📚', 'Otros': '🎯' };
  const DEFAULT_EMOJI = '✨';

  const EMOJI_RE = /^[\p{Extended_Pictographic}\uFE0F\u200D\p{Emoji_Modifier}\p{Emoji_Component}]+$/u;
  function isEmoji(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text || text.length > 16) return false;
    return EMOJI_RE.test(text);
  }
  function emojiOf(task) {
    const value = task && task.icon;
    if (isEmoji(value)) return String(value).trim();
    return ICON_EMOJI[value] || CATEGORY_EMOJI[task && task.cat] || DEFAULT_EMOJI;
  }
  // Color glow estable por hábito: el mismo hábito conserva su tono suave.
  function glowOf(task) {
    const seed = String((task && (task.id || task.title)) || '') + emojiOf(task);
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 100003;
    return (hash % 6) + 1;
  }
  function emojiAvatar(task, size) {
    const box = size || 32;
    return app.core.h('span', {
      class: 'habit-emoji' + (box >= 44 ? ' habit-emoji-lg' : ''),
      'aria-hidden': 'true',
      style: 'width:' + box + 'px;height:' + box + 'px;font-size:' + Math.round(box * 0.6) + 'px;background:var(--glow-' + glowOf(task) + ')'
    }, emojiOf(task));
  }

  const WEEK_L = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const WEEK_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const GIFT_STATUSES = ['Idea', 'Comprar', 'Comprado', 'Entregado'];
  /* Presentación de esos cuatro estados: el valor guardado no cambia (sigue
     siendo Idea/Comprar/Comprado/Entregado), aquí solo vive el emoji y la
     etiqueta que se pintan en las tarjetas. */
  const GIFT_STATUS_META = {
    Idea: { emoji: '💡', label: 'Idea' },
    Comprar: { emoji: '🛒', label: 'Por comprar' },
    Comprado: { emoji: '✨', label: 'Comprado' },
    Entregado: { emoji: '🎉', label: 'Entregado' }
  };
  const giftStatusMeta = status => GIFT_STATUS_META[status] || GIFT_STATUS_META.Idea;
  const OCCASIONS = ['Cumpleaños', 'Navidad', 'Aniversario', 'Amigo Invisible', 'Graduación', 'Otro'];
  const REMIND_DAYS = [1, 3, 7, 14, 30];

  Object.assign(app.core, {
    DEFAULT_CATEGORIES,
    DEFAULT_RELATIONSHIPS,
    COLORS,
    ICON_CHOICES,
    EMOJI_GROUPS,
    ICON_EMOJI,
    CATEGORY_EMOJI,
    DEFAULT_EMOJI,
    isEmoji,
    emojiOf,
    glowOf,
    emojiAvatar,
    WEEK_L,
    WEEK_FULL,
    GIFT_STATUSES,
    GIFT_STATUS_META,
    giftStatusMeta,
    OCCASIONS,
    REMIND_DAYS
  });
}
