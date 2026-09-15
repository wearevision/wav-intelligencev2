# Diseño · Archivos del estudio y convocatoria (A + B)

Una zona de subida en el estudio que reconoce qué es cada archivo, muestra lo
que entendió y, al confirmar, deja la plataforma cargada. Esta primera etapa
interpreta la **convocatoria**; la pauta (C) y las respuestas del formulario
(D) se reconocen y se adjuntan, y se interpretan en etapas siguientes sobre la
misma zona.

---

## Lo confirmado (archivos reales de MG FG S2, 2026-09-14)

**Convocatoria — `Agenda Horarios.xlsx`**

- Una hoja por día de terreno: `Junio 2`, `Junio 3`, `Junio 4`.
- Encabezado en la fila 2. Columnas: RUT, Nombre, Celular, Mail, Patente,
  `N° Micrófono` (o `Micrófono`), `Nº Giftcard`, dos columnas de horario,
  `Cliente / NO Cliente`, `observación` (asistencia), una columna sin título
  (estado de confirmación) y `ROL`.
- Las columnas de horario son el bloque. La de la mañana llega como hora de
  Excel (`1899-12-30T09:00`), la de la tarde como texto (`13:00PM`,
  `13:00 PM`). Un `1` marca en qué bloque estuvo cada persona.
- El segmento se escribe distinto entre hojas: `NO`, `CLIENTE`, `Cliente`.
- La hoja de `Junio 4` trae una primera columna numérica sin título.

**Pauta — `Guion Pauta S2.docx`** y **respuestas — `Respuestas Google Form…xlsx`**
(primera columna `Marca temporal`, 53 respuestas, 27 preguntas y una columna de
correo). Se describen aquí solo para reconocerlos; su interpretación es C y D.

**Lo que ya existe en v2**

- `src/features/participants/roster-import.ts`: parser puro de esta planilla
  (columnas por encabezado, micrófono como número / `MIC03 am / MIC06 pm` /
  nota, rol, segmento, asistencia) y `previewRoster` / `importRoster`, que
  **solo agregan** personas a bloques que **ya existen**, sin fechas.
- `sessions` tiene `day_number`, `block_number`, `code` (`d1b1`), `name`
  (`Día 1 · Bloque 1`) y `scheduled_at`.
- `participants` (`name`, `mic_number`, `role`, `segment`) y `verbatims`, cuyo
  `participant_id` pasa a `null` si se borra al participante.
- Adjuntos de etapa (`study_stage_files`), entre ellos «Listado de invitados»
  y «Guía del focus».

---

## Lo que se decide acá

### 1 · Una zona de subida por estudio que reconoce el archivo por su contenido

En la página del estudio, **«Archivos del estudio»**: arrastrar o elegir uno o
varios archivos. El servidor los clasifica por contenido, nunca por nombre:

| Tipo | Se reconoce por | En esta etapa |
|---|---|---|
| Convocatoria | `.xlsx` con al menos una hoja que tenga «Nombre» y columnas de horario | se interpreta (abajo) |
| Respuestas de formulario | `.xlsx` cuya primera celda del encabezado es «Marca temporal» | se reconoce y se informa; no hay adjunto de etapa donde guardarlo; se interpreta en D |
| Pauta | `.docx` | se adjunta como «Guía del focus»; se interpreta en C |
| Otro | — | se rechaza diciendo qué se esperaba |

El reconocimiento es una función pura (`detectStudyFile`) sobre lo ya leído
del archivo, probada sin abrir archivos. Un `.xlsx` que sea a la vez las dos
cosas no existe en la práctica; si pasara, gana la convocatoria y se avisa.

### 2 · La planilla define los días y bloques del estudio

- Cada hoja es un día. La fecha sale del nombre de la hoja (`Junio 2` → 2 de
  junio) con el año del inicio de terreno del estudio; el número de día, del
  orden de las fechas.
- Cada columna de horario es un bloque, en orden; su hora (`09:00`,
  `13:00PM`) da `scheduled_at` en hora de Chile (`America/Santiago`).
- Un bloque que no existe **se crea** (`d{día}b{bloque}`, «Día N · Bloque M»).
  Uno que existe **se corrige** (fecha y hora).
