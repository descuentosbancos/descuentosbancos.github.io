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

// Base del mapa: Esri Canvas (gris neutro) en vez de OpenStreetMap crudo. El
// OSM estándar mete escudos de ruta, relieve y carreteras de colores que
// tapaban los pines; este fondo está diseñado para eso, con variante oscura.
//
// Antes era CARTO (basemaps.cartocdn.com), pero dejó de servir tiles gratis
// sin cuenta: el tile que llegaba traía literalmente el texto "API KEY
// REQUIRED" incrustado en la imagen (sep-2026). Esri Canvas es el
// reemplazo directo -mismo estilo visual, sin cuenta ni clave- pero viene en
// DOS capas que hay que superponer: "Base" (el relleno/calles) y
// "Reference" (las etiquetas, PNG transparente), a diferencia de CARTO que
// las traía juntas en un solo tile.
//
// OJO con el orden de la URL: Esri usa {z}/{y}/{x}, NO {z}/{x}/{y} como la
// mayoría de los servicios XYZ (CARTO, OSM). Cambiarlo por error deja el
// mapa mostrando el tile equivocado en cada posición.
//
// maxNativeZoom en 15: pasado ese nivel Esri devuelve un tile con el texto
// "Map data not yet available" para esta región en vez de fallar limpio.
// Leaflet resuelve el acercamiento extra escalando el último tile real -se
// ve borroso, pero nunca ese texto.
const TILES = {
  claro: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
  oscuro: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
};
const TILES_ATTR = '&copy; <a href="https://www.esri.com">Esri</a>';
const temaOscuro = () => matchMedia("(prefers-color-scheme: dark)").matches;
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScfOH3mzOrMN5hBaX74k2IFxHrfxanplOuyTMGKnz-a6hTYDA/viewform";
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes",
                   "sábado", "domingo"];
const EMOJI = { delivery: "🍕", restaurante: "🍽️", cafe: "☕", supermercado: "🛒" };
const MAX_POR_BANCO = 24; // la web tiene más espacio que el correo

const state = {
  dia: diaSantiago(), q: "", bancos: new Set(BANCOS.map(b => b.nombre)),
  data: [], vista: "lista", user: null, comuna: "",
};

// Locales del descuento donde vale el día elegido. [] si el banco no publica
// días por local (el caso normal: un solo local, y `dias` ya es específico).
function localesDelDia(d, dia) {
  if (!d.locales || !d.locales.length) return [];
  return d.locales.filter(l => l.d.includes(dia));
}
// True si el beneficio NO vale hoy en todos sus locales: hay que decir en
// cuáles sí, porque "todos los días" mandaría a la persona al local errado.
function variaPorLocal(d, dia) {
  if (!d.locales || !d.locales.length) return false;
  return localesDelDia(d, dia).length < d.locales.length;
}
// Comunas donde el descuento vale ESE día. Si el banco publica días por
// local, las comunas dependen del día: Fuente Suiza vale en La Reina y
// Cerrillos de lunes a miércoles, pero el viernes SOLO en Las Condes (Open
// Kennedy desde las 19). Usar la lista completa lo mostraba al filtrar por
// una comuna donde ese día no aplica.
function comunasDelDia(d, dia) {
  if (!d.locales || !d.locales.length) return d.comunas || [];
  const cs = localesDelDia(d, dia).map(l => l.c).filter(Boolean);
  return [...new Set(cs)].sort();
}

