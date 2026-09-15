-- Plantilla semilla: el ciclo estándar de un estudio.
-- Esto es DATO, no schema (D6). Corregir una etapa o una tarea es editar una
-- fila desde la app, no migrar la base.
--
-- offset_days son días respecto a la fecha de terreno: negativo antes, positivo después.

with tpl as (
  insert into public.study_templates (name, description, is_default)
  values ('Focus group estándar',
          'Ciclo completo de un estudio, del brief del cliente al archivo.',
          true)
  returning id
), stages as (
  insert into public.template_stages (template_id, position, name, offset_days)
  select tpl.id, s.position, s.name, s.offset_days
  from tpl, (values
    ( 1, 'Brief',         -45),
    ( 2, 'Diseño',        -30),
    ( 3, 'Convocatoria',  -14),
    ( 4, 'Logística',      -7),
    ( 5, 'Ejecución',       0),
    ( 6, 'Procesamiento',   3),
    ( 7, 'Análisis',        7),
    ( 8, 'Revisión',       10),
    ( 9, 'Entrega',        14),
    (10, 'Cierre',         21)
  ) as s(position, name, offset_days)
  returning id, position
)
insert into public.template_tasks (template_stage_id, position, name, is_blocking)
select st.id, t.position, t.name, t.is_blocking
from stages st
join (values
  ( 1, 1, 'Recibir brief del cliente',              true),
  ( 1, 2, 'Acordar fecha de terreno',               true),
  ( 2, 1, 'Definir segmentos y número de grupos',   true),
  ( 2, 2, 'Escribir guía del moderador',            true),
  ( 2, 3, 'Definir estructura de días y bloques',   true),
  ( 3, 1, 'Cargar listado de invitados',            true),
  ( 3, 2, 'Asignar invitados a bloques',            true),
  ( 3, 3, 'Confirmar cupos de todos los bloques',   true),
  ( 3, 4, 'Asignar micrófono a cada invitado',     false),
  ( 4, 1, 'Reservar sala',                          true),
  ( 4, 2, 'Confirmar equipo de grabación',          true),
  ( 4, 3, 'Asignar moderador por bloque',          false),
  ( 5, 1, 'Realizar todos los bloques',             true),
  ( 5, 2, 'Respaldar grabaciones',                  true),
  ( 6, 1, 'Subir grabaciones de todos los bloques', true),
  ( 6, 2, 'Transcribir',                            true),
  ( 7, 1, 'Extraer hallazgos',                      true),
  ( 8, 1, 'Validar citas contra el audio',          true),
  ( 8, 2, 'Corregir reporte',                       true),
  ( 9, 1, 'Enviar reporte al cliente',              true),
  ( 9, 2, 'Presentar resultados',                  false),
  (10, 1, 'Archivar material del estudio',         false)
) as t(stage_position, position, name, is_blocking)
  on t.stage_position = st.position;

-- Archivos que actúan de compuerta: sin ellos la etapa no cierra.
insert into public.template_stage_files (template_stage_id, label, is_required)
select ts.id, f.label, true
from public.study_templates tpl
join public.template_stages ts on ts.template_id = tpl.id
join (values
  (1, 'Brief del cliente'),
  (2, 'Guía del focus'),
  (3, 'Listado de invitados')
) as f(stage_position, label) on f.stage_position = ts.position
where tpl.is_default;
