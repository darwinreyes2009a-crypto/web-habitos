import pathlib, json, sys
root = pathlib.Path(r'C:\Users\darwi\Documents\Proyectos\habitos-web')
terms = ['bajar','perro','dientes','ducha','gemelo','limpiar','serum','dermarroller']
out = []
for p in sorted(root.rglob('*')):
    if not p.is_file(): continue
    if p.suffix.lower() not in {'.js','.mjs','.json','.html','.css'}: continue
    try: txt = p.read_text(encoding='utf-8', errors='ignore')
    except Exception: continue
    low = txt.lower()
    if any(t in low for t in terms):
        hits=[]
        for i,line in enumerate(txt.splitlines(),1):
            if any(t in line.lower() for t in terms):
                hits.append(f"{i:5d}: {line.strip()[:160]}")
        out.append("\n=== %s ===\n%s" % (p, "\n".join(hits)))
sys.stdout.buffer.write("\n".join(out).encode('utf-8'))
