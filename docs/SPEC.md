# Especificación — WAV Intelligence v2

Requisitos confirmados con Federico. Cuando algo de acá cambie, se edita este archivo
en el mismo commit que el código.

---

## Qué es

Una herramienta para **administrar y guiar** el ciclo completo de un estudio de
investigación. No es un motor de análisis: es la torre de control que sabe en qué
etapa va cada estudio, qué falta para cerrarla y qué está atrasado.

## Parámetros del producto

| Dimensión | Definición |
|---|---|
| Unidad que avanza | El **estudio**. Las sesiones viven dentro de su etapa de ejecución. |
| Usuario | **Solo Federico** en el v1. |
| Escala | 1 a 3 estudios en paralelo. |
| Tamaño de un estudio | Varios grupos repartidos en varios días (≈4 a 12 sesiones). |
| Dónde empieza | En el **brief**. Propuesta, cotización y venta quedan fuera. |
| Dónde termina | En el **cierre** = archivar. Sin incentivos ni facturación. |
| Dispositivo | Principalmente escritorio. |
| Despliegue | **Local por ahora.** Sin Vercel hasta que valga la pena. |
| Datos iniciales | **Empezar limpio.** Nada que migrar desde el sistema actual. |

## Las diez etapas

Son **dato semilla**, no schema: se editan desde la app sin migrar la base.

1. Brief
2. Diseño
3. Convocatoria
4. Logística
5. Ejecución
6. Procesamiento
7. Análisis
8. **Revisión** — QA de hallazgos, validación de citas, corrección del reporte
9. Entrega
10. Cierre

## Qué significa "guiar"

Las cuatro, confirmadas:

- **Checklist por etapa** — qué falta para poder cerrarla.
- **Alertas de lo atrasado** — qué se pasó de fecha o lleva demasiado detenido.
- **Compuertas que bloquean** — no se avanza sin cumplir los requisitos.
- **Plantilla reutilizable** — un estudio nuevo nace con sus etapas y tareas puestas.

## Plazos

Anclados a la **fecha de terreno**, que es el punto fijo acordado con el cliente.
La plantilla guarda días de desfase respecto a ese ancla: negativos para lo que va
antes (convocatoria, logística), positivos para lo que va después (procesamiento,
análisis, entrega).

Mover la fecha de terreno recalcula toda la línea de tiempo del estudio.

## Compuertas

Una etapa no cierra mientras tenga pendiente:

- una **tarea marcada como bloqueante**, o
- un **archivo requerido** sin adjuntar (el brief del cliente, la guía del moderador).

Los adjuntos son parte de cerrar la etapa, no decoración.

## Tareas

Casi todas son de Federico. El v1 trata el checklist como lista personal: hay fechas
de vencimiento, pero no hace falta asignación a terceros ni historial de quién cerró
qué. Eso llega si el equipo entra a la app.

## Mínimo para empezar a usarla

**Ver un estudio y avanzarlo por etapas.** Con eso ya sirve; el resto se construye
con la app en uso.

## Convivencia con el sistema actual

Federico usa hoy las cuatro áreas de `wav-intelligence`: convocatoria, sesiones y
subida de archivos, player y transcripciones, y dashboard con análisis y planes de
acción.

Las dos apps van a **convivir**: la nueva coordina el proceso, la vieja sigue
procesando y analizando. La paridad llega por fases (F4 en adelante), no de una vez.
Es decisión, no accidente.

## Camino del usuario

Recorrido completo sobre un estudio real: 3 días × 2 bloques = 6 sesiones.

| # | Etapa | Qué hace Federico |
|---|---|---|
| 0 | — | Crea el estudio: nombre, cliente, **fecha de terreno**. La plantilla se copia y las diez etapas nacen con fechas calculadas desde ese ancla |
| 1 | Brief | Adjunta el brief del cliente. Sin ese archivo la etapa no cierra |
| 2 | Diseño | Adjunta la guía del focus. Define 3 días × 2 bloques → la app crea las 6 sesiones `d1b1`…`d3b2` |
| 3 | Convocatoria | Carga el listado de invitados, los reparte en los bloques y les asigna micrófono |
| 4 | Logística | Sala, equipo, moderador por bloque |
| 5 | Ejecución | Marca cada bloque como realizado y sube audio y video 360 |
| 6 | Procesamiento | Transcripción por bloque, atribuida por micrófono |
| 7 | Análisis | Hallazgos y citas |
| 8 | Revisión | QA antes de mostrar nada |
| 9 | Entrega | Reporte al cliente |
| 10 | Cierre | Archivar |

**En el v1 existen solo el paso 0 y el esqueleto**: crear el estudio, ver su etapa
actual, adjuntar lo requerido y avanzarlo. Del 3 al 9 se sigue usando el sistema
actual mientras tanto.

## Materiales de entrada

Lo que Federico ya produce hoy por estudio:

| Material | Uso en la app |
|---|---|
| Guía del focus | Adjunto requerido de la etapa de diseño |
| Listado de invitados con micrófono asignado | Base de la convocatoria y de la atribución de hablante |
| Grabación de audio por día y bloque | Entrada del procesamiento |
| Grabación de video 360 por bloque | Entrada del procesamiento |

### Nomenclatura: la genera la app, no la persona

Los archivos siguen el patrón `d{día}b{bloque}` — `b1` es AM, `b2` es PM, así que
`d2b2` es la tarde del día dos. Hoy esa convención la sostiene Federico a mano.

Como la app conoce la estructura del estudio, **genera ella los nombres esperados** y
empareja los archivos subidos contra esa lista. La convención deja de ser disciplina
personal y pasa a ser una verificación: la etapa de ejecución es una grilla de bloques
que se completa, no una carpeta donde hay que no equivocarse.

### El audio varía entre estudios

A veces hay una sola mezcla de sala por bloque; a veces una pista por micrófono; a
veces ambas. La app **no puede asumir una forma fija**: acepta las dos y muestra qué
tiene cada bloque. La atribución de hablante es directa cuando hay pistas por
micrófono, y requiere separación sobre la mezcla cuando no las hay.

### Material real y repo público

El repo es público. El material real de cliente vive en `/private`, que está en
`.gitignore` y no se commitea nunca. Lo que necesite existir en el repo como fixture
de tests se escribe sintético en `tests/fixtures/`, nunca copiando de `/private`.

---

## Fuera de alcance del v1

| Tema | Por qué |
|---|---|
| Vista de cliente (MG Motor) | Nadie más que Federico usa la app todavía |
| Asignación de tareas a terceros | Todas las tareas son suyas |
| Notificaciones por correo o WhatsApp | Usuario único, escritorio, 1–3 estudios: la app basta |
| Pipeline comercial (propuesta, cotización) | El proceso arranca en el brief |
| Incentivos y facturación | La plata se maneja fuera |
| Despliegue | Local por ahora |

## Maquinaria dormida

Honestidad sobre lo ya construido: el modelo de tres roles (`admin`, `client`,
`moderator`), sus caminos de RLS y la tabla `session_moderators` se construyeron antes
de saber que el usuario sería uno solo. Funcionan y están probados, pero hoy no los
usa nadie.

No se desarman: quitarlos es churn sin beneficio, y el día que entre el cliente o un
moderador ya están. Pero quedan registrados como capacidad sin uso, no como valor
entregado.
