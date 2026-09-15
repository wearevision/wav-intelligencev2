-- F1 · El estudio y su proceso
-- El estudio es la unidad que avanza (D5). Las etapas y tareas se instancian
-- copiando una plantilla (D6). Compuertas por tarea bloqueante y archivo
-- requerido (D7). Los plazos cuelgan de la fecha de terreno (D14).

create type public.stage_status  as enum ('pending', 'in_progress', 'done', 'skipped');
create type public.study_status  as enum ('active', 'archived');

-- ── Plantillas ─────────────────────────────────────────────────────────────

create table public.study_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Solo una plantilla por defecto: el índice parcial cubre únicamente las filas
-- con is_default = true, así que la unicidad sobre esa columna permite una sola.
create unique index study_templates_one_default
  on public.study_templates (is_default) where is_default;

create table public.template_stages (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.study_templates (id) on delete cascade,
  position    smallint not null,
  name        text not null,
  -- Días respecto a la fecha de terreno: negativo antes, positivo después.
  offset_days integer not null,
  unique (template_id, position)
);

create table public.template_tasks (
  id                uuid primary key default gen_random_uuid(),
  template_stage_id uuid not null references public.template_stages (id) on delete cascade,
  position          smallint not null,
  name              text not null,
  is_blocking       boolean not null default false,
  -- Si es null, la tarea vence junto con su etapa.
  offset_days       integer,
  unique (template_stage_id, position)
);

create table public.template_stage_files (
  id                uuid primary key default gen_random_uuid(),
  template_stage_id uuid not null references public.template_stages (id) on delete cascade,
  label             text not null,
  is_required       boolean not null default true,
  unique (template_stage_id, label)
);

-- ── El estudio ─────────────────────────────────────────────────────────────

