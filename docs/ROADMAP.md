# Roadmap — WAV Intelligence v2

Cada fase cierra con algo **demostrable en pantalla**, no con "el módulo X está listo".
El orden sigue el valor para quien coordina: primero saber en qué estado está todo,
después automatizar los tramos.

Estado: `F0` · `F1` · `F2` · `F3` · `F5` cerradas · `F6a · Subida y grilla` es lo siguiente.
`F4 · Convocatoria` queda pendiente y no bloquea a F6.

Requisitos confirmados: [SPEC.md](SPEC.md). Despliegue diferido — la app corre local
hasta que valga la pena publicarla.

---

## F0 · Fundación

- [x] Repo, tooling, CI (typecheck · lint · tests · build)
- [x] Proyecto Supabase + migración inicial: `profiles`, `sessions`, `participants`
- [x] RLS por rol, verificada contra la base real con siete casos
- [x] Validación de entorno con Zod
- [x] Clientes de Supabase (servidor y navegador) y guard de sesión en `proxy.ts`
- [x] Shell de la app con login

**Entregable:** Federico entra con su cuenta y ve el shell de la app.

---

## F1 · El estudio y su proceso

El corazón. Sin esto no hay producto.

- [x] `studies` como entidad central, con las sesiones colgando de ella
- [x] Plantillas: `study_templates` → `template_stages` → `template_tasks` → archivos
- [x] Instanciación por copia: `create_study_from_template()`
- [x] Plantilla semilla con las diez etapas y sus 22 tareas
- [x] Plazos como desfase respecto a la fecha de terreno, con recálculo al moverla (D14)
- [x] Compuertas en la base: tarea bloqueante o archivo requerido impiden cerrar (D7)
- [x] Código de sesión `d{día}b{bloque}` generado por la base
- [x] Tipos TypeScript del schema
- [x] Lista de estudios y creación desde la plantilla
- [x] Vista de un estudio: etapa actual, qué falta para cerrarla, y cerrar para avanzar

**Entregable:** crear un estudio desde la plantilla, verlo en su etapa actual, y
avanzarlo a la siguiente.

**Cierre:** editar la plantilla no altera ningún estudio ya creado.

---

## F2 · Torre de control

La vista por la que abres la app cada mañana.

- [x] Panorama de todos los estudios activos, su etapa actual y su avance
- [x] Lo vencido y lo que vence esta semana al frente, ordenado por urgencia
- [x] Alertas derivadas de fechas y estados (D8), sin job que se pueda desincronizar
- [x] Entrar desde la alerta al estudio que la provoca

**Entregable:** una pantalla que responde "¿qué necesita mi atención hoy?" sin que
tengas que buscarlo.

**Cierre:** un estudio con una tarea vencida aparece marcado sin intervención de nadie.

---

## F3 · Checklists, responsables y compuertas

- [x] Tareas por etapa con fecha de vencimiento, marcables
- [x] Compuertas: una etapa no cierra con tareas bloqueantes ni archivos
  requeridos pendientes (D7), aplicadas por la base
- [x] Adjuntos por etapa en Supabase Storage (D15): subir, ver con URL firmada, quitar
- [x] Editar la fecha de terreno, con recálculo de la línea de tiempo
- [ ] Agregar y quitar tareas de un estudio
- [ ] Reprogramar una etapa suelta sin mover el terreno
- [ ] Historial de qué se cerró y cuándo

Responsables quedan fuera: hoy el usuario es uno solo y todas las tareas son suyas.

**Entregable:** intentar cerrar una etapa con un pendiente bloqueante y que la app
lo impida diciendo exactamente qué falta.

---

## F4 · Convocatoria

La etapa que más duele, y la primera que se automatiza.

- Leads: importar, filtrar por segmento, buscar
- Cupos por grupo y asignación de participantes
- Seguimiento de toques por canal y estado
- Plantillas de mensaje

**Entregable:** convocar un estudio real desde la app y ver el llenado de cupos en vivo.

---

## F5 · Sesiones y logística

Diseño detallado: [plans/2026-09-13-f5-f6.md](plans/2026-09-13-f5-f6.md)

