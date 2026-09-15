-- Aplica en una transacción el plan de sincronización de la convocatoria (D26).
-- El plan lo calcula el servidor; esta función solo escribe, y si algo falla no
-- queda un estudio a medio cargar.
create or replace function public.apply_roster_sync(p_study_id uuid, p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_block   jsonb;
  v_session uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede importar la convocatoria.';
  end if;

  insert into public.sessions (study_id, day_number, block_number, name, scheduled_at)
  select p_study_id,
         (s ->> 'day_number')::smallint,
         (s ->> 'block_number')::smallint,
         s ->> 'name',
         (s ->> 'scheduled_at')::timestamptz
  from jsonb_array_elements(coalesce(p_plan -> 'create_sessions', '[]'::jsonb)) as s;

  update public.sessions as t
  set scheduled_at = (s ->> 'scheduled_at')::timestamptz,
      updated_at   = now()
  from jsonb_array_elements(coalesce(p_plan -> 'update_sessions', '[]'::jsonb)) as s
  where t.id = (s ->> 'id')::uuid
    and t.study_id = p_study_id;

  for v_block in
    select value from jsonb_array_elements(coalesce(p_plan -> 'blocks', '[]'::jsonb))
  loop
    select id into v_session
    from public.sessions
    where study_id = p_study_id
      and day_number = (v_block ->> 'day_number')::smallint
      and block_number = (v_block ->> 'block_number')::smallint;

    if v_session is null then
      raise exception 'El bloque día % · bloque % no existe en el estudio.',
        v_block ->> 'day_number', v_block ->> 'block_number';
    end if;

    delete from public.participants
    where session_id = v_session
      and id in (select value::uuid from jsonb_array_elements_text(coalesce(v_block -> 'remove', '[]'::jsonb)));

    -- El micrófono es único por bloque: se libera antes de reasignarlo, o un
    -- intercambio entre dos personas choca a mitad de la actualización.
    update public.participants
    set mic_number = null
    where session_id = v_session
      and id in (select (u ->> 'id')::uuid from jsonb_array_elements(coalesce(v_block -> 'update', '[]'::jsonb)) as u);

    update public.participants as p
    set name       = u ->> 'name',
        mic_number = (u ->> 'mic_number')::smallint,
        role       = u ->> 'role',
        segment    = u ->> 'segment'
    from jsonb_array_elements(coalesce(v_block -> 'update', '[]'::jsonb)) as u
    where p.session_id = v_session
      and p.id = (u ->> 'id')::uuid;

    insert into public.participants (session_id, name, mic_number, role, segment)
    select v_session,
           a ->> 'name',
           (a ->> 'mic_number')::smallint,
           a ->> 'role',
           a ->> 'segment'
    from jsonb_array_elements(coalesce(v_block -> 'add', '[]'::jsonb)) as a;
  end loop;
end;
$$;

revoke all on function public.apply_roster_sync(uuid, jsonb) from public, anon;
grant execute on function public.apply_roster_sync(uuid, jsonb) to authenticated;
