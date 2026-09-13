# Diseño · Grabaciones cortadas en partes

Los equipos no entregan un archivo por grabación. Un Insta360 corta el 360 en
segmentos; una grabadora multipista corta el audio cuando llega al límite de
tamaño, o cuando alguien la detiene entre ejercicios y la vuelve a arrancar.

Hasta ahora el modelo asumía **un archivo por fuente y por bloque**. No es
cierto, y arreglarlo tarde significaría reprocesar material irrepetible.

---

## Lo confirmado

- Los nombres llegan **nativos del equipo**: `VID_20261110_130000_00_001.insv`,
  `ZOOM0001_Tr3.WAV`, `DR0000_0002.wav`. Sin el código `d1b1` encima.
- Las partes **a veces son continuas y a veces no**. La grabadora corta sola
  (nada se perdió) o alguien la detuvo (hay minutos que no existen). Cambia
  según el día, así que la app no puede asumir ninguna de las dos.

## Lo que se decide acá

### 1 · Las partes no se pegan físicamente

Mover gigabytes dos veces para producir un archivo que se usa una vez es caro y
frágil. Las partes suben tal cual; lo que se guarda es **a qué grabación
pertenece cada una y en qué orden**. La transcripción las recorre en secuencia
desplazando los tiempos.

El archivo unido, si alguna vez hace falta —exportar un clip que cruza el corte—
es un paso del pipeline con su artifact, igual que todo lo demás (D20). No una
precondición para empezar.

Excepción: **el video 360 sí se une**, porque ya se transcodifica de todos modos
(D19). Unir los segmentos es un argumento más del mismo `ffmpeg`, no un viaje
extra de datos. Eso ocurre en WAV Ingest, y su diseño v3 **no lo contempla
todavía** — hay que corregirlo.

### 2 · El agrupador propone, la persona confirma

Se derivan candidatos del nombre y del horario, y se muestran agrupados **antes
de subir**. Nada se agrupa en silencio: juntar dos grabaciones distintas bajo un
mismo invitado corrompe la atribución de forma invisible, que es la peor clase
de error en este sistema.

Familias de nombres que el agrupador reconoce:

| Equipo | Forma | Grabación | Parte | Pista |
|---|---|---|---|---|
| Insta360 | `VID_20261110_130000_00_001.insv` | `VID_{fecha}_{hora}` | `_{001}` | `_{00}` = lente |
| Zoom H-series | `ZOOM0001_Tr3.WAV` | `ZOOM{0001}` | por toma | `Tr{3}` = micrófono |
| Tascam DR | `DR0000_0002.wav` | `DR{0000}` | `_{0002}` | — |
| Genérico | `loquesea-002.wav` | el nombre sin el número | número final | — |

Lo que no calce con ninguna cae en la bandeja de siempre y se agrupa a mano.
Un nombre desconocido es un patrón que falta, no un archivo que sobra.

### 3 · Los tiempos salen del reloj, no de la suma

Sumar duraciones asume continuidad, y la continuidad no está garantizada. Cada
parte guarda **cuándo se grabó** (`recorded_at`, de la marca del archivo) y su
duración. El desfase de la parte *n* es la distancia real entre su inicio y el
inicio de la primera.

Cuando esa distancia coincide con la suma de duraciones, el corte fue del
equipo y no se perdió nada. Cuando no coincide, hubo una pausa — y **se muestra
cuánto**, en vez de esconderla dentro de un cálculo. El operador ve "4 min sin
grabar entre la parte 2 y la 3" y decide si eso es correcto.

Sin marca de tiempo utilizable se cae a la suma de duraciones y se dice que se
está asumiendo continuidad. Asumir en silencio es lo único que no se hace.

---

## Cambios de esquema

```sql
alter table public.media_files
  add column recording_key text,        -- qué grabación: del nombre o a mano
  add column part_number   smallint,    -- orden dentro de la grabación
  add column recorded_at   timestamptz; -- cuándo se capturó esta parte

-- Dos partes con el mismo número en la misma grabación es una contradicción.
create unique index media_files_recording_part
  on public.media_files (session_id, recording_key, part_number)
  where recording_key is not null;
```

Las tres son nullable: un archivo entero sigue siendo un archivo entero, y el
material ya subido no se invalida.

## Lo que no cambia

- La grilla sigue mostrando bloques, no partes. Una grabación de cinco partes es
  **una fila**, desplegable. El operador piensa en "el micrófono de Carolina",
  no en cinco archivos.
- El emparejador con bloque (D17) sigue igual: se aplica a la grabación completa
  y no a cada parte. Todas las partes de una grabación van al mismo bloque, por
  definición.
- El plan de transcripción gana una lista ordenada de partes con su desfase por
  fuente, en vez de una sola clave.
