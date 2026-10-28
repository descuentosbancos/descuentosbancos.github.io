/* Descuentos en comida · Santiago — lógica del sitio.
   Lee data.json (exportado por el repo de datos) y renderiza con los mismos
   criterios del correo: día seleccionado, vigencia (fecha Santiago), top por %. */

// `pin`: el color de marca oscurecido lo justo para que el % en BLANCO se lea
// dentro del pin. El verde y el naranjo crudos daban ~2.5:1 sobre blanco.
const BANCOS = [
  { id: "falabella", nombre: "CMR Falabella", color: "#2DB94C", pin: "#1B7A34", url: "https://bancofalabella.cl/descuentos" },
  { id: "chile", nombre: "Banco de Chile", color: "#003087", pin: "#003087", url: "https://www.bancochile.cl/personas/beneficios" },
  { id: "bci", nombre: "BCI",            color: "#0033A0", pin: "#0033A0", url: "https://www.bci.cl/personas/beneficios" },
  { id: "santander", nombre: "Santander",      color: "#EC0000", pin: "#BF0000", url: "https://banco.santander.cl/personas/beneficios" },
  { id: "itau", nombre: "Itaú",           color: "#EC7000", pin: "#A85000", url: "https://www.itau.cl/personas/beneficios" },
  { id: "bice", nombre: "BICE",           color: "#004B8D", pin: "#004B8D", url: "https://www.bice.cl/personas/beneficios" },
  // Rojo más oscuro que Santander para distinguirlos en chips y pines.
  { id: "scotiabank", nombre: "Scotiabank", color: "#B4122B", pin: "#9A0F25", url: "https://www.scotiarewards.cl/scclubfront/categoria/platosycomida/rutagourmet" },
  { id: "ripley", nombre: "Banco Ripley", color: "#5F2C82", pin: "#5F2C82", url: "https://www.bancoripley.cl/beneficios-y-promociones" },
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

// Mapa principal (oct-2026): estilo vectorial de OpenFreeMap (gratis, sin
// key ni límite), parecido a Google Maps: calles por jerarquía, parques,
// íconos de lugares. Se dibuja con MapLibre DENTRO de Leaflet
// (maplibre-gl-leaflet), así pines, grupos y ubicación siguen igual. Las
// librerías (~250 KB) se cargan recién al abrir el mapa. Si algo falla (sin
// WebGL, CDN caído, no carga en VECTOR_TIMEOUT ms) queda Esri, el de antes.
const VECTOR = {
  claro: "https://tiles.openfreemap.org/styles/liberty",
  oscuro: "https://tiles.openfreemap.org/styles/dark",
  attr: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  libs: [
    ["css", "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css",
     "sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V"],
    ["js", "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
     "sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj"],
    ["js", "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js",
     "sha384-4CB9Vtol9LN6lGgBCvmPLbUEZwilrqIvPieSRurgAXAB7FVJaLS9n8WyAIA5wjQ+"],
  ],
};
const VECTOR_TIMEOUT = 8000;

// Mapa principal (28-oct-2026): Google Maps de verdad, como biteclub.cl.
// Proyecto "descuentosbancos" en Google Cloud (cuenta de Diego). La key es
// pública por diseño (va en el navegador): la protege su restricción a
// https://descuentosbancos.cl/* (y la .github.io de antes) y a Maps JavaScript API. Tope duro en
// Google Cloud: 300 cargas de mapa al día (~9.000/mes, dentro del tramo
// gratis de 10.000); pasado eso Google no entrega el mapa y se cae a
// OpenFreeMap, luego a Esri. Se dibuja con GoogleMutant DENTRO de Leaflet,
// así pines, grupos y ubicación siguen igual. Cada apertura del mapa = 1
// carga facturable: el script se pide recién al abrir el mapa.
const GOOGLE = {
  key: "AIzaSyB6srONcRglIKiyTTIYCqiPnYW7ZKigpUk",
  lib: ["js", "https://unpkg.com/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js",
        "sha384-NVeApJLhFaaKalRqZ2xBNeRECGMKMkF5VMTDJtXWk2g0Tq+5Jo1N7CZjhL3gQSFW"],
  claro: [],
  // Variante "noche" de la documentación de Google, más apagada.
  oscuro: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#9aa3ad" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c9b28a" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#a8957a" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#a8957a" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  ],
};

// Fotos: las publica el banco y algunas pesan 800 KB (PNG de BCI). Pasan por
// wsrv.nl (proxy de imágenes libre y gratis): recorta a 16:9, WebP, ~30 KB.
// Algunos bancos (BICE) solo publican el LOGO del local: ese va entero sobre
// blanco (recortado a 16:9 quedaba ilegible), no como foto.
const esLogo = url => /logo/i.test(url.split("?")[0].split("/").pop());
// Tipo de comida (lo calcula tipos.py del lado de los datos) con su nombre
// en la fila de categorías y 3 fotos genéricas para los locales cuyo banco
// no publica foto (o solo publica el logo). Fotos de Unsplash (licencia
// libre, se enlazan desde su CDN); van marcadas "Foto referencial".
const U = id => `https://images.unsplash.com/photo-${id}?w=640&h=360&fit=crop&auto=format&q=70`;
const TIPOS = {
  pizza:    { nombre: "Pizza", ico: "🍕", fotos: ["1513104890138-7c749659a591", "1565299624946-b28f40a0ae38", "1604382354936-07c5d9983bd3"] },
  asiatica: { nombre: "Sushi y asiática", ico: "🍣", fotos: ["1579584425555-c3ce17fd4351", "1579871494447-9811cf80d66c", "1553621042-f6e147245754"] },
  rapida:   { nombre: "Hamburguesas y rápida", ico: "🍔", fotos: ["1568901346375-23c9450c58cd", "1586190848861-99aa4a171e90", "1572802419224-296b0aeee0d9"] },
  carnes:   { nombre: "Carnes y parrilla", ico: "🥩", fotos: ["1508615263227-c5d58c1e5821", "1614119068601-483274e9dcb7", "1546964124-0cce460f38ef"] },
  cafe:     { nombre: "Café y dulces", ico: "☕", fotos: ["1515823662972-da6a2e4d3002", "1467189386127-c4e5e31ee213", "1591538001662-0d5a25234305"] },
  mexicana: { nombre: "Mexicana", ico: "🌮", fotos: ["1599974579688-8dbdd335c77f", "1565299585323-38d6b0865b47", "1551504734-5ee1c4a1479b"] },
  peruana:  { nombre: "Peruana", ico: "🍋", fotos: ["1535399831218-d5bd36d1a6b3", "1731570225640-7ddad4231679", "1664992915025-e5e4bbd67fe1"] },
  italiana: { nombre: "Italiana", ico: "🍝", fotos: ["1621996346565-e3dbc646d9a9", "1611270629569-8b357cb88da9", "1608897013039-887f21d8c804"] },
  mariscos: { nombre: "Pescados y mariscos", ico: "🦐", fotos: ["1571167366136-b57e07761625", "1578935149228-66b184c83e69", "1618055301293-494ab4c71f9f"] },
  bar:      { nombre: "Bar", ico: "🍸", fotos: ["1566417713940-fe7c737a9ef2", "1572116469696-31de0f17cc34", "1568644396922-5c3bfae12521"] },
  restaurante: { nombre: "Restaurante", ico: "🍽️", fotos: ["1574966739987-65e38db0f7ce", "1565895405140-6b9830a88c19", "1593515463811-63535505f44a"] },
};
const tipoDe = d => (TIPOS[d.tipo] ? d.tipo : "restaurante");
const claveFav = d => `${d.banco}|${d.comercio}`;
// Siempre la misma de las 3 para un local (no cambia al recargar).
function fotoGenerica(d) {
  const fs = TIPOS[tipoDe(d)].fotos;
  let h = 0;
  for (const c of d.comercio) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return U(fs[h % fs.length]);
}
// Días que le quedan a la oferta (0 = hoy es el último); null sin vigencia.
function diasRestantes(d) {
  if (!d.vigencia) return null;
  return Math.round((Date.parse(d.vigencia) - Date.parse(hoyISOSantiago())) / 864e5);
}

// Si el proxy falla (itaubeneficios.cl le responde 403 a wsrv), se intenta
// una vez la imagen original del banco antes de dejar la tarjeta sin foto.
function sinFoto(img, quitar) {
  if (img.dataset.orig) {
    img.src = img.dataset.orig;
    img.dataset.orig = "";
  } else if (img.dataset.gen) {
    // Ni el proxy ni el banco: foto genérica de su tipo, marcada como tal.
    img.src = img.dataset.gen;
    img.dataset.gen = "";
    img.parentNode.classList.add("generica");
  } else quitar();
}
const logoChico = url => "https://wsrv.nl/?url=" + encodeURIComponent(url) +
  "&w=200&h=200&fit=contain&cbg=ffffff&output=webp&q=80";
const foto = url => "https://wsrv.nl/?url=" + encodeURIComponent(url) +
  (esLogo(url) ? "&w=640&h=360&fit=contain&cbg=ffffff&output=webp&q=80"
               : "&w=640&h=360&fit=cover&a=attention&output=webp&q=72");
const temaOscuro = () => matchMedia("(prefers-color-scheme: dark)").matches;
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScfOH3mzOrMN5hBaX74k2IFxHrfxanplOuyTMGKnz-a6hTYDA/viewform";
// Envío directo al mismo Google Form (sin salir de la página). Los dos campos
// son obligatorios en el Form; sin nombre se manda la parte antes de la @.
// La planilla de respuestas la lee import_form.py (repo de datos) cada hora
// y manda la bienvenida.
const FORM_POST = FORM_URL.replace("/viewform", "/formResponse");
const ENTRY = { nombre: "entry.1934786758", correo: "entry.1216821569" };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes",
                   "sábado", "domingo"];
