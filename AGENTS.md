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
| R2 | configurado en `.env.local` (las cuatro `R2_*`); el bucket no se nombra acá porque este repo es público |

Las migraciones se nombran `YYYYMMDDHHMMSS_slug.sql`, no `001`, `002`. Con timestamps
dos ramas en paralelo no pueden colisionar en el mismo número — que es exactamente lo
que pasó en el repo anterior.

Después de todo DDL, correr los advisors de Supabase (seguridad y rendimiento) y
dejar el resultado limpio antes de commitear.

### Credenciales

Este repo es **público**. Ninguna credencial entra en un archivo trackeado: viven
solo en `.env.local`, que está en `.gitignore`. `npm run check:env` valida el
archivo antes de arrancar.

Tres cosas que costaron una tarde entera y no se vuelven a descubrir:

1. **El proyecto de Supabase es `lrnaiwilairvvnqlyxdq`.** El repo anterior
   (`wav-intelligence`) apunta a otro proyecto. Si la app dice *Invalid API key*
   o *Invalid login credentials*, lo primero es comparar el `ref` de la URL con el
   `ref` que trae la clave — no cambiar la contraseña del usuario.
2. **El dashboard de Supabase muestra la clave enmascarada.** Lo que se ve en
   pantalla trae `•` (U+2022) en el medio; seleccionarla con el mouse copia los
   bullets. Un `•` en un header HTTP hace que WebKit tire *"The string did not
   match the expected pattern"* y que Node tire *"Cannot convert argument to a
   ByteString"*. **Solo el botón de copiar del dashboard entrega la clave real.**
   `check:env` ya caza este caso y avisa en qué línea está el bullet.
3. **Una credencial no viaja por un chat con un agente.** Lo que se pega en un
   chat con Claude (o cualquier asistente remoto) puede llegar enmascarado del
   otro lado, y lo que el agente escriba de vuelta llega enmascarado acá. La
   clave la pone una persona en `.env.local`, o un agente que corra **en la
   misma máquina** que el archivo. Un agente remoto nunca puede verificar que la
   clave que leyó es la clave que existe.

Corolario operativo: cuando algo de auth falla, el orden de diagnóstico es
`ref` de la URL → `ref` de la clave → largo de la clave → sesión → datos. Nunca
empieza por la contraseña. La app de escritorio implementa exactamente ese orden
en su botón *Probar conexión*.

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

## Nota para wav-ingest

`wav-ingest` (app de escritorio) depende por default de `http://localhost:3000`
para hablar con **wav-intelligence v1**, no con este repo. Si se deja el dev
server de v2 corriendo en `:3000` mientras se prueba WAV Ingest, la app lo
detecta como backend equivocado y bloquea con un aviso — no es un bug, es el
comportamiento esperado (ver `wav-ingest/AGENTS.md` y
`wav-ingest/docs/superpowers/specs/2026-09-15-backend-health-design.md`).
