# Arquitectura — WAV Intelligence v2

Reconstrucción limpia de WAV Intelligence. El repo `wav-intelligence` queda intacto
como referencia de lectura; nada de su código se hereda.

**Estado de este documento:** las decisiones marcadas `Aceptada` ya están confirmadas.
Las marcadas `Propuesta` esperan revisión de Federico antes de construir features encima.

---

## Mapa mental

Piensa el sistema como una **planta de tres pisos** con un ascensor de carga al costado:

```
┌──────────────────────────────────────────────────────────────┐
│  PISO 3 — Consumo      dashboard · player · research · chat  │
│                        entregables (PDF/PPTX/clips)          │
├──────────────────────────────────────────────────────────────┤
│  PISO 2 — Conocimiento verbatims · topics · sentimiento      │
│                        insights · barreras · planes          │
├──────────────────────────────────────────────────────────────┤
│  PISO 1 — Materia      sesiones · participantes · media      │
│                        artifacts (HLS, transcripciones)      │
└──────────────────────────────────────────────────────────────┘
        ▲
        │  ASCENSOR: el pipeline. Sube materia y la convierte
        │  en conocimiento, un piso por vez, y puede parar
        │  en cualquier piso sin rehacer los de abajo.
```

La regla que gobierna todo: **cada piso solo conoce al de abajo**. El player no sabe
cómo se transcribió; el pipeline no sabe que existe un dashboard.

---

## D1 — Repo y alcance · `Aceptada`

Repo nuevo `wav-intelligence-v2`, paralelo al actual. Mismo alcance de producto
end-to-end (ingesta → transcripción → análisis → entregables), arquitectura re-decidida.
Cero código heredado.

**Por qué:** ocho sprints de deuda incremental (≈90 migraciones, features bolted-on)
cuestan más de desenredar que de rehacer, y el producto ya está validado — sabemos
qué construir, que es la parte difícil de un rewrite.

## D2 — Infraestructura nueva · `Aceptada`

Proyecto Supabase nuevo, bucket R2 nuevo.

**Consecuencia a asumir:** no hay datos reales hasta re-ingestar una sesión. El
roadmap trata "re-ingestar un FG real de punta a punta" como criterio de cierre de
la Fase 2, no como algo que se posterga al final.

## D3 — Un solo cliente: sin multi-tenancy · `Aceptada`

WAV Intelligence es un producto para MG Motor. **No hay `tenant_id`, no hay tabla
`tenants`, no hay RLS por tenant.** El branding y la configuración viven como
constantes en el código, no en base de datos.

Se evaluó la alternativa (`tenant_id` + RLS desde la primera migración) y se descartó
por decisión de producto: no está en el plan vender esto a otras marcas.

**Lo que se entrega a cambio**, para que quede escrito:

