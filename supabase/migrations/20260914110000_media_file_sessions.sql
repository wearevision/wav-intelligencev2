-- Un archivo de audio puede pertenecer a dos sesiones cuando el mic no
-- cambió de dueño entre dos bloques (carpetas "B1+B2" en la fuente local).
-- media_files.session_id sigue siendo la sesión principal; esta tabla es
-- solo el vínculo extra, y nada de lo que hoy lee media_files por
-- session_id se ve afectado.
create table public.media_file_sessions (
  media_file_id uuid not null references public.media_files(id) on delete cascade,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (media_file_id, session_id)
);

create index media_file_sessions_session_idx on public.media_file_sessions (session_id);

alter table public.media_file_sessions enable row level security;

create policy media_file_sessions_admin on public.media_file_sessions
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
