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

## D16–D18 — Sesiones, emparejamiento de archivos y transcripción · `Propuesta`

Tres decisiones que salen del diseño de F5 y F6. El razonamiento completo está
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
- **D18 — La transcripción se ramifica según el audio disponible.** Varía entre
  estudios —mezcla de sala, pistas por micrófono, o ambas—, así que ningún paso
  del pipeline asume una forma fija.

---

## Pendiente de decidir

| Tema | Por qué aún no |
|---|---|
| Notificaciones fuera de la app (correo, WhatsApp) | Primero ver si la torre de control alcanza sola |
| Proveedor de transcripción | Se mide con audio real cuando llegue la etapa |
| Hosting | Vercel por defecto salvo que el pipeline pida otra cosa |
