<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# WAV Intelligence v2

Herramienta para **administrar y guiar** el ciclo completo de un estudio de
investigación, desde el brief del cliente hasta la entrega.

La unidad que avanza es el **estudio**; las sesiones viven dentro de él. El proceso
(etapas y tareas) es **dato instanciado desde una plantilla**, no un enum en el
código. El pipeline de medios y el análisis con IA son una etapa del camino, no el
centro del producto.

Reconstrucción limpia de `wav-intelligence` (ese repo es **solo referencia de
lectura**: no se copia código de ahí; si algo de allá parece útil, se re-decide y se
reescribe).

**Stack:** Next.js 16 · React 19 · Supabase · Tailwind v4 · Vitest · Trigger.dev · Cloudflare R2

## Lee esto antes de escribir código

| Documento | Qué contiene |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Las decisiones de diseño y **por qué**. Fuente de verdad arquitectónica. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases, entregables y estado actual. Fuente de verdad del avance. |

Si una decisión de arquitectura cambia, se edita `ARCHITECTURE.md` en el mismo commit.

## Infraestructura

| Recurso | Valor |
|---|---|
| Supabase | `lrnaiwilairvvnqlyxdq` · us-east-1 · org WAV |
| R2 | pendiente (F1) |

Las migraciones se nombran `YYYYMMDDHHMMSS_slug.sql`, no `001`, `002`. Con timestamps
dos ramas en paralelo no pueden colisionar en el mismo número — que es exactamente lo
que pasó en el repo anterior.

Después de todo DDL, correr los advisors de Supabase (seguridad y rendimiento) y
dejar el resultado limpio antes de commitear.

## Reglas duras

- **Módulos por dominio.** Un feature (`src/features/<x>/`) nunca importa el interior de
  otro — solo su `index.ts`. Es la regla que evita repetir la deuda del repo anterior.
- **Zod en todo borde:** input de API, artifacts JSON, y variables de entorno al arrancar.
- **Nada de strings literales de copy en componentes.** Diccionario por feature.
- **Tokens semánticos de Tailwind.** Sin `zinc-*` ni colores crudos en componentes.
- **TDD donde hay lógica** (pipeline, scoring, RLS, validación). No en presentación pura.
- **`git add <paths>` explícito.** Nunca `git add .` ni `git commit -a`.
- **Migraciones numeradas por una sola mano**, asignadas antes de paralelizar trabajo.

## Comandos

```bash
npm run dev          # http://localhost:3000
npm test             # suite completa
npm run test:watch   # durante desarrollo
npm run typecheck    # tsc --noEmit
npm run lint
npm run format
```

Antes de cada commit: `npm run typecheck && npm test`.

El smoke necesita el dev server corriendo y un Chromium de Playwright
(`npx playwright install chromium` la primera vez). Cubre el guard de sesión, el
login y las vistas con datos de prueba; el camino con datos vivos —crear
estudio, adjuntar, avanzar etapa— se prueba a mano contra Supabase.

## Convenciones

- Commits convencionales: `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`
- Tests en `tests/unit/` y `tests/integration/`, espejando la ruta de `src/`
- UI en español (es-CL); sin fugas de claves de i18n a la pantalla
- `CLAUDE.md` es un puntero a este archivo; edita este
- **Mantén este archivo corto.** Describe reglas, no inventario de código — el
  inventario se lee del código, y un archivo de 900 líneas nadie lo respeta.
