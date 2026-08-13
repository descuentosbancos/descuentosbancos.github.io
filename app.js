/* Descuentos en comida · Santiago — lógica del sitio.
   Lee data.json (exportado por el repo de datos) y renderiza con los mismos
   criterios del correo: día seleccionado, vigencia (fecha Santiago), top por %. */

// `pin`: el color de marca oscurecido lo justo para que el % en BLANCO se lea
// dentro del pin. El verde y el naranjo crudos daban ~2.5:1 sobre blanco.
const BANCOS = [
  { nombre: "CMR Falabella", color: "#2DB94C", pin: "#1B7A34", url: "https://bancofalabella.cl/descuentos" },
  { nombre: "Banco de Chile", color: "#003087", pin: "#003087", url: "https://www.bancochile.cl/personas/beneficios" },
  { nombre: "BCI",            color: "#0033A0", pin: "#0033A0", url: "https://www.bci.cl/personas/beneficios" },
  { nombre: "Santander",      color: "#EC0000", pin: "#BF0000", url: "https://banco.santander.cl/personas/beneficios" },
  { nombre: "Itaú",           color: "#EC7000", pin: "#A85000", url: "https://www.itau.cl/personas/beneficios" },
  { nombre: "BICE",           color: "#004B8D", pin: "#004B8D", url: "https://www.bice.cl/personas/beneficios" },
];

// Base del mapa: CARTO en vez de OpenStreetMap crudo. El OSM estándar mete
// escudos de ruta, relieve y carreteras de colores que tapaban los pines; estas
// están diseñadas como FONDO, y hay variante oscura para el tema oscuro.
const TILES = {
  claro: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  oscuro: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const TILES_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                   '&copy; <a href="https://carto.com/attributions">CARTO</a>';
const temaOscuro = () => matchMedia("(prefers-color-scheme: dark)").matches;
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScfOH3mzOrMN5hBaX74k2IFxHrfxanplOuyTMGKnz-a6hTYDA/viewform";
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes",
                   "sábado", "domingo"];
const EMOJI = { delivery: "🍕", restaurante: "🍽️", cafe: "☕", supermercado: "🛒" };
const MAX_POR_BANCO = 24; // la web tiene más espacio que el correo

const state = {
  dia: diaSantiago(), q: "", bancos: new Set(BANCOS.map(b => b.nombre)),
  data: [], vista: "lista", user: null,
};
let MAPA = null, CAPA = null, USERMARK = null; // Leaflet lazy

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
  const cuando = esHoy ? "activas hoy" : `para el ${DIA_LARGO[state.dia - 1]}`;
  document.getElementById("hero-sub").innerHTML =
    `<b>${totalDia}</b> ofertas ${cuando} en Santiago`;

  // Tabs
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const n = state.data.filter(d => d.dias.includes(i) && (!d.vigencia || d.vigencia >= hoy)).length;
    const b = document.createElement("button");
    const activo = i === state.dia;
    b.className = "tab" + (activo ? " activo" : "");
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    b.innerHTML = `${i === diaSantiago() ? '<span class="hoy-dot"></span>' : ""}` +
      `${DIAS[i - 1]} <span class="n">${n}</span>`;
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
    c.setAttribute("aria-pressed", on ? "true" : "false");
    c.onclick = () => {
      const todos = state.bancos.size === BANCOS.length;
      if (todos) {
        // Desde "todos", tocar un banco lo AÍSLA. Antes lo apagaba, que es lo
        // contrario de lo que espera quien toca el logo de su banco.
        state.bancos = new Set([bco.nombre]);
      } else if (on && state.bancos.size === 1) {
        state.bancos = new Set(BANCOS.map(b => b.nombre));  // volver a todos
      } else if (on) {
        state.bancos.delete(bco.nombre);
      } else {
        state.bancos.add(bco.nombre);
      }
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
      <div class="dest-pct">
        <span class="hasta">hasta</span>
        <div class="pct">${d.pct}%</div>
      </div>
      <div class="dest-txt">
        <div class="nom">${EMOJI[d.subcat] || "🍴"} ${esc(d.comercio)}</div>
        <div class="bco">${esc(d.banco)}</div>
      </div>
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
    const total = items.filter(d => d.banco === bco.nombre).length;
    const sec = document.createElement("section");
    sec.className = "banco-sec";
    sec.style.setProperty("--bcolor", bco.color);
    sec.innerHTML = `
      <div class="banco-head">
        <span class="punto"></span>
        <span class="nom">${esc(bco.nombre)}</span>
        <span class="cnt">${total > del.length ? `${del.length} de ${total}` : del.length}
          ${total === 1 ? "oferta" : "ofertas"}</span>
        <a class="ver-mas" href="${esc(bco.url)}" target="_blank" rel="noopener">Ver en el banco →</a>
      </div>
      <div class="grid">
        ${del.map(d => card(d, bco)).join("")}
      </div>`;
    res.appendChild(sec);
  }
  if (!alguno) {
    const filtrando = state.q || state.bancos.size < BANCOS.length;
    res.innerHTML = `<div class="vacio">
      <span class="emoji">🍽️</span>
      ${filtrando
        ? `Nada con esos filtros. Prueba <b>otro día</b>, borra la búsqueda o vuelve a activar todos los bancos.`
        : `No hay ofertas para el <b>${DIA_LARGO[state.dia - 1]}</b>. Prueba otro día.`}
    </div>`;
  }

  // Alternar vista lista/mapa.
  const enMapa = state.vista === "mapa";
  document.getElementById("mapa-vista").hidden = !enMapa;
  document.getElementById("destacados-sec").hidden = enMapa || top.length < 2;
  document.getElementById("resultado").hidden = enMapa;
  document.getElementById("como-funciona").hidden = enMapa;
  document.getElementById("ver-lista").classList.toggle("activo", !enMapa);
  document.getElementById("ver-mapa").classList.toggle("activo", enMapa);
  if (enMapa) renderMapa(items);
}