const EMOJI = { delivery: "🍕", restaurante: "🍽️", cafe: "☕", supermercado: "🛒" };
// Por banco se muestran hasta 5 filas de tarjetas (5 columnas en escritorio:
// 25; en celular, una columna: 5) y el resto tras "Ver las N".
const FILAS_POR_BANCO = 5;
function columnas() {
  const g = document.querySelector("#resultado .grid");
  // Grilla oculta (vista mapa): no hay medidas en px; se supone 5.
  const n = g ? getComputedStyle(g).gridTemplateColumns.split(" ").filter(x => /px$/.test(x)).length : 0;
  return n || 5;
}

// Casi todo es restaurante: repetir 🍽️ en cada tarjeta era ruido. El emoji
// solo aparece cuando dice algo (café, delivery, súper).
function sub(d) {
  return d.subcat && d.subcat !== "restaurante" && EMOJI[d.subcat]
    ? `<span class="sub" aria-hidden="true">${EMOJI[d.subcat]}</span>` : "";
}

// Íconos de trazo (mismo lenguaje que los de la barra en index.html).
const ICO = {
  dia: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  lugar: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  tope: '<circle cx="12" cy="12" r="9"/><path d="M15 9.3c-.5-.9-1.6-1.5-3-1.5-1.7 0-2.9.8-2.9 2.1s1.2 1.8 2.9 2.1 2.9.9 2.9 2.2-1.2 2.1-2.9 2.1c-1.4 0-2.5-.6-3-1.5M12 6v1.8M12 16.3V18"/>',
  tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  enviar: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z"/>',
  corazon: '<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.9 1.3-1.8 2.8-2.9 4.8-2.9 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>',
  movil: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
};
const ico = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;

const state = {
  dia: diaSantiago(), q: "", bancos: new Set(BANCOS.map(b => b.nombre)),
  data: [], vista: "lista", user: null,
  comunas: new Set(),     // varias a la vez: Providencia + Las Condes
  min: 0,                 // % mínimo: 0, 30 o 40
  modo: "",               // "" | "presencial" | "delivery"
  bancosGuardados: false, // la selección de bancos vino del navegador
  expandidos: new Set(),  // bancos con "ver todas" abierto
  tipo: "",               // categoría de comida ("pizza", "cafe"...); "" = todas
  soloFavs: false,        // mostrar solo los favoritos
  favs: new Set(),        // "banco|comercio" marcados con el corazón
};

