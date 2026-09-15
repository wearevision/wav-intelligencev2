# Arquitectura — WAV Intelligence v2

Herramienta para **administrar y guiar** el ciclo completo de un estudio de
investigación, desde el brief del cliente hasta la entrega. El repo
`wearevision/wav-intelligence` queda como referencia de lectura; nada de su código
se hereda.

Los requisitos confirmados viven en [SPEC.md](SPEC.md); este archivo explica **cómo**
se resuelven y **por qué** así.

**Estado:** las decisiones marcadas `Aceptada` están confirmadas. Las `Propuesta`
esperan revisión antes de construir encima.

---

## Mapa mental

El sistema es una **torre de control**, no una fábrica.

```
                    ┌─────────────────────────────┐
                    │      TORRE DE CONTROL       │
                    │  todos los estudios a la    │
                    │  vez · qué está atrasado    │
                    │  · qué está trabado         │
                    └──────────────┬──────────────┘
                                   │ mira hacia abajo
      ┌────────────────────────────┴────────────────────────────┐
      │                    UN ESTUDIO                           │
      │                                                         │
      │  brief → diseño → convocatoria → logística → ejecución  │
      │       → procesamiento → análisis → revisión →           │
      │       → entrega → cierre                                │
      │         ▲                                               │
      │         └── cada etapa: tareas, responsable, fecha,     │
      │             y una compuerta que decide si puede cerrar  │
      │                                                         │
      │  dentro de "ejecución" viven las sesiones concretas     │
      └─────────────────────────────────────────────────────────┘
```

Dos ideas gobiernan el diseño:

1. **La unidad que avanza es el estudio.** Las sesiones son piezas dentro de él,
   no entidades de primer nivel con vida propia.
2. **El proceso es dato, no código.** Las etapas y sus tareas se instancian desde
   una plantilla editable. Cambiar el proceso es editar una plantilla, no desplegar.

El análisis con IA es la etapa 7 de diez. Es una parte del camino, no el destino.

Los plazos cuelgan de un solo clavo: la **fecha de terreno**. Todo lo demás se calcula
como desfase respecto a ella.

---

## D1 — Repo nuevo · `Aceptada`

Repo `wav-intelligence-v2`, paralelo al actual. Cero código heredado.

## D2 — Infraestructura nueva · `Aceptada`

Supabase `lrnaiwilairvvnqlyxdq` (us-east-1) y bucket R2 propio. Sin datos heredados.

## D3 — Un solo cliente: sin multi-tenancy · `Aceptada`

No hay `tenant_id` ni tabla `tenants`. Producto para un cliente.

**Costo de revertir:** agregar y rellenar `tenant_id` en toda tabla, reescribir cada
policy y cada query, auditar cada endpoint. El riesgo no es que rompa — es que una
query que se pase filtre datos de otro cliente en silencio.

**Puerta de salida más barata:** si aparece un cliente #2, levantar un deployment
propio antes que retrofitear tenancy.

## D4 — Una sola lista de roles · `Aceptada`

| Rol | Quién | Puede |
|---|---|---|
| `admin` | Federico y equipo WAV | Todo: estudios, etapas, plantillas, usuarios |
| `client` | MG Motor | Ver avance y resultados de estudios entregables |
| `moderator` | Moderadores | Solo sus sesiones asignadas |

El rol vive en `profiles` (consultable, joinable) y se espeja al JWT por un custom
access token hook, para que las policies lean un claim en vez de consultar por fila.

**Maquinaria dormida en el v1.** Se construyó antes de saber que el usuario sería uno
solo. Los caminos de `client` y `moderator` funcionan y están probados, pero hoy no
los recorre nadie. No se desarman —quitarlos es churn sin beneficio— pero se cuentan
como capacidad sin uso, no como valor entregado.

## D5 — El estudio es la unidad de avance · `Propuesta`

`studies` es la entidad central. Un estudio agrupa N sesiones repartidas en varios
días y **es lo que avanza por las etapas**. Una sesión no tiene etapas propias: vive
dentro de la etapa de ejecución de su estudio.

Se descartó darle su propio ciclo a cada sesión: duplicaría el seguimiento y haría
imposible la pregunta que importa — *¿cómo va el estudio de MG?* — sin sumar a mano.

## D6 — El proceso vive en plantillas · `Propuesta`

