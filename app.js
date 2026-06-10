/* Descuentos en comida · Santiago — lógica del sitio.
   Lee data.json (exportado por el repo de datos) y renderiza con los mismos
   criterios del correo: día seleccionado, vigencia (fecha Santiago), top por %. */

const BANCOS = [
  { nombre: "CMR Falabella", color: "#2DB94C", url: "https://bancofalabella.cl/descuentos" },
  { nombre: "Banco de Chile", color: "#003087", url: "https://www.bancochile.cl/personas/beneficios" },
  { nombre: "BCI",            color: "#0033A0", url: "https://www.bci.cl/personas/beneficios" },
  { nombre: "Santander",      color: "#EC0000", url: "https://banco.santander.cl/personas/beneficios" },
  { nombre: "Itaú",           color: "#EC7000", url: "https://www.itau.cl/personas/beneficios" },
  { nombre: "BICE",           color: "#004B8D", url: "https://www.bice.cl/personas/beneficios" },
];
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScfOH3mzOrMN5hBaX74k2IFxHrfxanplOuyTMGKnz-a6hTYDA/viewform";
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const EMOJI = { delivery: "🍕", restaurante: "🍽️", cafe: "☕", supermercado: "🛒" };
const MAX_POR_BANCO = 24; // la web tiene más espacio que el correo

const state = { dia: diaSantiago(), q: "", bancos: new Set(BANCOS.map(b => b.nombre)), data: [] };

function diaSantiago() {
  // Día ISO (1=Lun..7=Dom) en America/Santiago, sin importar el tz del visitante.
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", weekday: "short" })
    .format(new Date());
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[s.slice(0, 3)] || 1;
}

function hoyISOSantiago() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function fmtTope(d) {
  if (d.tope) return "tope $" + d.tope.toLocaleString("es-CL");
  if (d.sin_tope) return "sin tope";
  return "";
}

function dias_label(arr) {
  const ds = [...new Set(arr)].sort((a, b) => a - b);
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (eq(ds, [1, 2, 3, 4, 5, 6, 7])) return "Todos los días";
  if (eq(ds, [1, 2, 3, 4, 5])) return "Lun a Vie";
  if (eq(ds, [1, 2, 3, 4, 5, 6])) return "Lun a Sáb";
  const consec = ds.every((v, i) => i === 0 || v === ds[i - 1] + 1);
  if (consec && ds.length >= 3) return `${DIAS[ds[0] - 1]} a ${DIAS[ds[ds.length - 1] - 1]}`;
  if (ds.length === 2) return `${DIAS[ds[0] - 1]} y ${DIAS[ds[1] - 1]}`;
  return ds.map(d => DIAS[d - 1]).join(", ");
}

function visibles() {
  const hoy = hoyISOSantiago();
  const q = state.q.trim().toLowerCase();
  return state.data.filter(d =>
    d.dias.includes(state.dia) &&
    (!d.vigencia || d.vigencia >= hoy) &&
    state.bancos.has(d.banco) &&
    (!q || d.comercio.toLowerCase().includes(q))
  );
}

