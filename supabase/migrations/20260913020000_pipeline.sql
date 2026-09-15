-- F6b · El pipeline como datos.
--
-- Los pasos no son un array en el código del orquestador: son filas. Eso
-- permite re-correr uno solo, ver dónde se cayó una corrida de hace un mes, y
-- que WAV Ingest publique el resultado de un paso sin que la app se entere de
-- que lo hizo alguien más.

-- Los estados van como text con check y no como enum: cambian más seguido que
-- media_kind, y agregar un valor a un enum de Postgres no corre dentro de una
-- transacción, lo que complica cada despliegue.
create table public.pipeline_runs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'running', 'done', 'failed')),
  started_at  timestamptz,
  finished_at timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);

create index pipeline_runs_session_idx on public.pipeline_runs (session_id, created_at desc);

-- Una sola corrida viva por bloque. Dos orquestadores escribiendo los mismos
-- artifacts a la vez es la clase de carrera que solo se nota cuando el
-- resultado ya está mal.
create unique index pipeline_runs_one_active
  on public.pipeline_runs (session_id)
  where status in ('pending', 'running');

create table public.pipeline_steps (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.pipeline_runs (id) on delete cascade,
  name        text not null,
  position    smallint not null check (position > 0),
  status      text not null default 'pending'
                check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  attempt     smallint not null default 0 check (attempt >= 0),
  started_at  timestamptz,
  finished_at timestamptz,
  error       text,
  unique (run_id, name)
);

create index pipeline_steps_run_idx on public.pipeline_steps (run_id, position);

-- El casillero de salida de cada paso. La regla de F6b vive acá: un paso se
-- salta si y solo si su artifact ya existe. Sin esto, "¿ya se hizo?" se
-- respondería con un if distinto por paso repartido por el orquestador.
create table public.artifacts (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  -- session_inventory · transcription_plan · hls_manifest · transcript_json…
  -- Sin check a propósito: WAV Ingest publica artifacts por su cuenta y no
  -- debería necesitar una migración de la app para estrenar un tipo nuevo.
  kind        text not null,
  storage_key text not null,
  producer    text not null check (producer in ('local', 'cloud')),
  checksum    text,
  bytes       bigint,
  created_at  timestamptz not null default now(),
  unique (session_id, kind)
);

create index artifacts_session_idx on public.artifacts (session_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Una policy por comando y no una `for all` más una de lectura: dos policies
-- permisivas sobre el mismo comando se evalúan las dos en cada fila.

alter table public.pipeline_runs  enable row level security;
alter table public.pipeline_steps enable row level security;
alter table public.artifacts      enable row level security;

create policy pipeline_runs_select_via_session on public.pipeline_runs
  for select to authenticated using (private.can_read_session(session_id));
create policy pipeline_runs_insert_admin on public.pipeline_runs
  for insert to authenticated with check ((select private.is_admin()));
create policy pipeline_runs_update_admin on public.pipeline_runs
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy pipeline_runs_delete_admin on public.pipeline_runs
  for delete to authenticated using ((select private.is_admin()));

create policy pipeline_steps_select_via_run on public.pipeline_steps
  for select to authenticated using (
    exists (
      select 1 from public.pipeline_runs r
      where r.id = run_id and private.can_read_session(r.session_id)
    )
  );
create policy pipeline_steps_insert_admin on public.pipeline_steps
  for insert to authenticated with check ((select private.is_admin()));
create policy pipeline_steps_update_admin on public.pipeline_steps
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy pipeline_steps_delete_admin on public.pipeline_steps
  for delete to authenticated using ((select private.is_admin()));

create policy artifacts_select_via_session on public.artifacts
  for select to authenticated using (private.can_read_session(session_id));
create policy artifacts_insert_admin on public.artifacts
  for insert to authenticated with check ((select private.is_admin()));
create policy artifacts_update_admin on public.artifacts
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy artifacts_delete_admin on public.artifacts
  for delete to authenticated using ((select private.is_admin()));
