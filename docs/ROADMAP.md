# Roadmap — WAV Intelligence v2

Cada fase cierra con algo **demostrable en pantalla**, no con "el módulo X está listo".
El orden es de dependencia: ninguna fase empieza sin que la anterior corra de verdad.

Estado: `F0` en curso.

---

## F0 · Fundación

Levantar el piso sobre el que se apoya todo lo demás.

- Proyecto Supabase nuevo + primera migración: `tenants`, `profiles`, `sessions`
- RLS con `tenant_id` y roles separados en dos ejes (ver D3, D4)
- Validación de entorno con Zod (D10)
- Shell de la app: layout, navegación por rol, design system base
- CI: typecheck + tests + build

**Entregable:** Federico entra con su cuenta, ve el shell de la app y una lista de
sesiones vacía. Un usuario de otro tenant no ve nada de este.

**Cierre:** el aislamiento entre tenants está probado con un test de integración, no
solo revisado a ojo.

---

## F1 · Ingesta

Meter materia prima al sistema.

- CRUD de sesiones y participantes
- Subida de media a R2 (presign + multipart) tras un puerto de storage único (D8)
- Modelo de `media_files` + `artifacts` (D6)
- Tipos de media: 360°, DSLR, CCTV, audio de sala, ambiente, micrófonos individuales

**Entregable:** crear una sesión, subir un video de 2 GB, verlo listado con su tamaño
y duración correctos.

**Cierre:** subir el mismo archivo dos veces no duplica nada (idempotencia por checksum).

---

## F2 · Pipeline y transcripción

El ascensor de carga empieza a funcionar.

- `pipeline_runs` / `pipeline_steps` como datos (D5)
- Transcode a HLS con ffmpeg
- Transcripción con Whisper + glosario automotriz chileno
- Ingesta de artifacts producidos localmente por WAV Ingest (D6)
- Vista de progreso del pipeline por paso

**Entregable:** **re-ingestar un focus group real de punta a punta** y leer su
transcripción en la app.

**Cierre:** un paso que falla se re-corre solo, sin repetir los pasos ya completados.
Y un artifact producido local se respeta en vez de re-procesarse.

---

## F3 · Diarización

Saber quién dijo qué — el problema más difícil del producto.

- Marcado de rangos de voz por participante (operador asistido)
- Embeddings de voz con pyannote + enrollment por participante
- Atribución de verbatims, con corrección manual que gana siempre
- Re-entrenamiento tras reasignación

**Entregable:** los verbatims de una sesión real aparecen atribuidos por nombre, y
corregir uno a mano se persiste.

**Cierre:** precisión medida contra una sesión anotada a mano. Objetivo 95%; el número
real se reporta aunque no llegue.

---

## F4 · Análisis

Convertir transcripción en conocimiento.

- Clasificación de topic + sentimiento por verbatim
- Score de calidad de verbatim
- Extracción de insights: keypoints, barreras de compra, menciones de competencia
- Planes de acción generados
- Harness de evaluación de prompts (D13) — se construye **en esta fase**, no después
- Dashboard: sentimiento por tema, evolución, verbatims destacados

**Entregable:** dashboard de una sesión real con sentimiento por tema y barreras
rankeadas.

**Cierre:** el harness corre y reporta un baseline. Cambiar un prompt muestra si mejoró
o empeoró.

---

## F5 · Player

- Player multi-fuente (DSLR / 360° / audio) sincronizado
- Transcripción sincronizada, click-to-seek
- Timeline con segmentos por tema
- Mapa de asientos y detalle de participante

**Entregable:** ver la sesión y saltar a cualquier cita desde la transcripción.

---

## F6 · Entregables

- Reporte PDF de sesión
- PPTX por idioma
- CSV de planes de acción
- Bundle de clips de video con subtítulos

**Entregable:** los cuatro formatos descargables desde una sesión real.

---

## F7 · Research y chat

- Búsqueda semántica cross-session de verbatims
- Chat IA con herramientas sobre los datos de investigación

**Entregable:** preguntar "¿qué dijeron sobre el precio en todas las sesiones?" y
recibir citas con link al minuto exacto.

---

## F8 · Convocatoria

- CRM de leads, importación CSV/Excel
- Grilla de cupos por sesión, timeline de toques
- Plantillas de mensajes por canal

**Entregable:** convocar una sesión real desde la app.

---

## Reglas de ejecución

- **TDD donde hay lógica.** Test primero en pipeline, scoring, RLS y validación.
  No en componentes de presentación puros.
- **Una fase, una rama, PRs chicos.** Nada de batches de 40 commits.
- **Migraciones numeradas por una sola mano.** Si se paraleliza trabajo, el número de
  migración se asigna antes de dispatchar.
- **`git add <paths>` explícito.** Nunca `git add .` ni `commit -a` con trabajo
  concurrente en el árbol.
- **Este roadmap es la fuente de verdad del estado.** Si una fase cambia de alcance, se
  edita acá primero.
