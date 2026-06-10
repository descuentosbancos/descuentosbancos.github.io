# descuentosbancos.github.io

Sitio estático de **DescuentosBancos** — descuentos en comida · Santiago (GitHub Pages).

- `index.html` + `app.css` + `app.js`: página única que renderiza `data.json`
  con pestañas por día, buscador y filtro por banco. El filtro de vigencia
  (ocultar vencidos) lo aplica el JS con la fecha de Santiago.
- `data.json`: catálogo generado automáticamente por el repo privado
  `descuentos-daily` (workflow de scraping, lunes y día 1 de cada mes).
  **No editar a mano** — se sobreescribe.

Este repo no contiene datos personales: solo el catálogo público de descuentos.
