# WAV Intelligence v2

Herramienta para administrar y guiar el ciclo completo de un estudio de
investigación: brief → diseño → convocatoria → logística → ejecución →
procesamiento → análisis → entrega → cierre.

La app sabe en qué etapa va cada estudio, qué falta para cerrarla y qué está
atrasado. La transcripción y el análisis con IA son una etapa del camino, no el
producto.

Reconstrucción limpia de `wav-intelligence`.

## Arranque

```bash
npm install
cp .env.example .env.local   # y completar los valores
npm run dev
```

→ http://localhost:3000

### Una sola vez por bucket de R2

El navegador sube el material directo a R2 con una URL prefirmada, así que el
bucket tiene que aceptar ese origen. Sin esto la subida falla en el navegador
aunque la firma sea correcta:

```bash
node scripts/r2-cors.mjs           # ver la política actual
node scripts/r2-cors.mjs --apply   # escribirla
```

Por defecto habilita `localhost:3000` y `:3001`. Para otros orígenes:
`R2_CORS_ORIGINS=https://…  node scripts/r2-cors.mjs --apply`.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md) — decisiones de diseño y su justificación
- [Roadmap](docs/ROADMAP.md) — fases, entregables y estado

## Estado

`F0 · Fundación` casi cerrada · `F1 · El estudio y su proceso` es lo siguiente.
