import { markdownPreview } from '../src/features/class/notes.js';

let fallos = 0;
const checks = [
  ['escapa etiquetas HTML', markdownPreview('<script>alert(1)</script>').includes('&lt;script&gt;') && !markdownPreview('<script>alert(1)</script>').includes('<script>')],
  ['escapa ampersands antes de procesar formato', markdownPreview('& **ok**').includes('&amp; <strong>ok</strong>')],
  ['permite negrita, cursiva y código', markdownPreview('**fuerte** *énfasis* `código`') === '<strong>fuerte</strong> <em>énfasis</em> <code>código</code>'],
  ['convierte viñetas y saltos de línea', markdownPreview('- uno\n- dos') === '• uno<br>• dos'],
  ['no crea atributos o enlaces HTML', !markdownPreview('<img src=x onerror=alert(1)> [sitio](javascript:alert(1))').includes('<img') && !markdownPreview('<img src=x onerror=alert(1)> [sitio](javascript:alert(1))').includes('href=')]
];
for (const [label, ok] of checks) {
  console.log((ok ? '  OK  ' : ' FALLO') + ' ' + label);
  if (!ok) fallos++;
}
console.log('\n' + (fallos ? fallos + ' comprobaciones fallidas' : 'Todo correcto (' + checks.length + ' comprobaciones)'));
process.exit(fallos ? 1 : 0);