// ---------- Preferencias guardadas (localStorage) ----------
// Solo comodidad de quien visita: si el navegador bloquea el almacenamiento
// (modo privado, Safari estricto) el sitio funciona igual, sin recordar.
const GUARDA = { bancos: "db.bancos", comunas: "db.comunas", favs: "db.favs" };
function leerGuardado(k) {
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; }
}
function guardar(k, v) {
  try {
    if (v && v.length) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch (e) { /* sin almacenamiento: no se recuerda */ }
}
// Se guarda SOLO lo que la persona eligió en los chips o en comunas: no un
// link compartido (?b=bice) ni tocar una barra del resumen, que son vistazos.
function guardarBancos() {
  guardar(GUARDA.bancos, state.bancos.size === BANCOS.length ? null
    : BANCOS.filter(b => state.bancos.has(b.nombre)).map(b => b.id));
}
function guardarComunas() { guardar(GUARDA.comunas, [...state.comunas]); }

// ---------- Letra chica: modalidad, tarjeta y canal ----------
// Delivery / apps: el banco lo marca (subcat) o lo dice la condición
// ("solo online", "vía Justo"). "En tótem/app" de Banco de Chile es en el
// local (se pide en el tótem), así que cuenta como presencial.
function esDelivery(d) {
  return d.subcat === "delivery" || /solo online|v[ií]a justo|delivery/i.test(d.condicion || "");
}
const PREMIUM = ["Infinite", "Signature", "Black", "Platinum", "Legend", "Limitless",
                 "Elite", "AMEX", "WorldMember", "Banca Joven"];
function tarjetaExclusiva(d) {
  const c = d.condicion || "";
  const hay = PREMIUM.filter(k => new RegExp("\\b" + k + "\\b", "i").test(c));
  return hay.length ? "Solo " + hay.join("/") : "";
}
// Restricción horaria que el repo de datos agrega a la condición ("de 13:00
// a 23:00", "desde las 19:00", "hasta 16:00"): quien llega a almorzar a un
// descuento que parte a las 19:00 se queda sin él.
function horario(d) {
  const c = d.condicion || "";
  let m = c.match(/de (\d{1,2}:\d{2}) a (\d{1,2}:\d{2})/);
  if (m) return `De ${m[1]} a ${m[2]}`;
  m = c.match(/desde las (\d{1,2}:\d{2})/);
  if (m) return `Desde las ${m[1]}`;
  m = c.match(/hasta (?:las )?(\d{1,2}:\d{2})/);
  if (m) return `Hasta las ${m[1]}`;
  return "";
}
function canal(d) {
  const c = d.condicion || "";
  if (/v[ií]a justo/i.test(c)) return "Pide por Justo";
  if (/solo online/i.test(c)) return "Solo online";
  if (/t[oó]tem\/app/i.test(c)) return "Tótem o app";
  if (/\bQR\b/i.test(c)) return "Pago con QR";
  if (/\bapp\b/i.test(c)) return "Con la app";
  return d.subcat === "delivery" ? "Delivery" : "";
}
// Clave para reconocer el MISMO restaurante en distintos bancos: sin tildes,
// sin mayúsculas ni signos ("Shi Nuá" / "Shi Nua").
function claveLocal(nombre) {
  return norm(nombre).replace(/[^a-z0-9]+/g, " ").trim();
}

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

// "Hoy solo en" si es hoy; "El viernes solo en" si se mira otro día (antes
// decía "Hoy" aunque se estuviera mirando el viernes).
function soloEn() {
  return state.dia === diaSantiago() ? "Hoy solo en:" : `El ${DIA_LARGO[state.dia - 1]} solo en:`;
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

// `todosLosBancos`: mismo filtro pero sin el de banco, para contar en los
// chips cuántas ofertas tendría cada banco con el resto de filtros puestos.
// Minúsculas y sin tildes: "neli" encuentra "Nelí", "cafe" encuentra "Ora
// Café" (23 locales del catálogo llevan tilde; buscarlos sin ella fallaba).
function norm(t) {
  return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function visibles(todosLosBancos = false, sinTipo = false) {
  const hoy = hoyISOSantiago();
  const q = norm(state.q.trim());
  return state.data.filter(d =>
    d.dias.includes(state.dia) &&
    (!d.vigencia || d.vigencia >= hoy) &&
    (todosLosBancos || state.bancos.has(d.banco)) &&
    // Un descuento puede valer en VARIAS comunas (una cadena): basta con que
    // alguna de las elegidas esté entre las suyas.
    (!state.comunas.size || comunasDelDia(d, state.dia).some(c => state.comunas.has(c))) &&
    d.pct >= state.min &&
    (!state.modo || (state.modo === "delivery") === esDelivery(d)) &&
    (sinTipo || !state.tipo || tipoDe(d) === state.tipo) &&
    (!state.soloFavs || state.favs.has(claveFav(d))) &&
    // El buscador también encuentra por comuna ("ñuñoa", "providencia"),
    // con las comunas donde vale ESE día.
    (!q || norm(d.comercio).includes(q) ||
      comunasDelDia(d, state.dia).some(c => norm(c).includes(q)))
  );
}

// ---------- Estado en la URL ----------
// ?d=5&b=santander,itau&c=Providencia&q=sushi&v=mapa — así un filtro se
// puede compartir por WhatsApp y sobrevive a recargar. Solo se escribe lo
// que difiere de lo por defecto, para que la URL limpia siga siendo "/".
// Nombres largos y apodos también sirven en un link armado a mano:
// ?bancos=cmr,chile&comuna=providencia&dia=viernes (los cortos siguen siendo
// b, c y d, que es lo que el sitio escribe).
const APODO_BANCO = { cmr: "falabella", "banco-de-chile": "chile", "banco-chile": "chile",
                      edwards: "chile", scotia: "scotiabank", itau: "itau" };
function diaDeParam(v) {
  if (!v) return 0;
  if (norm(v) === "hoy") return diaSantiago();
  const n = parseInt(v, 10);
  if (n >= 1 && n <= 7) return n;
  // "sábados", "domingos" también valen; "viernes" o "lunes" ya terminan en s.
  const i = DIA_LARGO.findIndex(x => norm(x) === norm(v) || norm(x) === norm(v).replace(/s$/, ""));
  return i >= 0 ? i + 1 : 0;
}
function leerURL() {
  const p = new URLSearchParams(location.search);
  const d = diaDeParam(p.get("d") || p.get("dia"));
  if (d) state.dia = d;
  const ids = (p.get("b") || p.get("bancos") || "").split(",").map(x => norm(x.trim()))
    .filter(Boolean).map(x => APODO_BANCO[x] || x);
  const elegidos = BANCOS.filter(b => ids.includes(b.id)).map(b => b.nombre);
  if (elegidos.length) state.bancos = new Set(elegidos);
  // render() descarta las comunas que no aplican el día elegido.
  // La comuna se compara sin tildes ni mayúsculas ("nunoa" = "Ñuñoa"); render()
  // la ajusta al nombre exacto y descarta las que no aplican ese día.
  const cParam = p.get("c") || p.get("comuna");
  if (cParam) {
    const todas = [...new Set(state.data.flatMap(x => x.comunas || []))];
    state.comunas = new Set(cParam.split(",").map(x => x.trim()).filter(Boolean)
      .map(x => todas.find(t => norm(t) === norm(x)) || x));
  }
  if (p.get("q")) state.q = p.get("q");
  if (p.get("v") === "mapa") state.vista = "mapa";
  const min = parseInt(p.get("m"), 10);
  if (min === 30 || min === 40) state.min = min;
  if (["presencial", "delivery"].includes(p.get("t"))) state.modo = p.get("t");
  if (TIPOS[p.get("cat")]) state.tipo = p.get("cat");
  state.favs = new Set(leerGuardado(GUARDA.favs) || []);
  if (p.get("fav") === "1" && state.favs.size) state.soloFavs = true;
  // Lo guardado en el navegador aplica solo si el link no trae ese filtro:
  // un link compartido muestra lo que se quiso compartir.
  if (!elegidos.length) {
    const ids = leerGuardado(GUARDA.bancos);
    const guard = BANCOS.filter(b => (ids || []).includes(b.id)).map(b => b.nombre);
    if (guard.length && guard.length < BANCOS.length) {
      state.bancos = new Set(guard);
      state.bancosGuardados = true;
    }
  }
  if (!cParam) state.comunas = new Set(leerGuardado(GUARDA.comunas) || []);
}
function escribirURL() {
  const p = new URLSearchParams();
  if (state.dia !== diaSantiago()) p.set("d", state.dia);
  if (state.bancos.size < BANCOS.length) {
    p.set("b", BANCOS.filter(b => state.bancos.has(b.nombre)).map(b => b.id).join(","));
  }
  if (state.comunas.size) p.set("c", [...state.comunas].join(","));
  if (state.min) p.set("m", state.min);
  if (state.modo) p.set("t", state.modo);
  if (state.tipo) p.set("cat", state.tipo);
  if (state.soloFavs) p.set("fav", "1");
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.vista === "mapa") p.set("v", "mapa");
  // De dónde vino la visita (?ref=correo, utm_*): se conserva para que las
  // estadísticas lo lean aunque el sitio reescriba la URL con los filtros.
  for (const [k, v] of new URLSearchParams(location.search)) {
    if (k === "ref" || k.startsWith("utm_")) p.set(k, v);
  }
  const qs = p.toString();
  const url = location.pathname + (qs ? "?" + qs : "") + location.hash;
  if (url !== location.pathname + location.search + location.hash) {
    history.replaceState(null, "", url);
  }
}

// Deja el día elegido a la vista dentro de la fila deslizable (en móvil el
// domingo queda fuera de pantalla si llega por URL).
function centrarTabActiva() {
  const tabs = document.getElementById("tabs");
  const a = tabs.querySelector(".tab.activo");
  if (!a || tabs.scrollWidth <= tabs.clientWidth) return;
  tabs.scrollLeft = a.offsetLeft - (tabs.clientWidth - a.offsetWidth) / 2;
}

function render() {
  const hoy = hoyISOSantiago();

  // Comunas del día elegido, con su conteo. Va ANTES de filtrar: si la
  // comuna elegida no tiene ofertas este día (se cambió de día, o llegó por
  // URL) se descarta primero. Antes se descartaba después de filtrar y la
  // lista quedaba vacía con el selector mostrando "Todas las comunas".
  const delDia = state.data.filter(
    d => d.dias.includes(state.dia) && (!d.vigencia || d.vigencia >= hoy));
  const cuenta = {};
  let sinComuna = 0;
  for (const d of delDia) {
    const cs = comunasDelDia(d, state.dia);
    if (!cs.length) sinComuna++;
    for (const c of cs) cuenta[c] = (cuenta[c] || 0) + 1;
  }
  // Las que no tienen ofertas este día ya no aplican (no se borran de lo
  // guardado: el lunes pueden volver a tener).
  for (const c of [...state.comunas]) if (!cuenta[c]) state.comunas.delete(c);

  const items = visibles();

  // Hero: total del día (sin filtros de búsqueda/banco, para que sea estable).
  const totalDia = state.data.filter(d =>
    d.dias.includes(state.dia) && (!d.vigencia || d.vigencia >= hoy)).length;
  const esHoy = state.dia === diaSantiago();
  const diaTxt = esHoy ? "hoy" : `el ${DIA_LARGO[state.dia - 1]}`;
  document.getElementById("hero-cuando").textContent = diaTxt;
  document.getElementById("dest-cuando").textContent = diaTxt;
  document.getElementById("stat-num").textContent = totalDia;
  document.getElementById("stat-lbl").textContent = esHoy
    ? `ofertas activas hoy, ${DIA_LARGO[state.dia - 1]}, en Santiago`
    : `ofertas para el ${DIA_LARGO[state.dia - 1]} en Santiago`;

  // Reparto del día por banco. Tocar una barra deja solo ese banco (igual
  // que su chip desde "todos") y baja al listado.
  const porBanco = BANCOS.map(bco => ({
    bco,
    n: state.data.filter(d => d.banco === bco.nombre && d.dias.includes(state.dia) &&
      (!d.vigencia || d.vigencia >= hoy)).length,
  }));
  const maxN = Math.max(1, ...porBanco.map(x => x.n));
  const barras = document.getElementById("stat-barras");
  barras.innerHTML = "";
  for (const { bco, n } of porBanco) {
    const b = document.createElement("button");
    b.className = "barra";
    b.style.setProperty("--bcolor", bco.color);
    b.setAttribute("aria-label", `${bco.nombre}: ${n} ofertas. Ver solo ${bco.nombre}`);
    b.innerHTML = `<span>${esc(bco.nombre)}</span>` +
      `<span class="pista"><i style="width:${(n / maxN * 100).toFixed(1)}%"></i></span>` +
      `<span class="n">${n}</span>`;
    b.onclick = () => {
      state.bancos = new Set([bco.nombre]);
      state.vista = "lista";
      render();
      document.querySelector(".toolbar").scrollIntoView({ behavior: "smooth" });
    };
    barras.appendChild(b);
  }

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
    b.onclick = () => { state.dia = i; render(); centrarTabActiva(); };
    tabs.appendChild(b);
  }

  // Comunas (varias a la vez): se reconstruye en cada render para no ofrecer
  // comunas sin ofertas el día elegido.
  const comunas = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  const nCom = state.comunas.size;
  document.getElementById("comuna-sum-txt").textContent =
    nCom === 0 ? `Todas las comunas` :
    nCom === 1 ? [...state.comunas][0] : `${nCom} comunas`;
  document.getElementById("comuna-dd").classList.toggle("activo", nCom > 0);
  document.getElementById("comuna-lista").innerHTML = comunas.map(c =>
    `<label class="dd-op"><input type="checkbox" value="${esc(c)}"` +
    `${state.comunas.has(c) ? " checked" : ""}><span>${esc(c)}</span>` +
    `<span class="n">${cuenta[c]}</span></label>`).join("");
  document.getElementById("comuna-limpiar").hidden = !nCom;
  // No se puede afirmar la comuna de todos: se DICE, en vez de esconderlos.
  const aviso = document.getElementById("comuna-aviso");
  aviso.hidden = !(nCom && sinComuna);
  if (!aviso.hidden) {
    aviso.textContent = `${sinComuna} oferta(s) sin comuna conocida no se ` +
      `muestran con este filtro.`;
  }

  // Filtros rápidos: % mínimo y modalidad (un toque activa, otro desactiva).
  for (const b of document.querySelectorAll("#rapidos .rapido")) {
    const on = b.dataset.min ? state.min === +b.dataset.min : state.modo === b.dataset.modo;
    b.classList.toggle("activo", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // Tipo de comida: una fila deslizable con cuántas hay de cada uno (con los
  // demás filtros puestos). Uno a la vez; tocar el activo vuelve a "Todo".
  // "Mis favoritos" aparece primero cuando hay alguno guardado.
  const sinTipo = visibles(false, true);
  const porTipo = {};
  for (const d of sinTipo) porTipo[tipoDe(d)] = (porTipo[tipoDe(d)] || 0) + 1;
  if (state.tipo && !porTipo[state.tipo]) state.tipo = "";
  const nFavs = state.data.filter(d => state.favs.has(claveFav(d)) && d.dias.includes(state.dia)).length;
  const cats = document.getElementById("cats");
  cats.innerHTML =
    (state.favs.size ? `<button type="button" class="cat cat-fav${state.soloFavs ? " activo" : ""}" data-fav="1"
      aria-pressed="${state.soloFavs}">${ico("corazon")}Mis favoritos <span class="n">${nFavs}</span></button>` : "") +
    `<button type="button" class="cat${!state.tipo ? " activo" : ""}" data-tipo="" aria-pressed="${!state.tipo}">Todo</button>` +
    Object.entries(TIPOS).filter(([k]) => porTipo[k] && k !== "restaurante")
      .map(([k, t]) => `<button type="button" class="cat${state.tipo === k ? " activo" : ""}" data-tipo="${k}"
        aria-pressed="${state.tipo === k}"><span aria-hidden="true">${t.ico}</span>${t.nombre} <span class="n">${porTipo[k]}</span></button>`)
      .join("");

  // Entrada al mapa desde la lista, con cuántos locales tienen ubicación.
  const conGeoN = items.filter(d => typeof d.lat === "number").length;
  const mp = document.getElementById("mapa-preview");
  mp.hidden = state.vista === "mapa" || !conGeoN;
  document.getElementById("mapa-preview-n").textContent =
    `${conGeoN} ${conGeoN === 1 ? "local" : "locales"} con ubicación · encuentra el más cercano`;

  // "Mostrando tus bancos guardados": la selección vino del navegador, se
  // dice (si no, alguien cree que el sitio tiene solo esos bancos).
  const avisoB = document.getElementById("bancos-aviso");
  avisoB.hidden = !(state.bancosGuardados && state.bancos.size < BANCOS.length);

  // Chips de banco, con cuántas ofertas tendría cada uno con los demás filtros.
  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  const sinFiltroBanco = visibles(true);
  for (const bco of BANCOS) {
    const c = document.createElement("button");
    const on = state.bancos.has(bco.nombre);
    const nChip = sinFiltroBanco.filter(d => d.banco === bco.nombre).length;
    c.className = "chip" + (on ? " activo" : " apagado") + (nChip ? "" : " cero");
    c.style.setProperty("--chipcolor", bco.color);
    c.innerHTML = `${esc(bco.nombre)} <span class="n">${nChip}</span>`;
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
      guardarBancos();
      state.bancosGuardados = state.bancos.size < BANCOS.length;
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
  document.getElementById("destacados").innerHTML = top.map((d, i) => {
    const bco = BANCOS.find(b => b.nombre === d.banco);
    return `<a class="dest" style="--bcolor:${bco.color}" href="${esc(d.url || bco.url)}" target="_blank" rel="noopener">
      <div class="dest-pct"><small>hasta</small><b>${d.pct}</b><span>%</span></div>
      <div class="dest-txt">
        <div class="nom">${sub(d)}${esc(d.comercio)}</div>
        <div class="bco">${esc(d.banco)}</div>
      </div>
      <span class="rank" aria-hidden="true">${i + 1}</span>
    </a>`;
  }).join("");

  // El mismo restaurante con otros bancos ESE día (comparativa en la ficha).
  // Se cuenta sobre todo lo vigente del día, no solo lo filtrado: quien tiene
  // BICE quiere saber si con otro banco le sale mejor. Sucursales distintas
  // con el mismo nombre (comunas que no se tocan) no se mezclan.
  const porLocal = {};
  for (const d of delDia) (porLocal[claveLocal(d.comercio)] ||= []).push(d);
  state.otros = d => {
    const cs = comunasDelDia(d, state.dia);
    const vistos = new Set([d.banco]);
    return (porLocal[claveLocal(d.comercio)] || [])
      .filter(o => {
        if (vistos.has(o.banco)) return false;
        const co = comunasDelDia(o, state.dia);
        if (cs.length && co.length && !co.some(c => cs.includes(c))) return false;
        vistos.add(o.banco);
        return true;
      })
      .sort((a, b) => b.pct - a.pct);
  };

  // Listado por banco
  const res = document.getElementById("resultado");
  // Columnas que tiene hoy la grilla (antes de borrarla); la primera vez no
  // hay grilla y se supone 5, y se corrige al final si eran otras.
  const cols = columnas();
  const maxPorBanco = cols * FILAS_POR_BANCO;
  res.innerHTML = "";
  let alguno = false;
  for (const bco of BANCOS) {
    const todas = items.filter(d => d.banco === bco.nombre).sort((a, b) => b.pct - a.pct);
    if (!todas.length) continue;
    alguno = true;
    const total = todas.length;
    const abierto = state.expandidos.has(bco.nombre);
    const del = abierto ? todas : todas.slice(0, maxPorBanco);
    const sec = document.createElement("section");
    sec.className = "banco-sec";
    sec.id = "banco-" + bco.nombre.toLowerCase().replace(/[^a-z]+/g, "-");
    sec.style.setProperty("--bcolor", bco.color);
    sec.innerHTML = `
      <div class="banco-head">
        <h2 class="nom">${esc(bco.nombre)}</h2>
        <span class="cnt">${total > del.length ? `${del.length} de ${total}` : del.length}
          ${total === 1 ? "oferta" : "ofertas"}</span>
        <a class="ver-mas" href="${esc(bco.url)}" target="_blank" rel="noopener">Ver en el banco →</a>
      </div>
      <div class="grid">
        ${del.map(d => card(d, bco)).join("")}
      </div>
      ${total > maxPorBanco
        ? `<button class="mas">${abierto ? "Ver menos" : `Ver las ${total} de ${esc(bco.nombre)}`}</button>`
        : ""}`;
    const mas = sec.querySelector(".mas");
    if (mas) mas.onclick = () => {
      if (abierto) state.expandidos.delete(bco.nombre);
      else state.expandidos.add(bco.nombre);
      render();
      if (abierto) document.getElementById(sec.id).scrollIntoView({ block: "start" });
    };
    res.appendChild(sec);
  }
  if (!alguno) {
    const filtrando = state.q || state.comunas.size || state.min || state.modo ||
      state.tipo || state.soloFavs ||
      state.bancos.size < BANCOS.length;
    res.innerHTML = `<div class="vacio">
      ${filtrando
        ? `<p class="vacio-tit">Nada con esos filtros</p>
           <p>Prueba <b>otro día</b>, otras comunas, quita el % mínimo, borra la búsqueda o vuelve a activar todos los bancos.</p>
           <button class="mas" id="limpiar">Limpiar filtros</button>`
        : `<p class="vacio-tit">Sin ofertas el ${DIA_LARGO[state.dia - 1]}</p>
           <p>Prueba otro día de la semana.</p>`}
    </div>`;
    const limpiar = document.getElementById("limpiar");
    if (limpiar) limpiar.onclick = () => {
      state.q = ""; state.comunas.clear(); state.min = 0; state.modo = "";
      state.tipo = ""; state.soloFavs = false;
      state.bancos = new Set(BANCOS.map(b => b.nombre));
      guardarBancos(); guardarComunas(); state.bancosGuardados = false;
      document.getElementById("buscar").value = "";
      render();
    };
  }

  // Alternar vista lista/mapa.
  const enMapa = state.vista === "mapa";
  document.getElementById("mapa-vista").hidden = !enMapa;
  document.getElementById("destacados-sec").hidden = enMapa || top.length < 2;
  document.getElementById("resultado").hidden = enMapa;
  document.getElementById("como-funciona").hidden = enMapa;
  for (const [id, on] of [["ver-lista", !enMapa], ["ver-mapa", enMapa]]) {
    const b = document.getElementById(id);
    b.classList.toggle("activo", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  // Ya visible la lista: si la grilla tiene otras columnas que las supuestas,
  // se rearma con el tope correcto (5 filas).
  if (!enMapa && alguno && columnas() !== cols) return render();
  if (enMapa) renderMapa(items);
  escribirURL();
}

function distancia(a, b) { // metros (haversine)
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function fmtDist(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }

let TILELAYER = null, TILELAYER_REF = null, VECTORLAYER = null, GMAP = null, FIRMA_VISTA = null;

function crearMapa() {
  // maxZoom en el mapa (no solo en la capa de fondo): markercluster lo exige
  // y el fondo ahora llega después, cuando cargan sus librerías.
  MAPA = L.map("mapa", { scrollWheelZoom: true, zoomControl: false, maxZoom: 18 })
    .setView([-33.45, -70.66], 12);
  L.control.zoom({ position: "bottomright" }).addTo(MAPA);
  CAPA = crearCapaMarcadores();
  fondoGoogle()
    .then(ok => ok || fondoVectorial())
    .then(ok => { if (!ok) fondoEsri(); });

  // Si el visitante cambia el tema del sistema con el mapa abierto.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const tema = temaOscuro() ? "oscuro" : "claro";
    if (GMAP) GMAP.setOptions({ styles: GOOGLE[tema] });
    if (VECTORLAYER) VECTORLAYER.getMaplibreMap().setStyle(VECTOR[tema]);
    if (TILELAYER) TILELAYER.setUrl(TILES[tema].base);
    if (TILELAYER_REF) TILELAYER_REF.setUrl(TILES[tema].ref);
  });
}

// Respaldo: Esri en dos capas superpuestas, el relleno/calles (Base) abajo y
// las etiquetas de calle/comuna (Reference, PNG transparente) arriba.
function fondoEsri() {
  const t = TILES[temaOscuro() ? "oscuro" : "claro"];
  const opts = { attribution: TILES_ATTR, maxZoom: 18, maxNativeZoom: 15 };
  TILELAYER = L.tileLayer(t.base, opts).addTo(MAPA);
  TILELAYER_REF = L.tileLayer(t.ref, opts).addTo(MAPA);
}

function cargarLib([tipo, url, sri]) {
  return new Promise((ok, mal) => {
    const el = document.createElement(tipo === "css" ? "link" : "script");
    if (tipo === "css") { el.rel = "stylesheet"; el.href = url; } else el.src = url;
    el.integrity = sri; el.crossOrigin = "anonymous";
    el.onload = ok; el.onerror = mal;
    document.head.appendChild(el);
  });
}

// Script de Google: no admite SRI (lo sirve dinámico). Resuelve con
// google.maps listo; rechaza si el script no carga.
function cargarGoogle() {
  return new Promise((ok, mal) => {
    window.__gmListo = ok;
    const el = document.createElement("script");
    el.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE.key}` +
             "&loading=async&callback=__gmListo&language=es&region=CL";
    el.async = true; el.onerror = mal;
    document.head.appendChild(el);
  });
}

// true si quedó Google; false para probar OpenFreeMap. "Quedó" = llegó al
// menos un tile a Leaflet: con la cuota del día agotada o la key rechazada,
// Google pinta su aviso de error en vez de tiles y nunca llega ninguno.
async function fondoGoogle() {
  let capa = null;
  try {
    // gm_authFailure: la key no autenticó (referrer no permitido,
    // facturación). Google lo llama cuando quiera, antes o después de cargar.
    const falla = new Promise(ok => { window.gm_authFailure = () => ok(false); });
    if (await Promise.race([cargarGoogle().then(() => true), falla]) === false) throw new Error("key rechazada");
    await cargarLib(GOOGLE.lib);
    if (!L.gridLayer.googleMutant) return false;
    capa = L.gridLayer.googleMutant({
      type: "roadmap", maxZoom: 18, styles: GOOGLE[temaOscuro() ? "oscuro" : "claro"],
    });
    capa.on("spawned", e => { GMAP = e.mapObject; });
    const listo = new Promise(ok => {
      capa.once("tileload", () => ok(true));
      setTimeout(() => ok(false), VECTOR_TIMEOUT);
    });
    capa.addTo(MAPA);
    if (await Promise.race([listo, falla])) return true;
  } catch (e) {
    console.warn("Google Maps no disponible; se usa OpenFreeMap.", e);
  }
  if (capa) MAPA.removeLayer(capa);
  GMAP = null;
  return false;
}

// true si quedó el mapa vectorial; false para usar Esri.
async function fondoVectorial() {
  try {
    for (const lib of VECTOR.libs) await cargarLib(lib);
    if (!L.maplibreGL) return false;
    const capa = L.maplibreGL({
      style: VECTOR[temaOscuro() ? "oscuro" : "claro"], attribution: VECTOR.attr,
    });
    // El mapa de MapLibre existe recién al agregar la capa. Se espera a que
    // llegue su ESTILO (red), no a "load": "load" necesita pintar y una
    // pestaña en segundo plano no pinta -caería a Esri sin razón. Si el
    // estilo no llega en VECTOR_TIMEOUT (CDN caído, red mala), Esri.
    const listo = new Promise(ok => {
      const esperar = () => {
        const gl = capa.getMaplibreMap?.();
        if (!gl) return setTimeout(esperar, 50);
        if (gl.isStyleLoaded()) ok(true); else gl.once("style.load", () => ok(true));
      };
      esperar();
      setTimeout(() => ok(false), VECTOR_TIMEOUT);
    });
    capa.addTo(MAPA);
    if (await listo) { VECTORLAYER = capa; return true; }
    MAPA.removeLayer(capa);
  } catch (e) {
    console.warn("Mapa vectorial no disponible; se usa Esri.", e);
  }
  return false;
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
    `usa tu ubicación para ver el más cercano`;

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
    ? `<div class="pop-locales"><b>${soloEn()}</b> ${locs.map(nombreLocal).join(" · ")}</div>`
    : "";
  const ruta = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
  const ver = d.url
    ? `<a class="pl-primario" style="background:${bco.pin}" href="${esc(d.url)}" target="_blank" rel="noopener">Ver oferta →</a>`
    : "";
  return `<div class="pop">
    ${d.img ? `<img class="pop-foto" src="${esc(foto(d.img))}" alt="" width="640" height="360"
      referrerpolicy="no-referrer" data-orig="${esc(d.img)}" onerror="sinFoto(this, () => this.remove())">` : ""}
    <div class="pop-top">
      <div class="pop-pct" style="color:${bco.pin}">${d.pct}<i>%</i></div>
      <div>
        <div class="pop-nom">${sub(d)}${esc(d.comercio)}</div>
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
  const quedan = diasRestantes(d);
  const ultimo = quedan === 0;
  // Termina dentro de esta semana (pero no hoy: ese es "Último día").
  const ultimaSemana = quedan !== null && quedan >= 1 && quedan <= 6;
  const tope = fmtTope(d);
  const link = esc(d.url || bco.url);
  const locs = localesDelDia(d, state.dia);
  const cs = comunasDelDia(d, state.dia);
  // Foto del banco arriba, con el % como etiqueta encima. Sin foto (o si el
  // banco solo publica el logo) va una genérica de su tipo de comida,
  // marcada "Foto referencial", con el logo encima si lo hay. Si nada carga,
  // la tarjeta vuelve a ser la de siempre (el % sigue en la fila).
  const real = d.img && !esLogo(d.img);
  const logo = d.img && esLogo(d.img);
  const fav = state.favs.has(claveFav(d));
  const img = `<div class="foto${real ? "" : " generica"}">
      <img src="${esc(real ? foto(d.img) : fotoGenerica(d))}" alt="" loading="lazy" decoding="async"
        width="640" height="360" referrerpolicy="no-referrer"
        data-orig="${real ? esc(d.img) : ""}" data-gen="${real ? esc(fotoGenerica(d)) : ""}"
        onerror="sinFoto(this, () => {this.closest('.cardo').classList.remove('con-foto');this.parentNode.remove()})">
      ${logo ? `<span class="logo-local"><img src="${esc(logoChico(d.img))}" alt="" loading="lazy"
        referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : ""}
      <span class="etq"><span class="hasta">hasta</span>${d.pct}<i>%</i></span>
    </div>`;
  return `<article class="cardo con-foto" style="--bcolor:${bco.color}">
    ${img}
    <button class="fav${fav ? " on" : ""}" type="button" data-fav="${esc(claveFav(d))}"
      aria-pressed="${fav}" aria-label="${fav ? "Quitar de" : "Guardar en"} favoritos: ${esc(d.comercio)}"
      title="${fav ? "Quitar de favoritos" : "Guardar en favoritos"}">${ico("corazon")}</button>
    <div class="fila">
      <a class="nom" href="${link}" target="_blank" rel="noopener">${sub(d)}${esc(d.comercio)}</a>
      <div class="pct"><span class="hasta">hasta</span><span class="num">${d.pct}<i>%</i></span></div>
    </div>
    <div class="meta">
      ${ultimo ? `<span class="dato ultimo">${ico("reloj")}Último día</span>` : ""}
      ${ultimaSemana ? `<span class="dato ultimo semana">${ico("reloj")}Última semana</span>` : ""}
      ${d.dias_confirmados === false ? "" :
        `<span class="dato">${ico("dia")}${dias_label(d.dias)}</span>`}
      ${cs.length
        ? `<span class="dato">${ico("lugar")}${cs.slice(0, 2).map(esc).join(" · ")}` +
          `${cs.length > 2 ? ` +${cs.length - 2}` : ""}</span>`
        : ""}
    </div>
    ${letraChica(d, tope)}
    ${d.condicion ? `<div class="cond">${ico("tarjeta")}${esc(d.condicion)}</div>` : ""}
    ${comparativa(d)}
    ${locs.length && variaPorLocal(d, state.dia)
      ? `<div class="locales"><b>${soloEn()}</b> ${locs.map(nombreLocal).join(" · ")}</div>`
      : ""}
    <button class="enviar" type="button" data-banco="${esc(bco.id)}" data-comercio="${esc(d.comercio)}"
      title="Compartir por WhatsApp" aria-label="Compartir ${esc(d.comercio)} por WhatsApp">${ico("enviar")}</button>
  </article>`;
}

// Badges de letra chica: lo que cambia lo que la persona recibe, a la vista.
// Solo si el dato existe; nunca se supone.
function letraChica(d, tope) {
  const b = [];
  const h = horario(d);
  if (h) b.push(`<span class="lc lc-hora">${ico("reloj")}${esc(h)}</span>`);
  if (tope) b.push(`<span class="lc lc-tope">${ico("tope")}${esc(tope[0].toUpperCase() + tope.slice(1))}</span>`);
  const t = tarjetaExclusiva(d);
  if (t) b.push(`<span class="lc lc-tarjeta">${ico("tarjeta")}${esc(t)}</span>`);
  const c = canal(d);
  if (c) b.push(`<span class="lc lc-canal">${ico("movil")}${esc(c)}</span>`);
  return b.length ? `<div class="letra">${b.join("")}</div>` : "";
}

// "También hoy con: Scotiabank 50% · BICE 40%". Si otro banco da más, se
// destaca: es lo primero que quiere saber quien tiene varias tarjetas.
function comparativa(d) {
  const otros = state.otros ? state.otros(d) : [];
  if (!otros.length) return "";
  const mejor = otros[0].pct > d.pct ? otros[0] : null;
  return `<div class="compara">${mejor
      ? `<b>Más con ${esc(mejor.banco)}: ${mejor.pct}%</b>`
      : "<b>También hoy:</b>"} ${otros.filter(o => o !== mejor)
      .map(o => `${esc(o.banco)} ${o.pct}%`).join(" · ")}</div>`;
}

// Evento para las estadísticas (GoatCounter). Si el script no cargó o lo
// bloquea un adblock, no pasa nada.
function evento(nombre) {
  try { window.goatcounter?.count?.({ path: nombre, title: nombre, event: true }); } catch (e) { /* sin estadísticas */ }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function init() {
  // Suscripción sin salir de la página. Con mode "no-cors" Google no deja
  // leer la respuesta: si el envío no lanza error se da por hecho (y si la
  // red falla, se ofrece el Form de siempre).
  for (const f of document.querySelectorAll(".sub-form")) {
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const correo = f.correo.value.trim().toLowerCase();
      const msg = f.querySelector(".sub-msg");
      msg.hidden = false; msg.className = "sub-msg";
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(correo)) {
        msg.textContent = "Revisa tu correo: parece incompleto.";
        msg.classList.add("error"); f.correo.focus();
        return;
      }
      const nombre = f.nombre.value.trim() || correo.split("@")[0];
      const btn = f.querySelector("button");
      btn.disabled = true;
      try {
        await fetch(FORM_POST, {
          method: "POST", mode: "no-cors",
          body: new URLSearchParams({ [ENTRY.correo]: correo, [ENTRY.nombre]: nombre }),
        });
        f.classList.add("listo");
        evento("suscripcion-" + (f.dataset.origen || "web"));
        msg.innerHTML = `<b>¡Listo, ${esc(nombre)}!</b> En un rato te llega la bienvenida y desde ` +
          `mañana el resumen a las 10:05. Si cae en Promociones, muévelo a Principal.`;
      } catch (err) {
        msg.innerHTML = `No pudimos enviarlo. <a href="${FORM_URL}" target="_blank" rel="noopener">Suscríbete acá</a>.`;
        msg.classList.add("error");
        btn.disabled = false;
      }
    });
  }
  // Compartir: el menú nativo del teléfono (WhatsApp, Instagram...) y, si no
  // existe (computador), WhatsApp Web. Comparte la URL con los filtros
  // puestos, así llega "Santander el viernes" y no la portada.
  // Clic a la ficha del banco: la oferta le interesó a alguien.
  document.addEventListener("click", e => {
    const a = e.target.closest("a.nom, a.dest, .pl-primario");
    if (a) evento("ver-oferta");
  });
  document.getElementById("compartir").onclick = async () => {
    evento("compartir-sitio");
    const url = location.href;
    const texto = "Mira dónde comer con descuento hoy en Santiago 🍽️";
    if (navigator.share) {
      try { await navigator.share({ title: document.title, text: texto, url }); } catch (e) { /* cancelado */ }
    } else {
      window.open("https://wa.me/?text=" + encodeURIComponent(texto + " " + url), "_blank", "noopener");
    }
  };
  // Compartir UNA oferta ("¿almorzamos acá?"): el link lleva al sitio con esa
  // oferta ya filtrada (banco + nombre + día), no a la ficha del banco, para
  // que quien lo recibe también llegue acá.
  document.getElementById("resultado").addEventListener("click", async e => {
    const btn = e.target.closest(".enviar");
    if (!btn) return;
    const d = state.data.find(x => x.comercio === btn.dataset.comercio &&
      BANCOS.find(b => b.nombre === x.banco)?.id === btn.dataset.banco);
    if (!d) return;
    const p = new URLSearchParams({ b: btn.dataset.banco, q: d.comercio });
    if (state.dia !== diaSantiago()) p.set("d", state.dia);
    const url = location.origin + location.pathname + "?" + p;
    // WhatsApp directo: es por donde se arma el almuerzo. El mensaje dice el
    // día, la comuna y el banco, que es lo que quien lo recibe necesita.
    const cuando = state.dia === diaSantiago() ? "Hoy" : `El ${DIA_LARGO[state.dia - 1]}`;
    const cs = comunasDelDia(d, state.dia);
    const donde = cs.length ? ` (${cs.slice(0, 2).join(", ")})` : "";
    const texto = `¡Oye! ${cuando} hay ${d.pct}% de dcto en ${d.comercio}${donde} pagando con ` +
      `${d.banco}. Mira los detalles acá: ${url}`;
    evento("whatsapp-oferta");
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  });
  // Favoritos: el corazón de la tarjeta. Se guardan en el navegador (sin
  // cuenta); la fila de categorías ofrece "Mis favoritos" cuando hay alguno.
  document.getElementById("resultado").addEventListener("click", e => {
    const btn = e.target.closest(".fav");
    if (!btn) return;
    const k = btn.dataset.fav;
    if (state.favs.has(k)) state.favs.delete(k); else { state.favs.add(k); evento("favorito"); }
    guardar(GUARDA.favs, [...state.favs]);
    if (!state.favs.size) state.soloFavs = false;
    render();
  });
  document.getElementById("cats").addEventListener("click", e => {
    const b = e.target.closest(".cat");
    if (!b) return;
    if (b.dataset.fav) state.soloFavs = !state.soloFavs;
    else { state.tipo = state.tipo === b.dataset.tipo ? "" : b.dataset.tipo; if (state.tipo) evento("categoria-" + state.tipo); }
    render();
  });
  document.getElementById("mapa-preview").addEventListener("click", () => {
    state.vista = "mapa";
    evento("mapa-preview");
    render();
    document.getElementById("mapa-vista").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const buscar = document.getElementById("buscar");
  buscar.addEventListener("input", e => {
    state.q = e.target.value; render();
  });
  // "/" enfoca el buscador (como en GitHub o YouTube); Esc lo limpia.
  document.addEventListener("keydown", e => {
    const escribiendo = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !escribiendo && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      buscar.focus();
    } else if (e.key === "Escape" && document.activeElement === buscar && buscar.value) {
      buscar.value = ""; state.q = ""; render();
    }
  });
  // Volver arriba: la lista de 6 bancos es larga en el teléfono.
  const arriba = document.getElementById("arriba");
  arriba.onclick = () => scrollTo({ top: 0, behavior: "smooth" });
  addEventListener("scroll", () => {
    arriba.hidden = scrollY < 1400 || state.vista === "mapa";
  }, { passive: true });
  // Comunas: desplegable con casillas. Cierra al tocar fuera o con Esc.
  const dd = document.getElementById("comuna-dd");
  document.getElementById("comuna-lista").addEventListener("change", e => {
    if (!e.target.matches("input[type=checkbox]")) return;
    if (e.target.checked) state.comunas.add(e.target.value);
    else state.comunas.delete(e.target.value);
    guardarComunas(); render();
  });
  document.getElementById("comuna-limpiar").onclick = () => {
    state.comunas.clear(); guardarComunas(); render();
  };
  document.addEventListener("click", e => { if (dd.open && !dd.contains(e.target)) dd.open = false; });
  dd.addEventListener("keydown", e => { if (e.key === "Escape") { dd.open = false; dd.querySelector("summary").focus(); } });
  // Filtros rápidos.
  document.getElementById("rapidos").addEventListener("click", e => {
    const b = e.target.closest(".rapido");
    if (!b) return;
    if (b.dataset.min) state.min = state.min === +b.dataset.min ? 0 : +b.dataset.min;
    else state.modo = state.modo === b.dataset.modo ? "" : b.dataset.modo;
    render();
  });
  document.getElementById("bancos-todos").onclick = () => {
    state.bancos = new Set(BANCOS.map(b => b.nombre));
    state.bancosGuardados = false;
    guardarBancos(); render();
  };
  document.getElementById("ver-lista").onclick = () => { state.vista = "lista"; render(); };
  document.getElementById("ver-mapa").onclick = () => { state.vista = "mapa"; render(); };
  document.getElementById("btn-ubicacion").onclick = ubicar;
  try {
    const r = await fetch("data.json", { cache: "no-cache" });
    const j = await r.json();
    state.data = j.descuentos || [];
    const gen = new Date(j.generado);
    const fecha = gen.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
    document.getElementById("generado").textContent = "Datos actualizados el " + fecha;
    document.getElementById("stat-fecha").textContent =
      `Datos de los bancos al ${fecha} · se actualiza solo`;
  } catch (e) {
    document.getElementById("stat-lbl").textContent = "No se pudieron cargar las ofertas 😕";
    return;
  }
  leerURL();
  buscar.value = state.q;
  render();
  centrarTabActiva();
  // Al cambiar el ancho cambian las columnas, y con ellas cuántas caben en 5 filas.
  let colsPrevias = columnas();
  addEventListener("resize", () => {
    const c = columnas();
    if (c !== colsPrevias) { colsPrevias = c; render(); }
  });
}

init();