- [x] Generar la agenda desde la forma del estudio: N días × M bloques, con
      vista previa de los códigos antes de confirmar
- [x] Grilla de días × bloques con fecha, sala, moderador y participantes,
      señalando qué falta en cada celda
- [x] `mic_number` por participante, único dentro de una sesión
- [ ] Participantes confirmados por sesión (llega con la convocatoria, F4)
- [ ] Guía del moderador y objetivo por sesión

**Entregable:** la agenda completa de un estudio, lista para ejecutar.

---

## F6 · Captura y procesamiento

Diseño detallado y partición en F6a/F6b/F6c:
[plans/2026-09-13-f5-f6.md](plans/2026-09-13-f5-f6.md)

El lado de escritorio, que transcodifica el video en local:
[plans/2026-09-13-wav-ingest-v3.md](plans/2026-09-13-wav-ingest-v3.md)

Acá recién entra el pipeline de medios, como etapa del proceso (D13).

- Subida de media a R2 (multi-fuente: 360°, DSLR, audio de sala, micrófonos)
- Pasos del pipeline como datos, re-corribles de a uno
- Artifacts de primera clase: un paso se salta si su salida ya existe y valida
- Transcripción y atribución de hablante

**F6a en curso.** Hecho: tabla `media_files` con la ubicación del master (D19),
bucket R2 `wav-intelligence-v2`, y el emparejador de archivos con bloque (D17) —
por código en el nombre, si no por hora de creación contra el horario del
bloque, y lo ambiguo queda para resolver a mano.

Falta: adaptador de R2, subida prefirmada y la grilla de bloques completándose.
Bloqueado por credenciales de R2 (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`);
sin ellas no hay forma de verificar el camino de subida.

**Entregable:** subir la grabación de una sesión real y leer su transcripción.

**Cierre:** un paso que falla se re-corre solo, sin repetir los ya completados.

---

## F7 · Análisis

- Temas y sentimiento por cita
- Hallazgos, barreras de compra, menciones de competencia
- Harness de evaluación de prompts — se construye **en esta fase**, no después

**Entregable:** los hallazgos de un estudio real, con sus citas de respaldo.

**Cierre:** el harness reporta un baseline. Cambiar un prompt muestra si mejoró o empeoró.

---

## F8 · Entrega

- Reporte y presentación
- Clips de video de las citas
- Vista de cliente (fuera del v1: hoy el único usuario es Federico)

**Entregable:** entregar un estudio real desde la app.

---

## F9 · Cierre

- Incentivos pagados, facturación, archivo del estudio

**Entregable:** un estudio llega a la última etapa y se archiva completo.

---

## Verificado contra datos vivos · 2026-09-13

F0 a F3 se construyeron desde un contenedor cuya política de egreso bloquea
`supabase.co`, así que el pegamento entre la app y Supabase quedó sin ejecutar
una sola petición real. **Eso ya se cerró.** Federico corrió los cinco pasos a
mano en su máquina y pasaron todos:

1. Registro — el primer usuario queda `admin`
2. Crear estudio con fecha de terreno — diez etapas con vencimientos calculados
3. Adjuntar el brief y marcar tareas — el archivo sube y se ve con URL firmada
4. Cerrar Brief — solo con todo cumplido; la compuerta bloquea y nombra qué falta
5. Mover el terreno — las etapas abiertas se recalculan, las cerradas conservan su fecha

Lo que sigue se construye sobre algo probado, no supuesto.

## Reglas de ejecución

- **TDD donde hay lógica.** Compuertas, alertas, instanciación de plantillas, RLS.
  No en componentes de presentación puros.
- **Una fase, una rama, PRs chicos.** Nada de batches de 40 commits.
- **Migraciones con timestamp**, `YYYYMMDDHHMMSS_slug.sql`. Dos ramas paralelas no
  pueden colisionar en el mismo número.
- **Advisors de Supabase después de todo DDL**, y dejarlos limpios antes de commitear.
- **`git add <rutas>` explícito.** Nunca `git add .` ni `git commit -a`.
- **Este roadmap es la fuente de verdad del estado.** Si una fase cambia de alcance,
  se edita acá primero.
