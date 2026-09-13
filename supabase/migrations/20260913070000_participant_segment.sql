-- El segmento del invitado: si ya es cliente de la marca o no.
--
-- No es dato administrativo: es la variable con la que se compara qué dicen los
-- que ya compraron contra los que no, que suele ser la pregunta del estudio.
-- Nullable porque el moderador y la gente de la marca no tienen segmento.
alter table public.participants
  add column segment text
    check (segment in ('client', 'non_client'));

comment on column public.participants.segment is
  'client / non_client para los invitados; null para moderador, marca y observadores.';
