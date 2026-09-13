-- F5 · Logística por bloque y micrófono por participante.
--
-- moderator_name es texto y no una referencia a profiles a propósito: los
-- moderadores son externos y no tienen cuenta (ver SPEC). session_moderators
-- sigue existiendo para cuando la tengan; hoy es maquinaria dormida.
alter table public.sessions
  add column moderator_name text;

-- mic_number se puebla en la convocatoria (F4), pero la columna entra acá
-- porque el procesamiento (F6) la necesita para atribuir quién habla.
alter table public.participants
  add column mic_number smallint check (mic_number > 0);

-- Dos personas no pueden compartir micrófono en la misma sesión: si pasara,
-- la atribución de verbatims sería ambigua y nada lo detectaría.
create unique index participants_session_mic
  on public.participants (session_id, mic_number)
  where mic_number is not null;
