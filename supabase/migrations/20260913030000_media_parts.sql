-- Los equipos cortan las grabaciones en partes: el Insta360 segmenta el 360, la
-- grabadora parte el audio al llegar al límite de tamaño o cuando alguien la
-- detiene entre ejercicios. El modelo asumía un archivo por fuente y no lo es.
--
-- Las tres columnas son nullable: un archivo entero sigue siendo un archivo
-- entero, y lo ya subido no se invalida.

alter table public.media_files
  -- Qué grabación: derivado del nombre nativo del equipo, o asignado a mano.
  add column recording_key text,
  add column part_number   smallint check (part_number > 0),
  -- Cuándo se capturó esta parte. Los desfases salen de acá y no de sumar
  -- duraciones: sumar asume continuidad, y a veces hubo una pausa real.
  add column recorded_at   timestamptz;

-- Dos partes con el mismo número dentro de una grabación es una contradicción.
create unique index media_files_recording_part
  on public.media_files (session_id, recording_key, part_number)
  where recording_key is not null;

-- Para desplegar una grabación en orden sin ordenar en memoria.
create index media_files_recording_idx
  on public.media_files (session_id, recording_key, part_number)
  where recording_key is not null;