- No se puede comparar entre cuentas de clientes (ej. "MG contra el promedio de la
  categoría"). Deja de ser un producto posible sin rehacer el schema.
- Un segundo cliente exige un deployment y un Supabase enteros aparte, o pagar la
  migración descrita abajo.

**Costo de revertir, si algún día entra un cliente #2 en el mismo deployment:**
agregar y rellenar `tenant_id` en toda tabla de dominio, reescribir cada policy de RLS
y cada query, y auditar cada endpoint. El riesgo no es que rompa — es que una query
que se pase filtre datos de otro cliente en silencio. Estimado: días, no horas, y con
exposición real de datos si se hace apurado.

**Puerta de salida más barata:** si aparece un segundo cliente, levantar un deployment
propio (silo por cliente) antes que retrofitear tenancy. Mantiene el schema simple y
el aislamiento pasa a ser de infraestructura.

## D4 — Una sola lista de roles, en tabla `profiles` · `Aceptada`

Consecuencia directa de D3: sin tenants no existe la membresía por tenant, así que el
modelo de dos ejes se cae y queda una lista plana.

| Rol | Quién | Puede |
|---|---|---|
| `admin` | Staff de WAV | Todo: sesiones, pipeline, usuarios, configuración |
| `client` | MG Motor | Ver resultados de sesiones listas |
| `moderator` | Moderadores | Solo sus sesiones asignadas |

Es el modelo actual quitándole una sola cosa: el nombre del cliente incrustado en el
identificador (`mg_client` → `client`). No cuesta nada evitarlo hoy y ahorra un rename
incómodo si alguna vez cambia la marca.

**Dónde vive el rol** (esto sí cambia respecto del repo actual): tabla `profiles` 1:1
con `auth.users` como fuente de verdad, espejada al JWT por un *custom access token
hook* de Supabase.

- La tabla lo hace consultable, joinable y auditable — lo actual guarda el rol solo en
  `app_metadata`, y por eso listar usuarios en `/settings/users` obliga a usar el
  service-client, que bypassea RLS.
- El claim en el JWT mantiene las policies baratas: leen un claim en vez de hacer
  subquery por fila.

## D5 — El pipeline es datos, no una función de 10 pasos · `Propuesta`

Tablas `pipeline_runs` y `pipeline_steps`. Cada paso: nombre, estado, clave de
idempotencia, artifacts que consume y produce.

Lo actual tiene un `processSession` que orquesta 10 pasos inline. Funciona, pero
re-correr un solo paso, saltar uno, o resumir después de una falla exige tocar el
orquestador. Con los pasos como filas, todo eso es una query.

**Recomendación:** adoptarlo. Es el cambio con mejor relación esfuerzo/beneficio del
rebuild completo.

## D6 — Local-first como artifacts de primera clase · `Propuesta`

Tabla `artifacts`: `(kind, storage_key, producer: 'local'|'cloud', checksum, bytes)`.

Un paso del pipeline **se salta si y solo si** su artifact de salida ya existe y valida.

Hoy esto vive como null-checks dispersos (`hls_manifest_key` seteado → saltar
transcode; `transcription_artifact_key` seteado → saltar transcribe). Cada nuevo paso
local requiere una columna nueva y un `if` nuevo en el orquestador. Con artifacts,
WAV Ingest simplemente **publica un artifact** y el pipeline se ajusta solo.

La analogía: hoy el pipeline pregunta "¿alguien ya hizo esto?" mirando por la ventana
de cada paso. Con artifacts hay un casillero común — si el paquete está en el
casillero, no lo vuelves a pedir.

## D7 — Runner: Trigger.dev v4 · `Propuesta`

Se mantiene. Maneja jobs largos (ffmpeg, Whisper), reintentos, concurrencia y
extensión Python para pyannote. No hay razón para re-litigar lo que funciona.

Descartadas: Edge Functions (timeout corto, ffmpeg imposible), worker propio
(mantener infra sin beneficio a esta escala).

## D8 — Módulos por dominio, no por tecnología · `Propuesta`

```
src/
  app/                 # routing y nada más — páginas delgadas
  features/
    sessions/          # schema · queries · lógica · componentes
    media/
    transcripts/
    insights/
    deliverables/
    recruiting/        # ex "convocatoria"
    research/
  server/              # clientes supabase · auth · storage · rate-limit · env
  ui/                  # primitivas de diseño (shadcn)
  lib/                 # utilidades genuinamente genéricas
```

**Regla dura:** un feature nunca importa el interior de otro, solo su `index.ts`.

Lo actual agrupa por tecnología (`lib/ai`, `lib/r2`, `lib/mappers`, `lib/schemas`), así
que una feature queda repartida en seis carpetas y nadie puede borrarla con confianza.
Esta regla es lo único que evita que el repo nuevo sea el repo viejo en ocho sprints.

## D9 — Acceso a datos: queries por feature que devuelven tipos de dominio · `Propuesta`

`features/<x>/queries.ts` tipado desde los tipos generados de Supabase, devolviendo
tipos camelCase de dominio. La conversión snake→camel vive en un lugar por feature,
en vez de una carpeta global `mappers/`.

## D10 — Validación en todo borde, incluido el entorno · `Propuesta`

Zod en: input de API, artifacts JSON, y **variables de entorno al arrancar**
(`src/server/env.ts`). Lo actual descubre un env faltante en el primer request que lo
toca; queremos que falle al levantar, con el nombre de la variable.

## D11 — Estrategia de tests · `Propuesta`

- Unit + componentes con Vitest (ya configurado, corriendo).
- Integración contra una **branch real de Supabase**, no mocks, donde se pueda.
- E2E con Playwright, **fuera de CI** al principio.
- **Sin umbral de coverage al inicio**, y luego uno que sube por escalones.

El umbral de coverage del repo actual bloqueó un deploy una hora por 1–2 puntos
porque trece features integration-heavy entraron juntas. Un gate que se apaga bajo
presión no es un gate; se introduce cuando la base está estable y sube de a poco.

## D12 — Copy en diccionario, no en los componentes · `Propuesta`

`es-CL` es el único locale de v1, pero **ningún string literal dentro de un
componente**. Un diccionario por feature, resuelto en el servidor.

Lo actual mezcla español hardcodeado con un convención de prop `label(key)`, y se le
filtraron claves crudas a la UI (`sessions.title`) más de una vez. Con el copy fuera
del componente, agregar inglés es traducir un archivo, no auditar la app.

## D13 — Prompts versionados con harness de evaluación · `Propuesta`

Los prompts (classify, insights, action plans) viven en archivos versionados, con un
set de casos de referencia y un comando que mide regresión.

Es el activo con más horas de tuning del producto y hoy no tiene red: cambiar un
prompt es apostar. El harness se construye en la misma fase que el primer prompt, no
después.

---

## Pendiente de decidir

| Tema | Por qué aún no |
|---|---|
| Proveedor de transcripción por defecto | Depende de medir Whisper vs alternativas con audio real de FG (Fase 2) |
| Umbral de similitud para diarización | Se calibra con embeddings reales (Fase 3) |
| Hosting | Vercel es el default salvo que el pipeline pida otra cosa |
