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
  const WEEK_L = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const WEEK_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const GIFT_STATUSES = ['Idea', 'Comprar', 'Comprado', 'Entregado'];
  const OCCASIONS = ['Cumpleaños', 'Navidad', 'Aniversario', 'Amigo Invisible', 'Graduación', 'Otro'];
  const REMIND_DAYS = [1, 3, 7, 14, 30];

  Object.assign(app.core, {
    DEFAULT_CATEGORIES,
    DEFAULT_RELATIONSHIPS,
    COLORS,
    ICON_CHOICES,
    WEEK_L,
    WEEK_FULL,
    GIFT_STATUSES,
    OCCASIONS,
    REMIND_DAYS
  });
}