```
study_templates          la plantilla ("Focus group estándar")
  └── template_stages    etapas ordenadas, con holgura en días
        └── template_tasks   tareas típicas, con rol responsable

studies                  el estudio real, creado desde una plantilla
  └── study_stages       copia instanciada, con fechas y estado reales
        └── study_tasks  copia instanciada, con responsable y vencimiento
```

Crear un estudio **copia** la plantilla en lugar de referenciarla. Un estudio en
curso no debe cambiar de forma porque alguien editó la plantilla a mitad de camino;
y el estudio del año pasado tiene que seguir mostrando el proceso que realmente
tuvo, no el actual.

Consecuencia práctica: la lista de nueve etapas es **dato semilla**, no schema.
Corregirla es editar una fila.

## D7 — Compuertas: una etapa no cierra con pendientes bloqueantes · `Propuesta`

Una etapa no cierra mientras tenga pendiente una **tarea bloqueante** o un **archivo
requerido** sin adjuntar. Los adjuntos —el brief del cliente, la guía del moderador—
son parte de cerrar la etapa, no decoración.

La compuerta se expresa como tarea o como requisito de archivo, no como un motor de
reglas.

Condiciones de dominio más ricas — "no ejecutar con cupos sin confirmar" — llegan
después como *checks* con nombre, cuando exista la convocatoria que las alimente.
Construir el motor de reglas antes de tener las reglas es inventar requisitos.

## D8 — Las alertas se derivan, no se guardan · `Propuesta`

"Atrasado" y "trabado" son consultas sobre fechas y estados, no columnas ni tablas.

Guardar el estado de alerta obliga a mantenerlo sincronizado con un job, y un job que
falla produce lo peor posible en una torre de control: silencio que parece calma.
Derivarlo no puede desincronizarse.

## D14 — Los plazos cuelgan de la fecha de terreno · `Propuesta`

La fecha de las sesiones es el punto fijo que se acuerda con el cliente. La plantilla
guarda **días de desfase respecto a ese ancla**: negativos para lo que va antes
(convocatoria, logística), positivos para lo que va después (procesamiento, entrega).

Consecuencia que hay que sostener: mover la fecha de terreno **recalcula la línea de
tiempo completa** del estudio. Es el comportamiento correcto —cuando el cliente corre
el terreno dos semanas, todo se corre con él— pero exige que las fechas se guarden
como desfase resuelto y no como valores sueltos que quedarían huérfanos.

Las fechas ya cumplidas no se recalculan: lo que pasó, pasó.

## D15 — Dos almacenamientos, por peso y no por capricho · `Propuesta`

| Qué | Dónde | Por qué |
|---|---|---|
| Documentos de etapa (brief, guía, listado) | Supabase Storage | Archivos chicos, acceso puntual. Ya está ahí, sin credenciales ni proveedor nuevo, y las policies usan el mismo `private.is_admin()` que las tablas. |
| Media de sesión (video 360, audio por bloque) | R2 | Decenas de GB por estudio. R2 no cobra salida, que es lo que domina el costo cuando se reproduce y se descarga. |

Se evaluó usar R2 también para los documentos, por tener un solo almacenamiento.
Se descartó: obligaría a configurar credenciales de R2 en F3 para mover archivos
de 200 KB, cuando lo que justifica R2 —el costo de salida— recién aparece con el
video en F6.

El costo de la decisión es tener dos rutas de archivo. Se acota manteniendo un
puerto de storage único en `server/`, para que la elección de proveedor no se
desparrame por los features.

## D9 — Módulos por dominio · `Propuesta`

```
src/
  app/            routing y nada más
  features/
    studies/      el estudio y su avance por etapas
    workflow/     plantillas, etapas, tareas, compuertas
    control/      la torre: vistas agregadas y alertas
    recruiting/   convocatoria
    sessions/     sesiones, logística, participantes
    media/        captura y procesamiento
    insights/     análisis
    deliverables/ entregables
  server/         lo que NUNCA se empaqueta al cliente: cliente Supabase de
                  servidor, auth, storage
  lib/            compartido entre servidor y navegador: cliente Supabase de
                  navegador, tipos del schema, utilidades
  ui/             primitivas de diseño
```

**Regla dura:** un feature nunca importa el interior de otro, solo su `index.ts`.
Es lo único que evita repetir la deuda del repo anterior, donde una feature quedaba
repartida en seis carpetas técnicas y nadie podía borrarla con confianza.

## D10 — Validación en todo borde, incluido el entorno · `Propuesta`

