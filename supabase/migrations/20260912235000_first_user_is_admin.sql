-- El primer usuario del sistema queda como admin.
-- Es una instancia de un solo dueño: así nadie tiene que sembrar credenciales
-- ni pasar contraseñas por un canal que no corresponde. Del segundo en adelante
-- vuelve a regir el fail-closed: rol desde los metadatos de invitación, y si no
-- viene, 'moderator', que sin sesiones asignadas no ve nada.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  if not exists (select 1 from public.profiles) then
    v_role := 'admin'::public.user_role;
  else
    v_role := coalesce(
      nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role,
      'moderator'::public.user_role
    );
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    v_role
  );
  return new;
end;
$$;
