-- Bucket privado para los documentos de etapa: brief, guía del focus, listado
-- de invitados. Son archivos chicos y de acceso puntual, así que viven en
-- Supabase Storage y no requieren credenciales de un proveedor extra. El media
-- pesado (video 360, audio por bloque) irá a R2 cuando llegue F6.
insert into storage.buckets (id, name, public, file_size_limit)
values ('study-files', 'study-files', false, 26214400)
on conflict (id) do nothing;

-- Solo admin. Igual que las tablas del estudio: con un usuario único no se
-- inventa acceso que nadie usa.
create policy study_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'study-files' and (select private.is_admin()));

create policy study_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-files' and (select private.is_admin()));

create policy study_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'study-files' and (select private.is_admin()))
  with check (bucket_id = 'study-files' and (select private.is_admin()));

create policy study_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-files' and (select private.is_admin()));
