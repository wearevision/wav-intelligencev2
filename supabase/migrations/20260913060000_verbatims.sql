-- F6c · Lo que se dijo, quién lo dijo y cuándo.
--
-- start_ts y end_ts van en segundos desde el inicio del **bloque**, no del
-- archivo. Un bloque son varias partes y a veces con pausas en medio; guardar
-- el tiempo relativo al archivo obligaría a rehacer la suma cada vez que
-- alguien quiera saltar a un momento, y a equivocarse en algún lugar.
--
-- numeric y no float: los tiempos se comparan y se ordenan, y un 12.3 que a
-- veces es 12.299999 convierte "el mismo instante" en dos instantes.
create table public.verbatims (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  -- Quién habló. Null cuando no se pudo atribuir: es un dato que falta, no un
  -- error, y el texto sirve igual.
  participant_id uuid references public.participants (id) on delete set null,
  -- Lo que dijo el diarizador antes de saber el nombre: "SPEAKER_02". Se
  -- conserva aunque haya participante, para poder revisar la atribución.
  speaker_label  text,
  start_ts       numeric(10, 3) not null check (start_ts >= 0),
  end_ts         numeric(10, 3) not null,
  text           text not null,
  -- De qué archivo salió, para poder rehacer una parte sin tocar el resto.
  media_file_id  uuid references public.media_files (id) on delete set null,
  confidence     real check (confidence >= 0 and confidence <= 1),
  created_at     timestamptz not null default now(),
  constraint verbatims_range check (end_ts >= start_ts)
);

create index verbatims_session_idx on public.verbatims (session_id, start_ts);
create index verbatims_participant_idx on public.verbatims (participant_id);
create index verbatims_media_file_idx on public.verbatims (media_file_id);

alter table public.verbatims enable row level security;

create policy verbatims_select_via_session on public.verbatims
  for select to authenticated using (private.can_read_session(session_id));
create policy verbatims_insert_admin on public.verbatims
  for insert to authenticated with check ((select private.is_admin()));
create policy verbatims_update_admin on public.verbatims
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy verbatims_delete_admin on public.verbatims
  for delete to authenticated using ((select private.is_admin()));