Zod en input de API, en artifacts JSON, y en variables de entorno **al arrancar**.
Que falle al levantar nombrando la variable, no en el primer request que la toca.

## D11 — Estrategia de tests · `Propuesta`

Unit y componentes con Vitest. Integración contra Supabase real donde se pueda —
las reglas de acceso se prueban contra RLS, no contra mocks. E2E con Playwright,
fuera de CI al principio.

**Sin umbral de coverage al inicio**, y luego uno que sube por escalones. El umbral
del repo anterior bloqueó un deploy una hora por dos puntos; un gate que se apaga
bajo presión no es un gate.

## D12 — Copy en diccionario · `Propuesta`

`es-CL` es el único locale, pero ningún string literal dentro de un componente.
Al repo anterior se le filtraron claves crudas a la pantalla más de una vez.

## D13 — El pipeline de medios es una etapa, no el centro · `Propuesta`

Transcripción, diarización y análisis entran como la etapa de procesamiento, en una
fase tardía del roadmap. Cuando llegue el momento, dos ideas del diseño anterior se
mantienen porque siguen siendo buenas:

- **Pasos como datos**, para poder re-correr uno solo sin tocar un orquestador.
- **Artifacts de primera clase**: un paso se salta si y solo si su salida ya existe
  y valida. Convierte el procesamiento local de WAV Ingest en un concepto del modelo
  en vez de una constelación de null-checks.

Runner: Trigger.dev, por jobs largos, reintentos y extensión Python para pyannote.

## D16–D19 — Sesiones, archivos, transcripción y dónde se procesa · `Propuesta`

Cuatro decisiones que salen del diseño de F5 y F6. El razonamiento completo está
en [plans/2026-09-13-f5-f6.md](plans/2026-09-13-f5-f6.md); acá el resumen para
que el registro quede completo.

- **D16 — La forma del estudio son las sesiones, no dos columnas.** Guardar
  `days` y `blocks_per_day` duplicaría la verdad: una séptima sesión agregada a
  mano las volvería mentira sin que nada lo detecte. El generador crea N×M como
  comodidad de entrada; la estructura se deriva contando sesiones.
- **D17 — El archivo se empareja con su bloque por el código del nombre.** La
  app genera la lista de archivos esperados y empareja contra ella. Lo que no
  calza va a una bandeja de "sin asignar", nunca se descarta: un nombre mal
  puesto es un error de rotulado, y el material es irrepetible.
- **D19 — Lo pesado se procesa en local; a la nube solo sube lo liviano.** Dos
  horas de 360 en 5.7K son decenas de gigas por bloque, y el análisis sale del
  audio de todos modos. El video se transcodifica en WAV Ingest y sube solo el
  HLS; el audio sube tal cual. El master se queda en disco, así que su ubicación
  se guarda en columna: sin eso, en dos años nadie lo encuentra.
- **D18 — La transcripción se ramifica según el audio disponible.** Varía entre
  estudios —mezcla de sala, pistas por micrófono, o ambas—, así que ningún paso
  del pipeline asume una forma fija.

---

## D20 — El casillero decide, no el orquestador · `Propuesta`

Un paso del pipeline se salta **si y solo si su artifact de salida ya existe**. No
hay un `if` por paso preguntando "¿esto ya se hizo?", ni una columna
`hls_manifest_key` mirada desde tres lugares distintos.

La alternativa era la del proyecto anterior: el orquestador revisa banderas antes de
cada paso. Funciona hasta que aparece un productor nuevo —WAV Ingest transcodificando
en local— y hay que agregar una columna y una rama por cada paso que ese productor
pueda adelantar.

Con el casillero, publicar el artifact **es** la forma de adelantar el trabajo. La app
no necesita enterarse de quién lo hizo: encuentra la salida hecha y sigue. `producer`
queda como dato para poder leer después qué se hizo dónde, no como condición.

Consecuencias que hay que sostener:

- **La clave del artifact es determinística** (`studies/{estudio}/{código}/artifacts/{tipo}.json`),
  así que rehacer un paso pisa su salida en vez de acumular versiones huérfanas.
- **Descartar un artifact es la única forma de forzar un paso.** No hay botón de
  "correr igual": vaciar el casillero y volver a correr es la misma operación.
- **`unique (session_id, kind)`** en la base. Sin eso, dos artifacts del mismo tipo
  harían que "ya existe" dependa de cuál se lea primero.

---

## D21 — Las partes no se pegan; se ordenan · `Propuesta`

