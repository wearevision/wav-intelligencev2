-- F6a · El material capturado en terreno.
create type public.media_kind as enum
  ('video_360', 'video_dslr', 'audio_room', 'audio_mic', 'audio_ambient');

create table public.media_files (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions (id) on delete cascade,
  kind              public.media_kind not null,
  storage_key       text not null unique,
  original_filename text not null,
  bytes             bigint,
  duration_seconds  integer,
  -- Solo para audio_mic: qué micrófono, y por tanto qué participante.
  mic_number        smallint check (mic_number > 0),
  checksum          text,
  -- Dónde quedó el master que nunca subió (D19). Sin esto el original se
  -- vuelve inencontrable: el video 360 se transcodifica local y no viaja.
  source_path       text,
  source_host       text,
  created_at        timestamptz not null default now()
);

create index media_files_session_idx on public.media_files (session_id);

-- Idempotencia: re-subir el mismo archivo al mismo bloque no lo duplica.
create unique index media_files_session_checksum
  on public.media_files (session_id, checksum)
  where checksum is not null;

alter table public.media_files enable row level security;

create policy media_files_admin on public.media_files
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
