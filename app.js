// ── DATA ──────────────────────────────────────────────────────────────
// 10 filas realistas de Cochineló y La Emilia.
// Misma forma que llega de Looker Studio (sin el wrapping dscc).
const RAW_ROWS = [
  { establecimiento: 'Cochineló', ingrediente: 'Expeller de soja',  kg_sugeridos: 2200,  kg_reales: 3700,  viajes: 6  },
  { establecimiento: 'Cochineló', ingrediente: 'Silaje de maíz',    kg_sugeridos: 12000, kg_reales: 8100,  viajes: 8  },
  { establecimiento: 'Cochineló', ingrediente: 'Urea',              kg_sugeridos: 180,   kg_reales: 230,   viajes: 6  },
  { establecimiento: 'Cochineló', ingrediente: 'Pellet de girasol', kg_sugeridos: 1800,  kg_reales: 2100,  viajes: 5  },
  { establecimiento: 'Cochineló', ingrediente: 'Maíz',              kg_sugeridos: 8500,  kg_reales: 9020,  viajes: 12 },
  { establecimiento: 'La Emilia', ingrediente: 'Pellet de girasol', kg_sugeridos: 1500,  kg_reales: 2320,  viajes: 4  },
  { establecimiento: 'La Emilia', ingrediente: 'Silaje de maíz',    kg_sugeridos: 9500,  kg_reales: 11200, viajes: 7  },
  { establecimiento: 'La Emilia', ingrediente: 'Expeller de soja',  kg_sugeridos: 1900,  kg_reales: 1610,  viajes: 5  },
  { establecimiento: 'La Emilia', ingrediente: 'Maíz',              kg_sugeridos: 7200,  kg_reales: 7680,  viajes: 10 },
  { establecimiento: 'La Emilia', ingrediente: 'Afrechillo',        kg_sugeridos: 800,   kg_reales: 695,   viajes: 4  },
];

// Umbrales y colores — mismos defaults que src/compute.js y src/render.js
const CONFIG = {
  umbralAlto:     40,
  umbralModerado: 15,
  topN:           10,
  colorAlto:      '#D94B4B',
  colorModerado:  '#E89A2B',
  colorLeve:      '#4A8FD9',
};

// ── COMPUTE ───────────────────────────────────────────────────────────
// Mismo algoritmo que src/compute.js, sin wrapper dscc.
// Cuando exista src/viz.js, estas funciones vendrán de ahí vía import.

function computeData(rows, activeChip) {
  const parsed = rows
    .filter(r => r.kg_sugeridos > 0)
    .map(r => ({
      ...r,
      desvio_pct: Math.abs(r.kg_reales - r.kg_sugeridos) / r.kg_sugeridos * 100,
    }));

  const filtered = activeChip === 'Ambos'
    ? parsed
    : parsed.filter(r => r.establecimiento === activeChip);

  const establecimientos = new Set(filtered.map(r => r.establecimiento));

  // Agrupar por ingrediente: promedio ponderado por viajes + desvío máximo
  const groups = new Map();
  for (const r of filtered) {
    if (!groups.has(r.ingrediente)) {
      groups.set(r.ingrediente, { desvio_viajes_sum: 0, viajes_total: 0, desvio_max: 0 });
    }
    const g = groups.get(r.ingrediente);
    g.desvio_viajes_sum += r.desvio_pct * r.viajes;
    g.viajes_total      += r.viajes;
    g.desvio_max         = Math.max(g.desvio_max, r.desvio_pct);
  }

  const ranking = [];
  for (const [ingrediente, g] of groups) {
    const desvio_prom = g.viajes_total > 0 ? g.desvio_viajes_sum / g.viajes_total : 0;
    const severidad =
      desvio_prom >= CONFIG.umbralAlto     ? 'Alto'     :
      desvio_prom >= CONFIG.umbralModerado ? 'Moderado' : 'Leve';
    ranking.push({ ingrediente, desvio_prom, desvio_max: g.desvio_max, viajes_total: g.viajes_total, severidad });
  }
  ranking.sort((a, b) => b.desvio_prom - a.desvio_prom);

  // KPIs
  let totalViajesPct = 0, totalViajes = 0;
  for (const r of filtered) {
    totalViajesPct += r.desvio_pct * r.viajes;
    totalViajes    += r.viajes;
  }
  const desvioGlobalProm = totalViajes > 0 ? totalViajesPct / totalViajes : 0;

  return {
    ranking,
    kpis: {
      mayorDispersion:     ranking[0] || null,
      desvioGlobalProm,
      totalViajes,
      numEstablecimientos: establecimientos.size,
    },
  };
}

// ── RENDER ────────────────────────────────────────────────────────────
// Mismo árbol DOM y clases CSS que src/render.js.
// render() es el punto de entrada: re-dibuja todo en document.body.

function render(activeChip) {
  const { ranking, kpis } = computeData(RAW_ROWS, activeChip);

  document.body.innerHTML = '';

  const wrapper = el('div', 'rdv-wrapper');
  wrapper.appendChild(buildChipsRow(activeChip));
  wrapper.appendChild(buildKpiGrid(kpis));
  wrapper.appendChild(buildSectionSubtitle(activeChip));

  const { list, verMas } = buildRankingList(ranking);
  wrapper.appendChild(list);
  if (verMas) wrapper.appendChild(verMas);

  document.body.appendChild(wrapper);
}