create table public.studies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  client_name     text,
  -- El ancla de toda la línea de tiempo (D14).
  fieldwork_start date,
  status          public.study_status not null default 'active',
  -- Informativo: de qué plantilla nació. La copia ya es independiente.
  template_id     uuid references public.study_templates (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.study_stages (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references public.studies (id) on delete cascade,
  position     smallint not null,
  name         text not null,
  status       public.stage_status not null default 'pending',
  -- Se conserva el desfase, no solo la fecha: mover el terreno recalcula (D14).
  offset_days  integer not null,
  due_on       date,
  completed_at timestamptz,
  unique (study_id, position)
);

create table public.study_tasks (
  id             uuid primary key default gen_random_uuid(),
  study_stage_id uuid not null references public.study_stages (id) on delete cascade,
  position       smallint not null,
  name           text not null,
  is_blocking    boolean not null default false,
  offset_days    integer,
  due_on         date,
  done_at        timestamptz,
  unique (study_stage_id, position)
);

create table public.study_stage_files (
  id             uuid primary key default gen_random_uuid(),
  study_stage_id uuid not null references public.study_stages (id) on delete cascade,
  label          text not null,
  is_required    boolean not null default true,
  -- Null mientras no se adjunta. Un requerido sin key bloquea el cierre.
  storage_key    text,
  filename       text,
  bytes          bigint,
  uploaded_at    timestamptz,
  unique (study_stage_id, label)
);

create index template_stages_template_idx     on public.template_stages (template_id);
create index template_tasks_stage_idx         on public.template_tasks (template_stage_id);
create index template_stage_files_stage_idx   on public.template_stage_files (template_stage_id);
create index study_stages_study_idx           on public.study_stages (study_id);
create index study_tasks_stage_idx            on public.study_tasks (study_stage_id);
create index study_stage_files_stage_idx      on public.study_stage_files (study_stage_id);
create index studies_status_idx               on public.studies (status);
create index studies_template_idx             on public.studies (template_id);
create index studies_created_by_idx           on public.studies (created_by);

-- ── Las sesiones pasan a vivir dentro de un estudio ────────────────────────
-- d{día}b{bloque}: b1 = AM, b2 = PM. El código lo genera la base, no la persona.

alter table public.sessions
  add column study_id     uuid references public.studies (id) on delete cascade,
  add column day_number   smallint check (day_number > 0),
  add column block_number smallint check (block_number > 0),
  add column code text generated always as (
    case when day_number is not null and block_number is not null
      then 'd' || day_number::text || 'b' || block_number::text
    end
  ) stored;

create unique index sessions_study_day_block
  on public.sessions (study_id, day_number, block_number)
  where study_id is not null;

create index sessions_study_idx on public.sessions (study_id);

-- ── Compuertas ─────────────────────────────────────────────────────────────

create or replace function private.stage_blockers(p_stage_id uuid)
returns table (kind text, detail text)
language sql stable security definer set search_path = ''
as $$
  select 'task', t.name
  from public.study_tasks t
  where t.study_stage_id = p_stage_id and t.is_blocking and t.done_at is null
  union all
  select 'file', f.label
  from public.study_stage_files f
  where f.study_stage_id = p_stage_id and f.is_required and f.storage_key is null
$$;

create or replace function private.stage_can_close(p_stage_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from private.stage_blockers(p_stage_id))
$$;

grant execute on function private.stage_blockers(uuid) to authenticated;
grant execute on function private.stage_can_close(uuid) to authenticated;

-- La compuerta se hace cumplir en la base, no solo en la UI.
create or replace function private.enforce_stage_gate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  missing text;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    select string_agg(detail, ', ') into missing
    from private.stage_blockers(new.id);

    if missing is not null then
      raise exception 'La etapa "%" no puede cerrarse. Falta: %', new.name, missing
        using errcode = 'check_violation';
    end if;

    new.completed_at := now();
  elsif new.status is distinct from 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger study_stages_enforce_gate
  before update on public.study_stages
  for each row execute function private.enforce_stage_gate();

-- ── Recálculo al mover el terreno (D14) ────────────────────────────────────
-- Lo ya cumplido no se toca: lo que pasó, pasó.

create or replace function private.recalc_study_dates()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.fieldwork_start is distinct from old.fieldwork_start then
    update public.study_stages s
       set due_on = new.fieldwork_start + s.offset_days
     where s.study_id = new.id and s.status <> 'done';

    update public.study_tasks t
       set due_on = new.fieldwork_start + coalesce(t.offset_days, s.offset_days)
      from public.study_stages s
     where t.study_stage_id = s.id and s.study_id = new.id and t.done_at is null;
  end if;
  return new;
end;
$$;

create trigger studies_recalc_dates
  after update on public.studies
  for each row execute function private.recalc_study_dates();

create trigger studies_touch_updated_at
  before update on public.studies
  for each row execute function private.touch_updated_at();

create trigger study_templates_touch_updated_at
  before update on public.study_templates
  for each row execute function private.touch_updated_at();

-- ── Instanciación: copiar, no referenciar (D6) ─────────────────────────────

create or replace function public.create_study_from_template(
  p_name            text,
  p_template_id     uuid,
  p_client_name     text default null,
  p_fieldwork_start date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_study_id uuid;
begin
  insert into public.studies (name, client_name, fieldwork_start, template_id, created_by)
  values (p_name, p_client_name, p_fieldwork_start, p_template_id, auth.uid())
  returning id into v_study_id;

  with new_stages as (
    insert into public.study_stages (study_id, position, name, offset_days, due_on)
    select v_study_id, ts.position, ts.name, ts.offset_days,
           case when p_fieldwork_start is not null
                then p_fieldwork_start + ts.offset_days end
    from public.template_stages ts
    where ts.template_id = p_template_id
    returning id, position
  )
  insert into public.study_tasks
    (study_stage_id, position, name, is_blocking, offset_days, due_on)
  select ns.id, tt.position, tt.name, tt.is_blocking, tt.offset_days,
         case when p_fieldwork_start is not null
              then p_fieldwork_start + coalesce(tt.offset_days, ts.offset_days) end
  from new_stages ns
  join public.template_stages ts
    on ts.template_id = p_template_id and ts.position = ns.position
  join public.template_tasks tt on tt.template_stage_id = ts.id;

  insert into public.study_stage_files (study_stage_id, label, is_required)
  select ss.id, tsf.label, tsf.is_required
  from public.study_stages ss
  join public.template_stages ts
    on ts.template_id = p_template_id and ts.position = ss.position
  join public.template_stage_files tsf on tsf.template_stage_id = ts.id
  where ss.study_id = v_study_id;

  return v_study_id;
end;
$$;

grant execute on function public.create_study_from_template(text, uuid, text, date)
  to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Usuario único hoy: todo es de admin. Cuando entren cliente o moderador,
-- estas policies se abren; hoy no se inventa acceso que nadie usa.

alter table public.study_templates      enable row level security;
alter table public.template_stages      enable row level security;
alter table public.template_tasks       enable row level security;
alter table public.template_stage_files enable row level security;
alter table public.studies              enable row level security;
alter table public.study_stages         enable row level security;
alter table public.study_tasks          enable row level security;
alter table public.study_stage_files    enable row level security;

create policy study_templates_admin      on public.study_templates
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy template_stages_admin      on public.template_stages
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy template_tasks_admin       on public.template_tasks
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy template_stage_files_admin on public.template_stage_files
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy studies_admin              on public.studies
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy study_stages_admin         on public.study_stages
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy study_tasks_admin          on public.study_tasks
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy study_stage_files_admin    on public.study_stage_files
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
