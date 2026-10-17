import Papa from 'papaparse';

const SHEET_ID = '1Bq-qjAq-7hRlrZ_d1k-6GswGOD3c4Tht0zJy55VNIRM';
const SHEET_GID = '2033003787';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;

// Colores oficiales del campamento AGIOS 2026
export const COLORS = [
  { name: 'Rojo', hex: '#d6322f', ink: '#ffffff' },
  { name: 'Amarillo', hex: '#f2b705', ink: '#12281C' },
  { name: 'Verde', hex: '#2e9e5b', ink: '#12281C' },
  { name: 'Azul', hex: '#2563c9', ink: '#ffffff' },
];
export const STAFF = { name: 'Blanco', hex: '#ffffff', ink: '#12281C' };

export const norm = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// 8 dígitos -> agrega 591. Devuelve '' si no es un celular válido.
export function normPhone(raw = '') {
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 8) d = '591' + d;
  return /^591\d{8}$/.test(d) ? d : '';
}

export async function fetchPeople() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error('No se pudo leer la hoja. Revisa que esté compartida por enlace.');
  const { data, meta } = Papa.parse(await res.text(), { header: true, skipEmptyLines: true });

  const find = (...keys) => meta.fields.find((h) => keys.some((k) => norm(h).includes(k)));
  // Encabezado exacto "Rol"
  const rolExactHeader = meta.fields.find((h) => norm(h) === 'rol');

  const c = {
    ts: find('marca'),
    nombre: find('nombre'),
    edad: find('anos', 'edad'),
    iglesia: find('iglesia'),
    genero: find('genero'),
    tel: find('celular'),
    pago: find('pago'),
  };

  const validRows = data.filter((r) => (r[c.nombre] || '').trim());

  // Detectar marcas temporales duplicadas sin alterar el identificador
  const tsCounts = {};
  for (const r of validRows) {
    const rawTs = (r[c.ts] || '').trim();
    if (rawTs) {
      tsCounts[rawTs] = (tsCounts[rawTs] || 0) + 1;
    }
  }

  return validRows.map((r) => {
    const g = norm(r[c.genero]);
    const ig = (r[c.iglesia] || '').trim();
    const rawTs = (r[c.ts] || '').trim();
    const isStaff = Boolean(
      (rolExactHeader && norm(r[rolExactHeader]) === 'staff') ||
      (c.pago && norm(r[c.pago]).includes('staff'))
    );

    // Reconoce femenino y mujer como F; masculino, varon y hombre como M
    let genero = '';
    if (g.startsWith('fem') || g.startsWith('muj')) {
      genero = 'F';
    } else if (g.startsWith('masc') || g.startsWith('var') || g.startsWith('hom')) {
      genero = 'M';
    }

    return {
      id: rawTs || norm(r[c.nombre]), // la marca temporal no cambia
      ts: rawTs,
      hasDuplicateTs: Boolean(rawTs && tsCounts[rawTs] > 1),
      nombre: r[c.nombre].trim(),
      edad: (r[c.edad] || '').trim(),
      iglesia: !ig ? 'Otros / Invitados' : norm(ig).includes('invitad') || norm(ig) === 'otro' ? 'Otros / Invitados' : ig,
      genero,
      telRaw: (r[c.tel] || '').trim(),
      tel: normPhone(r[c.tel]),
      isStaff,
    };
  });
}

export const isColor = (n) => COLORS.some((c) => c.name === n);

// Solo asigna a quien aún no tiene color; nunca mueve a los ya asignados.
// Excluye inscritos con marcas temporales duplicadas hasta resolverlo en Excel.
export function pickColors(rows) {
  const placed = rows.filter((r) => isColor(r.colorName)).map((r) => ({ ig: r.iglesia, g: r.genero, color: r.colorName }));
  const pending = rows
    .filter((r) => r.rol === 'participante' && !isColor(r.colorName) && r.genero && !r.hasDuplicateTs)
    .sort((a, b) => a.iglesia.localeCompare(b.iglesia) || a.genero.localeCompare(b.genero) || a.id.localeCompare(b.id));

  const picks = {};
  for (const p of pending) {
    const scored = COLORS.map((c) => {
      const mine = placed.filter((x) => x.color === c.name);
      return {
        c,
        s: [
          mine.filter((x) => x.ig === p.iglesia && x.g === p.genero).length,
          mine.filter((x) => x.ig === p.iglesia).length,
          mine.filter((x) => x.g === p.genero).length,
          mine.length,
        ],
      };
    }).sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1] || a.s[2] - b.s[2] || a.s[3] - b.s[3]);

    const best = scored[0].c.name;
    placed.push({ ig: p.iglesia, g: p.genero, color: best });
    picks[p.id] = best;
  }
  return picks;
}

// Persistencia: GitHub Gist (si hay variables VITE_) + copia en localStorage.
const GIST_ID = import.meta.env.VITE_GIST_ID;
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const FILE = 'campamento-2026.json';
const LS = 'campamento_2026_v1';
export const cloudEnabled = Boolean(GIST_ID && TOKEN);
const ghHeaders = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' };

export async function loadState() {
  const readLocal = () => {
    try {
      return JSON.parse(localStorage.getItem(LS) || '{}');
    } catch {
      return {};
    }
  };

  if (!cloudEnabled) {
    return { state: readLocal(), fallback: false };
  }

  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: ghHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = (await res.json()).files?.[FILE];
    const data = file ? JSON.parse(file.content || '{}') : {};
    return { state: data, fallback: false };
  } catch (err) {
    console.warn('Fallo al leer GitHub Gist, usando copia local:', err);
    return { state: readLocal(), fallback: true };
  }
}

export async function saveState(state) {
  // Guardar exclusivamente: color, enviado y asistio por clave de persona
  const cleanState = {};
  for (const [id, val] of Object.entries(state || {})) {
    if (!val || typeof val !== 'object') continue;
    const entry = {};
    if (val.color) entry.color = val.color;
    if (val.enviado) entry.enviado = val.enviado;
    if (val.asistio) entry.asistio = true;
    if (Object.keys(entry).length > 0) {
      cleanState[id] = entry;
    }
  }

  localStorage.setItem(LS, JSON.stringify(cleanState));
  if (!cloudEnabled) return;

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(cleanState) } } }),
  });
  if (!res.ok) throw new Error('No se pudo guardar en GitHub. Los cambios quedaron solo en este navegador.');
}