- Los bloques **nunca se borran** desde la planilla: arrastrarían grabaciones,
  corridas del pipeline y transcripciones (`on delete cascade`). Un bloque del
  estudio que la planilla no menciona se muestra en la vista previa y no se toca.
- Si una hoja no trae una fecha legible, la importación se detiene y dice qué
  hoja: adivinar la fecha movería todo el terreno.

### 3 · Cada bloque queda igual a la planilla en personas (espejo exacto)

Por bloque, comparando por nombre normalizado (sin tildes, minúsculas, espacios
colapsados):

- **Actualizar** a quien ya está: micrófono, rol y segmento. **Conserva su
  `id`**, así la atribución de sus verbatims no se pierde.
- **Agregar** a quien no está.
- **Borrar** a quien ya no aparece. La vista previa dice, por persona, cuántos
  verbatims quedarían sin autor.

Quien figura como «no asistió» no entra (y, si estaba, se borra). La
normalización evita que `gissela Millar` y `Gissela Millar ` cuenten como dos
personas; dos filas que normalizadas coinciden dentro del mismo bloque son un
aviso y se toma la primera.

### 4 · Vista previa antes de escribir

Nada se guarda hasta confirmar. La vista previa muestra, por día y bloque:
bloque nuevo o corregido (con fecha y hora), personas a agregar / actualizar
(qué cambia) / borrar (y verbatims afectados), y avisos: micrófono escrito como
nota (la persona entra sin micrófono y se muestra la nota), **dos personas con
el mismo micrófono en un bloque**, filas sin bloque marcado, segmento no
reconocido, asistencia «no asistió».

### 5 · Al confirmar, todo o nada

Una función de Postgres (RPC, `security invoker`, respetando las policies de
admin) recibe el plan recalculado en el servidor y lo aplica en una transacción: crea y
corrige bloques, borra, actualiza y agrega participantes. Si algo falla no
queda un estudio a medio cargar. Después se guarda el archivo original como
adjunto «Listado de invitados» de su etapa (si el adjunto falla, los datos ya
quedaron y se avisa).

El plan **no viaja desde el navegador**. Al confirmar, el componente vuelve a
mandar el mismo archivo (lo tiene en memoria) y el servidor recalcula el plan
contra el estado actual. La vista previa entregó una huella del plan (hash de su
contenido); si el plan recalculado tiene otra huella —alguien cambió el estudio
entre medio—, **no se aplica nada** y se devuelve la vista previa nueva para
revisarla. Así nunca se borra a alguien que la persona no vio en la lista.

### 6 · Datos personales

RUT, celular, correo, patente y giftcard no salen del parser (D24). El archivo
original se guarda como adjunto de etapa, igual que hoy.

---

## Piezas

| Pieza | Tipo | Responsabilidad |
|---|---|---|
| `detectStudyFile` | pura, con tests | tipo de archivo por contenido |
| `parseRosterWorkbook` (existente) | pura, con tests | + fecha de la hoja, hora de cada bloque, normalización de nombre, micrófonos repetidos |
| `planRosterSync` | pura, con tests | planilla + estado actual → bloques a crear/corregir, personas a agregar/actualizar/borrar, avisos |
| RPC `apply_roster_sync` | migración | aplica el plan en una transacción |
| acciones `previewStudyFiles` / `applyStudyFiles` | servidor | leer, clasificar, planificar y devolver la huella; recalcular, comparar huella y aplicar |
| «Archivos del estudio» | componente | subida, vista previa, confirmar; reemplaza la importación actual de participantes |

`planRosterSync` es donde está el riesgo (espejo exacto borra) y lleva la mayor
parte de los tests, con los casos reales de la planilla: encabezado de hora como
fecha de Excel y como texto, segmento escrito de tres formas, micrófono como
nota, persona en los dos bloques, nombres con mayúsculas y espacios distintos.

## Fuera de esta etapa

- Interpretar la pauta (C) y las respuestas del formulario (D).
- Limpiar los dos estudios de prueba «Focus Group» de la base.
- Borrar bloques desde la planilla.