function render() {
  const hoy = hoyISOSantiago();
  const items = visibles();

  // Hero: total del día (sin filtros de búsqueda/banco, para que sea estable).
  const totalDia = state.data.filter(d =>
    d.dias.includes(state.dia) && (!d.vigencia || d.vigencia >= hoy)).length;
  const esHoy = state.dia === diaSantiago();
  const cuando = esHoy ? "activas hoy" : `para el ${DIAS[state.dia - 1].toLowerCase()}`;
  document.getElementById("hero-sub").textContent =
    `${totalDia} ofertas ${cuando} en Santiago`;

  // Tabs
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const n = state.data.filter(d => d.dias.includes(i) && (!d.vigencia || d.vigencia >= hoy)).length;
    const b = document.createElement("button");
    b.className = "tab" + (i === state.dia ? " activo" : "");
    b.innerHTML = `${DIAS[i - 1]}${i === diaSantiago() ? " · hoy" : ""} <span class="n">${n}</span>`;
    b.onclick = () => { state.dia = i; render(); };
    tabs.appendChild(b);
  }

  // Chips de banco
  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  for (const bco of BANCOS) {
    const c = document.createElement("button");
    const on = state.bancos.has(bco.nombre);
    c.className = "chip" + (on ? " activo" : " apagado");
    c.style.setProperty("--chipcolor", bco.color);
    c.textContent = bco.nombre;
    c.onclick = () => {
      if (on && state.bancos.size === 1) { state.bancos = new Set(BANCOS.map(b => b.nombre)); }
      else if (on) { state.bancos.delete(bco.nombre); }
      else { state.bancos.add(bco.nombre); }
      render();
    };
    chips.appendChild(c);
  }

  // Destacados: mejor oferta por banco (máx 3), solo con lo visible.
  const mejorPorBanco = {};
  for (const d of [...items].sort((a, b) => b.pct - a.pct)) {
    if (!mejorPorBanco[d.banco]) mejorPorBanco[d.banco] = d;
  }
  const top = Object.values(mejorPorBanco).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const dsec = document.getElementById("destacados-sec");
  dsec.hidden = top.length < 2;
  document.getElementById("destacados").innerHTML = top.map(d => {
    const bco = BANCOS.find(b => b.nombre === d.banco);
    return `<a class="dest" style="background:${bco.color}" href="${esc(d.url || bco.url)}" target="_blank" rel="noopener">
      <span class="hasta">hasta</span>
      <div class="pct">${d.pct}%</div>
      <div class="nom">${EMOJI[d.subcat] || "🍴"} ${esc(d.comercio)}</div>
      <div class="bco">${esc(d.banco)}</div>
    </a>`;
  }).join("");

  // Listado por banco
  const res = document.getElementById("resultado");
  res.innerHTML = "";
  let alguno = false;
  for (const bco of BANCOS) {
    const del = items.filter(d => d.banco === bco.nombre)
      .sort((a, b) => b.pct - a.pct).slice(0, MAX_POR_BANCO);
    if (!del.length) continue;
    alguno = true;
    const sec = document.createElement("section");
    sec.innerHTML = `
      <div class="banco-head" style="background:${bco.color}">
        <div class="nom">${esc(bco.nombre)}</div>
        <div class="cnt">${del.length} oferta(s)</div>
      </div>
      <div class="grid">
        ${del.map(d => card(d, bco)).join("")}
      </div>`;
    res.appendChild(sec);
  }
  if (!alguno) {
    res.innerHTML = `<div class="vacio">Nada con esos filtros 😕 — prueba con otro día o limpia la búsqueda.</div>`;
  }
}

function card(d, bco) {
  const hoy = hoyISOSantiago();
  const ultimo = d.vigencia && d.vigencia === hoy;
  const tope = fmtTope(d);
  const extra = [tope, d.condicion].filter(Boolean).map(esc).join(" · ");
  const link = esc(d.url || bco.url);
  return `<div class="cardo" style="--bcolor:${bco.color}">
    <div class="fila">
      <a class="nom" href="${link}" target="_blank" rel="noopener">${EMOJI[d.subcat] || "🍴"} ${esc(d.comercio)}</a>
      <div class="pct"><span class="hasta">hasta</span><span class="num">${d.pct}%</span></div>
    </div>
    <div class="meta">
      <span class="badge">📅 ${dias_label(d.dias)}</span>
      ${ultimo ? '<span class="badge ultimo">⏳ último día</span>' : ""}
      ${extra ? " · " + extra : ""}
      · <a href="${link}" target="_blank" rel="noopener">Ver →</a>
    </div>
  </div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function init() {
  document.getElementById("cta-form").href = FORM_URL;
  document.getElementById("cta-form-2").href = FORM_URL;
  document.getElementById("buscar").addEventListener("input", e => {
    state.q = e.target.value; render();
  });
  try {
    const r = await fetch("data.json", { cache: "no-cache" });
    const j = await r.json();
    state.data = j.descuentos || [];
    const gen = new Date(j.generado);
    document.getElementById("generado").textContent =
      "Datos actualizados el " + gen.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
  } catch (e) {
    document.getElementById("hero-sub").textContent = "No se pudieron cargar las ofertas 😕";
    return;
  }
  render();
}

init();
