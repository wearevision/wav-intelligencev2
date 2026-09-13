-- Quién es cada persona en la sala.
--
-- No es un dato administrativo: decide qué entra al análisis. El moderador y la
-- gente de la marca también llevan micrófono, y sus palabras no son opinión de
-- consumidor. Sin esta columna, una pregunta del moderador contaría como
-- sentimiento del grupo y nadie lo notaría — el promedio simplemente saldría
-- mal.
alter table public.participants
  add column role text not null default 'participant'
    check (role in ('participant', 'moderator', 'brand_staff', 'observer'));

comment on column public.participants.role is
  'participant cuenta en el análisis; moderator, brand_staff y observer no.';