function buildChipsRow(activeChip) {
  const row = el('div', 'rdv-chips-row');
  ['Ambos', 'Cochineló', 'La Emilia'].forEach(chip => {
    const btn = el('button', 'rdv-chip' + (chip === activeChip ? ' rdv-chip--active' : ''));
    btn.textContent = chip;
    btn.addEventListener('click', () => render(chip));
    row.appendChild(btn);
  });
  const more = el('button', 'rdv-chip-more');
  more.textContent = '…';
  row.appendChild(more);
  return row;
}

function buildKpiGrid(kpis) {
  const grid = el('div', 'rdv-kpi-grid');
  const top = kpis.mayorDispersion;

  grid.appendChild(kpiCard(
    'Mayor dispersión',
    top ? top.ingrediente : '—',
    top ? `${top.desvio_prom.toFixed(1)}% prom · max ${top.desvio_max.toFixed(0)}%` : '—',
    '#B23B3B'
  ));
  grid.appendChild(kpiCard(
    'Desvío global promedio',
    `${kpis.desvioGlobalProm.toFixed(1)}%`,
    'ponderado por viajes',
    '#6B6B6B'
  ));
  const n = kpis.numEstablecimientos;
  grid.appendChild(kpiCard(
    'Total viajes analizados',
    fmtNum(kpis.totalViajes),
    `${n} establecimiento${n !== 1 ? 's' : ''}`,
    '#6B6B6B'
  ));
  return grid;
}

function kpiCard(label, value, subtitle, subtitleColor) {
  const card = el('div', 'rdv-kpi-card');
  const lbl  = el('div', 'rdv-kpi-label');  lbl.textContent = label;
  const val  = el('div', 'rdv-kpi-value');  val.textContent = value;
  const sub  = el('div', 'rdv-kpi-subtitle');
  sub.textContent = subtitle;
  sub.style.color = subtitleColor;
  card.append(lbl, val, sub);
  return card;
}

function buildSectionSubtitle(activeChip) {
  const div   = el('div', 'rdv-section-subtitle');
  const estab = el('span', 'rdv-section-estab');
  estab.textContent = activeChip;
  const desc  = el('span', 'rdv-section-desc');
  desc.textContent = ' — Desvío promedio absoluto % (kg_real vs kg_sug) · datos mock';
  div.append(estab, desc);
  return div;
}

function buildRankingList(ranking) {
  const list = el('div', 'rdv-list');

  if (ranking.length === 0) {
    const empty = el('div', 'rdv-empty');
    empty.textContent = 'Sin datos para el filtro seleccionado.';
    list.appendChild(empty);
    return { list, verMas: null };
  }

  let showAll = false;

  function renderRows(items) {
    list.innerHTML = '';
    items.forEach((item, i) => list.appendChild(buildRow(item, i + 1)));
  }

  renderRows(ranking.slice(0, CONFIG.topN));

  if (ranking.length <= CONFIG.topN) return { list, verMas: null };

  const verMas  = el('div', 'rdv-ver-mas');
  const chevron = el('span', 'rdv-chevron');
  chevron.textContent = '▼';
  verMas.appendChild(chevron);
  verMas.addEventListener('click', () => {
    showAll = !showAll;
    renderRows(showAll ? ranking : ranking.slice(0, CONFIG.topN));
    chevron.textContent = showAll ? '▲' : '▼';
  });

  return { list, verMas };
}

function buildRow(item, pos) {
  const color   = severityColor(item.severidad);
  const bgColor = hexToRgba(color, 0.13);

  const row = el('div', 'rdv-row');

  const posEl = el('span', 'rdv-row-pos');
  posEl.textContent = `#${pos}`;

  const nameEl = el('span', 'rdv-row-name');
  nameEl.textContent = item.ingrediente;

  const barWrap = el('span', 'rdv-row-bar-wrap');
  const bar     = el('span', 'rdv-row-bar');
  bar.style.width           = `${Math.min(item.desvio_prom, 100)}%`;
  bar.style.backgroundColor = color;

  const barLabel = el('span', 'rdv-row-bar-label');
  barLabel.textContent = `${item.desvio_prom.toFixed(1)}%`;
  bar.appendChild(barLabel);
  barWrap.appendChild(bar);

  const pctEl = el('span', 'rdv-row-pct');
  pctEl.textContent = `${item.desvio_prom.toFixed(1)}%`;

  const badge = el('span', 'rdv-badge');
  badge.style.backgroundColor = bgColor;
  badge.style.color           = color;
  badge.textContent           = item.severidad;

  const viajesEl = el('span', 'rdv-row-viajes');
  viajesEl.textContent = `${fmtNum(item.viajes_total)} viajes`;

  row.append(posEl, nameEl, barWrap, pctEl, badge, viajesEl);
  return row;
}

// ── HELPERS ───────────────────────────────────────────────────────────

function severityColor(severidad) {
  if (severidad === 'Alto')     return CONFIG.colorAlto;
  if (severidad === 'Moderado') return CONFIG.colorModerado;
  return CONFIG.colorLeve;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtNum(n) {
  return (n || 0).toLocaleString('es-AR');
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// ── INIT ──────────────────────────────────────────────────────────────
render('Ambos');