// "Mallplaza Egaña (La Reina)". La comuna solo va si consta en la tabla
// curada del repo de datos: no se adivina.
function nombreLocal(l) {
  return esc(l.n) + (l.c ? ` <span class="loc-comuna">(${esc(l.c)})</span>` : "");
}
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
    // Un descuento puede valer en VARIAS comunas (una cadena): basta con que
    // la elegida esté entre las suyas.
    (!state.comuna || comunasDelDia(d, state.dia).includes(state.comuna)) &&
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

  // Comunas del día elegido, con su conteo. Se reconstruye en cada render
  // para no ofrecer comunas sin ofertas hoy.
  const sel = document.getElementById("comuna");
  const delDia = state.data.filter(
    d => d.dias.includes(state.dia) && (!d.vigencia || d.vigencia >= hoy));
  const cuenta = {};
  let sinComuna = 0;
  for (const d of delDia) {
    const cs = comunasDelDia(d, state.dia);
    if (!cs.length) sinComuna++;
    for (const c of cs) cuenta[c] = (cuenta[c] || 0) + 1;
  }
  const comunas = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  if (state.comuna && !cuenta[state.comuna]) state.comuna = "";  // ya no aplica
  sel.innerHTML =
    `<option value="">📍 Todas las comunas (${delDia.length})</option>` +
    comunas.map(c =>
      `<option value="${esc(c)}"${c === state.comuna ? " selected" : ""}>` +
      `${esc(c)} (${cuenta[c]})</option>`).join("");
  // No se puede afirmar la comuna de todos: se DICE, en vez de esconderlos.
  const aviso = document.getElementById("comuna-aviso");
  aviso.hidden = !(state.comuna && sinComuna);
  if (!aviso.hidden) {
    aviso.textContent = `${sinComuna} oferta(s) sin comuna conocida no se ` +
      `muestran con este filtro.`;
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

let TILELAYER = null, TILELAYER_REF = null, FIRMA_VISTA = null;

function crearMapa() {
  MAPA = L.map("mapa", { scrollWheelZoom: true, zoomControl: false })
    .setView([-33.45, -70.66], 12);
  L.control.zoom({ position: "bottomright" }).addTo(MAPA);
  const t = TILES[temaOscuro() ? "oscuro" : "claro"];
  const opts = { attribution: TILES_ATTR, maxZoom: 18, maxNativeZoom: 15 };
  // Dos capas superpuestas: el relleno/calles (Base) abajo, las etiquetas
  // de calle/comuna (Reference, PNG transparente) arriba.
  TILELAYER = L.tileLayer(t.base, opts).addTo(MAPA);
  TILELAYER_REF = L.tileLayer(t.ref, opts).addTo(MAPA);

  CAPA = crearCapaMarcadores();

  // Si el visitante cambia el tema del sistema con el mapa abierto.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const t = TILES[temaOscuro() ? "oscuro" : "claro"];
    if (TILELAYER) TILELAYER.setUrl(t.base);
    if (TILELAYER_REF) TILELAYER_REF.setUrl(t.ref);
  });
}

function crearCapaMarcadores() {
  // Degradar si el plugin no está: al desplegar, un visitante puede quedar con
  // el index.html viejo en caché (sin el <script> del plugin) y el app.js
  // nuevo. Sin esto, esa mezcla lanza "L.markerClusterGroup is not a function"
  // y el mapa no se dibuja. Sin agrupar es peor, pero roto es mucho peor.
  if (typeof L.markerClusterGroup !== "function") {
    console.warn("markercluster no disponible: mapa sin agrupación.");
    return L.layerGroup().addTo(MAPA);
  }

  // Sin agrupar, media docena de pines quedaban encimados e ilegibles en
  // Providencia/Las Condes. Al acercar, el grupo se abre solo.
  return L.markerClusterGroup({
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
  // addLayers es del plugin; L.layerGroup (el respaldo) solo tiene addLayer.
  if (CAPA.addLayers) CAPA.addLayers(marcadores);
  else marcadores.forEach(m => CAPA.addLayer(m));
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
  const locs = localesDelDia(d, state.dia);
  // dias_confirmados=false: la ficha no dijo ningún día, "dias" es un
  // supuesto -no se muestra como si fuera un hecho (mismo criterio del correo).
  const badges = [d.dias_confirmados === false ? null : dias_label(d.dias),
                  fmtTope(d), d.condicion]
    .filter(Boolean)
    .map(t => `<span class="pb">${esc(t)}</span>`).join("");
  const porLocal = locs.length && variaPorLocal(d, state.dia)
    ? `<div class="pop-locales"><b>Hoy solo en:</b> ${locs.map(nombreLocal).join(" · ")}</div>`
    : "";
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
    ${porLocal}
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
  const locs = localesDelDia(d, state.dia);
  return `<div class="cardo" style="--bcolor:${bco.color}">
    <div class="fila">
      <a class="nom" href="${link}" target="_blank" rel="noopener">${EMOJI[d.subcat] || "🍴"} ${esc(d.comercio)}</a>
      <div class="pct"><span class="hasta">hasta</span><span class="num">${d.pct}%</span></div>
    </div>
    <div class="meta">
      ${d.dias_confirmados === false ? "" :
        `<span class="badge">📅 ${dias_label(d.dias)}</span>`}
      ${ultimo ? '<span class="badge ultimo">⏳ último día</span>' : ""}
      ${(() => {
        const cs = comunasDelDia(d, state.dia);
        return cs.length
          ? `<span class="badge">📍 ${cs.slice(0, 2).map(esc).join(" · ")}` +
            `${cs.length > 2 ? ` +${cs.length - 2}` : ""}</span>`
          : "";
      })()}
      ${tope ? `<span class="badge">${esc(tope)}</span>` : ""}
      ${d.condicion ? `<span class="badge cond">${esc(d.condicion)}</span>` : ""}
    </div>
    ${locs.length && variaPorLocal(d, state.dia)
      ? `<div class="locales"><b>Hoy solo en:</b> ${locs.map(nombreLocal).join(" · ")}</div>`
      : ""}
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
  document.getElementById("comuna").addEventListener("change", e => {
    state.comuna = e.target.value; render();
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
