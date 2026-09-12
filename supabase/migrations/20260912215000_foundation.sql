-- F0 · Fundación
-- Roles planos (D4), sin multi-tenancy (D3). Tablas núcleo + RLS por rol.

create type public.user_role as enum ('admin', 'client', 'moderator');
create type public.session_status as enum ('scheduled', 'uploaded', 'processing', 'ready', 'error');

-- Schema no publicado por PostgREST: los helpers viven acá para que no queden
-- expuestos como endpoints /rest/v1/rpc/*. Son security definer, así que un
-- helper alcanzable desde afuera sería una escalada de privilegios servida.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        public.user_role not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.profiles.role is
  'Fuente de verdad del rol (D4). Se espeja al JWT via custom_access_token_hook.';

create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           public.session_status not null default 'scheduled',
  scheduled_at     timestamptz,
  venue            text,
  objective        text,
  moderator_guide  text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.participants (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  name        text not null,
  seat_number smallint,
  created_at  timestamptz not null default now(),
  unique (session_id, seat_number)
);

-- Asignación de moderadores: define qué ve un rol 'moderator'.
create table public.session_moderators (
  session_id  uuid not null references public.sessions (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

create index participants_session_id_idx      on public.participants (session_id);
create index session_moderators_profile_id_idx on public.session_moderators (profile_id);
create index sessions_status_idx              on public.sessions (status);
create index sessions_created_by_idx          on public.sessions (created_by);

-- ── Helpers de autorización ────────────────────────────────────────────────
-- security definer a propósito: leen profiles sin disparar RLS, evitando la
-- recursión clásica (una policy sobre profiles que vuelve a leer profiles).

create or replace function private.app_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'user_role', '')::public.user_role,
    (select p.role from public.profiles p where p.id = auth.uid())
  )
$$;

comment on function private.app_user_role() is
  'Rol del usuario actual. Prefiere el claim del JWT; cae a profiles si el hook no está activo.';

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.app_user_role() = 'admin'
$$;

create or replace function private.is_assigned_moderator(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session_moderators sm
    where sm.session_id = p_session_id
      and sm.profile_id = auth.uid()
  )
$$;

create or replace function private.can_read_session(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case private.app_user_role()
    when 'admin'     then true
    when 'client'    then exists (
                          select 1 from public.sessions s
                          where s.id = p_session_id and s.status = 'ready')
    when 'moderator' then private.is_assigned_moderator(p_session_id)
    else false
  end
$$;

grant execute on function private.app_user_role()             to authenticated;
grant execute on function private.is_admin()                  to authenticated;
grant execute on function private.is_assigned_moderator(uuid) to authenticated;
grant execute on function private.can_read_session(uuid)      to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- auth.uid() y los helpers van envueltos en (select …) para que Postgres los
-- evalúe una vez por consulta y no una vez por fila.
-- can_read_session(id) es la excepción: depende de la fila, no se puede izar.

alter table public.profiles           enable row level security;
alter table public.sessions           enable row level security;
alter table public.participants       enable row level security;
alter table public.session_moderators enable row level security;

-- profiles: cada uno se ve a sí mismo; admin ve y administra a todos.
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check ((select private.is_admin()));

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using ((select private.is_admin()));

-- sessions: admin todo · client solo 'ready' · moderator solo las asignadas.
create policy sessions_select_by_role on public.sessions
  for select to authenticated
  using (private.can_read_session(id));

create policy sessions_insert_admin on public.sessions
  for insert to authenticated with check ((select private.is_admin()));
create policy sessions_update_admin on public.sessions
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy sessions_delete_admin on public.sessions
  for delete to authenticated using ((select private.is_admin()));

-- participants: visibles si la sesión padre es visible.
create policy participants_select_via_session on public.participants
  for select to authenticated
  using (private.can_read_session(session_id));

create policy participants_insert_admin on public.participants
  for insert to authenticated with check ((select private.is_admin()));
create policy participants_update_admin on public.participants
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy participants_delete_admin on public.participants
  for delete to authenticated using ((select private.is_admin()));

-- session_moderators: el moderador ve sus asignaciones; solo admin asigna.
create policy session_moderators_select on public.session_moderators
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_admin()));

create policy session_moderators_insert_admin on public.session_moderators
  for insert to authenticated with check ((select private.is_admin()));
create policy session_moderators_delete_admin on public.session_moderators
  for delete to authenticated using ((select private.is_admin()));

-- ── updated_at ─────────────────────────────────────────────────────────────

create or replace function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function private.touch_updated_at();

-- ── Alta de usuario ────────────────────────────────────────────────────────
-- El rol sale de los metadatos de la invitación. Si no viene, cae a 'moderator':
-- es el rol fail-closed, porque un moderador sin sesiones asignadas no ve nada.
-- Un 'client' por defecto expondría todas las sesiones listas a cualquier alta.

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(
      nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role,
      'moderator'::public.user_role
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Nadie sube su propio rol: solo un admin (o el service role) puede cambiarlo.
create or replace function private.guard_profile_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and not (private.is_admin() or auth.role() = 'service_role') then
    raise exception 'solo un admin puede cambiar el rol de un perfil';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function private.guard_profile_role();

-- ── Hook de access token ───────────────────────────────────────────────────
-- Copia el rol al JWT para que las policies lean un claim en vez de consultar
-- profiles en cada fila. Vive en public porque Auth lo referencia por nombre
-- calificado, pero sin execute para anon/authenticated. Requiere activarse en
-- Auth → Hooks; hasta entonces app_user_role() cae al lookup y todo funciona
-- igual, solo que más lento.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  claims jsonb;
  found_role public.user_role;
begin
  select p.role into found_role
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if found_role is not null then
    claims := jsonb_set(claims, '{app_metadata,user_role}', to_jsonb(found_role::text), true);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on table public.profiles to supabase_auth_admin;
