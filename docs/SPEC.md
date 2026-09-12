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