function distancia(a, b) { // metros (haversine)
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtDist(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }

let TILELAYER = null, FIRMA_VISTA = null;

function crearMapa() {
  MAPA = L.map("mapa", { scrollWheelZoom: true, zoomControl: false })
    .setView([-33.45, -70.66], 12);
  L.control.zoom({ position: "bottomright" }).addTo(MAPA);
  TILELAYER = L.tileLayer(TILES[temaOscuro() ? "oscuro" : "claro"], {
    attribution: TILES_ATTR, maxZoom: 19,
  }).addTo(MAPA);

  // Sin agrupar, media docena de pines quedaban encimados e ilegibles en
  // Providencia/Las Condes. Al acercar, el grupo se abre solo.
  CAPA = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 46,
    spiderfyDistanceMultiplier: 1.4,
    iconCreateFunction: grupo => {
      const hijos = grupo.getAllChildMarkers();
      const max = Math.max(...hijos.map(m => m.options.pct || 0));
      return L.divIcon({
        className: "",
        iconSize: [42, 42], iconAnchor: [21, 21],
        html: `<div class="cluster-pin"><b>${hijos.length}</b>` +
              `<span>${max}%</span></div>`,
      });
    },
  }).addTo(MAPA);

  // Si el visitante cambia el tema del sistema con el mapa abierto.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (TILELAYER) TILELAYER.setUrl(TILES[temaOscuro() ? "oscuro" : "claro"]);
  });
}