Los equipos cortan las grabaciones: el Insta360 segmenta el 360 y la grabadora parte
el audio al llegar al límite de tamaño, o cuando alguien la detiene entre ejercicios.
El modelo asumía un archivo por fuente y no es cierto.

Las partes suben tal cual. Lo que se guarda es a qué grabación pertenece cada una y
en qué orden (`recording_key`, `part_number`, `recorded_at`), y la transcripción las
recorre en secuencia desplazando los tiempos. Pegar los WAV significaría mover
gigabytes dos veces para producir un archivo que se usa una vez.

El video 360 es la excepción: ya se transcodifica de todos modos (D19), así que unir
los segmentos es un argumento más del mismo `ffmpeg` y no un viaje extra de datos.

Dos consecuencias que hay que sostener:

- **Los desfases salen del reloj, no de la suma.** Sumar duraciones da por sentado que
  no hubo pausas, y a veces las hubo. Cada parte guarda cuándo se capturó; cuando la
  distancia real no coincide con la suma, **se muestra cuánto tiempo falta** en vez de
  esconderlo dentro del cálculo. Sin reloj utilizable se cae a la suma y se dice.
- **El agrupador propone, la persona confirma.** Juntar dos grabaciones distintas bajo
  un mismo invitado corrompe la atribución de forma invisible, que es la peor clase de
  error en este sistema. Por eso dos tomas de una Zoom nunca se unen solas: `ZOOM0001`
  puede ser la mañana y `ZOOM0002` la tarde.

Detalle completo, con las familias de nombres reconocidas:
[plans/2026-09-13-grabaciones-en-partes.md](plans/2026-09-13-grabaciones-en-partes.md)

---

## D22 — El rol de cada persona decide qué entra al análisis · `Propuesta`

En la sala no todos son el objeto de estudio. El moderador conduce, la gente de la
marca observa y a veces interviene, y los tres llevan micrófono. Sus palabras se
transcriben —hacen falta para leer la conversación— pero no son opinión de
consumidor.

`participants.role` toma cuatro valores: `participant`, `moderator`, `brand_staff`,
`observer`. Solo el primero cuenta en los agregados.

Sin esta columna el error no se ve: una pregunta del moderador entra al promedio de
sentimiento, el promedio sale distinto, y nada lo delata. Es la clase de defecto que
se descubre meses después comparando contra una lectura manual, o no se descubre.

Dos consecuencias:

- **El plan de transcripción lleva el rol**, no solo el nombre. Quien procese después
  no tiene que volver a consultar la base para saber qué sumar.
- **La interfaz lo dice donde se elige.** Al marcar a alguien como moderador, la misma
  fila explica que no cuenta como opinión. Que algo quede fuera del análisis no
  debería descubrirse leyendo el informe.

---

## D23 — La transcripción se produce en local y la app la ingesta · `Propuesta`

Es D19 aplicado a la transcripción. Un bloque son 2,4 GB de WAV que **ya están en el
disco del operador**; subirlos otra vez a una API, en trozos de 25 MB, cuesta más
tiempo y más plata que correr el modelo ahí mismo. WAV Ingest ya tiene whisper.cpp.

La app no transcribe: **ingesta un artifact** `transcript_json` y lo convierte en
verbatims. El paso `transcribir` existe igual y se salta solo cuando el artifact está
(D20); mientras no exista el lado de escritorio, falla nombrando qué falta, que es
mejor que una cadena que termina en verde sin transcripción.

El contrato está versionado y se valida al leerlo. Dos decisiones dentro de él:

- **Los tiempos de cada fuente son relativos a esa fuente**, y cada fuente declara
  cuándo empezó a grabar en absoluto. La app calcula el cero del bloque —la primera
  grabadora que arrancó— y desplaza el resto. En un bloque real una empieza 21:26 y
  otra 22:10; sin la hora absoluta las dos parecerían empezar en el mismo instante y
  la conversación quedaría superpuesta.
- **La atribución la hace la app, no el transcriptor.** El artifact dice de qué
  micrófono es cada pista; el nombre sale de cruzar ese número con el listado de
  participantes. Quien transcribe no sabe —ni tiene por qué saber— quién llevaba el
  micrófono 3.

Queda abierto el camino de nube como respaldo, para material que llegue sin pasar por
el escritorio. Es un adaptador detrás del mismo paso, no otra arquitectura.

---

