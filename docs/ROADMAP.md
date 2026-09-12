# Roadmap — WAV Intelligence v2

Cada fase cierra con algo **demostrable en pantalla**, no con "el módulo X está listo".
El orden sigue el valor para quien coordina: primero saber en qué estado está todo,
después automatizar los tramos.

Estado: `F0` · `F1` · `F2` cerradas · `F3 · Checklists, responsables y compuertas` es lo siguiente.

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

- Tareas por etapa con responsable y fecha de vencimiento
- Marcar hecho, reasignar, reprogramar
- Compuertas: una etapa no cierra con tareas bloqueantes ni archivos requeridos
  pendientes (D7)
- Adjuntos por etapa: brief del cliente, guía del moderador

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

- Sesiones dentro del estudio: fecha, hora, sala, moderador
- Participantes confirmados por sesión
- Guía del moderador y objetivo por sesión

**Entregable:** la agenda completa de un estudio, lista para ejecutar.

---

## F6 · Captura y procesamiento

Acá recién entra el pipeline de medios, como etapa del proceso (D13).

- Subida de media a R2 (multi-fuente: 360°, DSLR, audio de sala, micrófonos)
- Pasos del pipeline como datos, re-corribles de a uno
- Artifacts de primera clase: un paso se salta si su salida ya existe y valida
- Transcripción y atribución de hablante

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