function renderMapa(items) {
  if (!MAPA) crearMapa();
  setTimeout(() => MAPA.invalidateSize(), 50); // por el hidden previo

  const conGeo = items.filter(d => typeof d.lat === "number");
  CAPA.clearLayers();
  const marcadores = [], bounds = [];
  // Los de mayor % se agregan al final para que queden ENCIMA al solaparse.
  for (const d of [...conGeo].sort((a, b) => a.pct - b.pct)) {
    const bco = BANCOS.find(b => b.nombre === d.banco) || { color: "#333", pin: "#333" };
    const icon = L.divIcon({
      className: "", iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<div class="pin-num" style="--pincolor:${bco.pin}">${d.pct}<i>%</i></div>`,
    });
    marcadores.push(L.marker([d.lat, d.lng], { icon, pct: d.pct })
      .bindPopup(popup(d, bco), { closeButton: true, maxWidth: 260 }));
    bounds.push([d.lat, d.lng]);
  }
  CAPA.addLayers(marcadores);
  if (USERMARK) USERMARK.addTo(MAPA);

  const total = items.length, info = document.getElementById("mapa-info");
  if (state.user) marcarCercano(conGeo);
  else info.innerHTML = `<b>${conGeo.length}</b> de ${total} con ubicación · ` +
    `toca 📍 para ver el más cercano`;

  // Reencuadrar SOLO si cambió el conjunto de locales: antes se reencuadraba
  // en cada render y el mapa saltaba con cada tecla del buscador.
  const firma = bounds.map(b => b.join()).sort().join("|");
  if (bounds.length && !state.user && firma !== FIRMA_VISTA) {
    MAPA.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
  FIRMA_VISTA = firma;
}

function popup(d, bco) {
  const badges = [dias_label(d.dias), fmtTope(d), d.condicion]
    .filter(Boolean)
    .map(t => `<span class="pb">${esc(t)}</span>`).join("");
  const ruta = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
  const ver = d.url
    ? `<a class="pl-primario" style="background:${bco.pin}" href="${esc(d.url)}" target="_blank" rel="noopener">Ver oferta →</a>`
    : "";
  return `<div class="pop">
    <div class="pop-top">
      <div class="pop-pct" style="color:${bco.pin}">${d.pct}<i>%</i></div>
      <div>
        <div class="pop-nom">${EMOJI[d.subcat] || "🍴"} ${esc(d.comercio)}</div>
        <div class="pop-bco" style="color:${bco.pin}">${esc(d.banco)}</div>
      </div>
    </div>
    ${badges ? `<div class="pop-badges">${badges}</div>` : ""}
    <div class="pop-links">${ver}<a class="pl-ruta" href="${ruta}" target="_blank" rel="noopener">🧭 Cómo llegar</a></div>
  </div>`;
}

function marcarCercano(conGeo) {
  const info = document.getElementById("mapa-info");
  if (!conGeo.length) { info.textContent = "No hay locales con ubicación para este filtro."; return; }
  let mejor = null, dmin = Infinity;
  for (const d of conGeo) {
    const dist = distancia(state.user, d);
    if (dist < dmin) { dmin = dist; mejor = d; }
  }
  info.innerHTML = `📍 Más cerca: <b>${esc(mejor.comercio)}</b> (${mejor.pct}%, a ${fmtDist(dmin)})`;
  MAPA.fitBounds([[state.user.lat, state.user.lng], [mejor.lat, mejor.lng]],
    { padding: [60, 60], maxZoom: 16 });
}

function ubicar() {
  const info = document.getElementById("mapa-info");
  if (!navigator.geolocation) { info.textContent = "Tu navegador no permite ubicación."; return; }
  info.textContent = "Obteniendo tu ubicación…";
  navigator.geolocation.getCurrentPosition(pos => {
    state.user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (USERMARK) MAPA.removeLayer(USERMARK);
    USERMARK = L.circleMarker([state.user.lat, state.user.lng], {
      radius: 9, color: "#1a73e8", fillColor: "#1a73e8", fillOpacity: .9, weight: 3,
    }).addTo(MAPA).bindPopup("Estás aquí");
    render();
  }, () => { info.textContent = "No pudimos obtener tu ubicación (revisa los permisos)."; },
    { enableHighAccuracy: true, timeout: 10000 });
}

function card(d, bco) {
  const hoy = hoyISOSantiago();
  const ultimo = d.vigencia && d.vigencia === hoy;
  const tope = fmtTope(d);
  const link = esc(d.url || bco.url);
  return `<div class="cardo" style="--bcolor:${bco.color}">
    <div class="fila">
      <a class="nom" href="${link}" target="_blank" rel="noopener">${EMOJI[d.subcat] || "🍴"} ${esc(d.comercio)}</a>
      <div class="pct"><span class="hasta">hasta</span><span class="num">${d.pct}%</span></div>
    </div>
    <div class="meta">
      <span class="badge">📅 ${dias_label(d.dias)}</span>
      ${ultimo ? '<span class="badge ultimo">⏳ último día</span>' : ""}
      ${tope ? `<span class="badge">${esc(tope)}</span>` : ""}
      ${d.condicion ? `<span class="badge cond">${esc(d.condicion)}</span>` : ""}
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
  document.getElementById("ver-lista").onclick = () => { state.vista = "lista"; render(); };
  document.getElementById("ver-mapa").onclick = () => { state.vista = "mapa"; render(); };
  document.getElementById("btn-ubicacion").onclick = ubicar;
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