## D24 — De la planilla entra lo que el análisis necesita, no todo · `Propuesta`

La planilla de convocatoria trae RUT, celular, correo y patente de cada invitado.
Nada de eso hace falta para transcribir ni para analizar: la atribución necesita
nombre, micrófono y rol, y la comparación necesita el segmento cliente / no cliente.

Se importa eso y se deja el resto en la planilla. Menos dato guardado es menos dato
que proteger, y la base deja de ser un registro de datos personales de decenas de
personas para ser lo que es: el registro de quién habló en cada bloque.

Si algún día la app maneja la convocatoria (F4), el contacto entrará entonces y con
esa decisión tomada a propósito, no de arrastre.

Dos cosas que el archivo real enseñó y quedaron en el modelo:

- **El bloque es una columna, no una fila.** Dos columnas de horario y un `1` que
  marca en cuál estuvo cada persona. Una hoja por día.
- **La celda del micrófono no siempre es un número.** A veces es `MIC03 am / MIC06 pm`
  —la misma persona en los dos bloques con equipo distinto— y a veces es una frase
  contando que el micrófono cambió de dueño a mitad de sesión. Lo primero se
  interpreta; lo segundo **no**: sacarle el número a una nota le daría ese micrófono
  a dos personas del mismo bloque y cruzaría la atribución sin que nada lo delate.
  La persona entra sin micrófono y la nota se muestra.

---

## D25 — La app nunca tiene llaves de R2, y la clave se valida del lado del servidor · `Propuesta`

WAV Ingest no lleva credenciales de Cloudflare. Pide URLs prefirmadas a la app y
manda los bytes directo al bucket: las llaves viven en un solo lugar y una app de
escritorio repartida entre equipos no es ese lugar. Si mañana hay que rotarlas, se
rotan en el servidor y nadie recompila nada.

De eso se desprende que el servidor arma la clave y la app no elige dónde se
escribe. La subida por partes es la única grieta: iniciar, firmar cada parte y
completar tienen que hablar del mismo objeto, así que la app devuelve la clave que
se le dio. No hay forma de que el servidor la reconozca sin guardar cada clave
emitida, pero sí de acotar el daño: se exige que caiga bajo el prefijo del estudio,
sin segmentos vacíos ni saltos de directorio, y con la profundidad que el propio
servidor construye. Una app comprometida no puede escribir fuera de su estudio.

Por partes y no de una pieza sobre cierto tamaño porque una subida que se corta al
90 % empieza de cero: con un archivo de cuatro gigas en terreno eso es media hora
de vuelta a empezar.

---

## D26 — La convocatoria define los bloques y cada bloque refleja la planilla · `Propuesta`

Subir la planilla de convocatoria crea los bloques que falten y corrige fecha y hora
de los que ya existen: cada hoja es un día y cada columna de horario un bloque. Así
no hace falta generar la agenda a mano antes, y la fecha real de terreno viene del
mismo archivo que usó el equipo, no de un paso que alguien podía saltarse.

En personas, cada bloque queda **igual a la planilla**: se actualiza a quien ya
está, se agrega a quien falta y se borra a quien ya no aparece. Se prefirió al «solo
agregar» de antes porque una corrección de micrófono en la planilla tiene que llegar
a la plataforma, o la atribución de la transcripción queda mal sin que nada lo diga.

Dos cosas que hay que sostener:

- **Actualizar conserva la identidad.** Quien sigue en la planilla se modifica en su
  fila, no se borra y se vuelve a crear: sus verbatims apuntan a ese `id` y perderían
  el autor.
- **La planilla nunca borra bloques.** Un bloque arrastra grabaciones, corridas y
  transcripciones en cascada; que desaparezca porque una hoja se renombró sería
  perder material irrepetible. Borrar gente se muestra en la vista previa con los
  verbatims que quedarían sin autor; borrar un bloque no es algo que la planilla pueda
  pedir.

Diseño: [plans/2026-09-14-subida-archivos-estudio.md](plans/2026-09-14-subida-archivos-estudio.md).

---

## Pendiente de decidir

| Tema | Por qué aún no |
|---|---|
| Notificaciones fuera de la app (correo, WhatsApp) | Primero ver si la torre de control alcanza sola |
| Proveedor de nube como respaldo | El camino local (D23) cubre el caso real; el respaldo se elige cuando aparezca material que no pase por el escritorio |
| Hosting | Vercel por defecto salvo que el pipeline pida otra cosa |
