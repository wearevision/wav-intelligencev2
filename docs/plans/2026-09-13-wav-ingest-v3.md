# Diseño · WAV Ingest v3

WAV Ingest es la app de escritorio (Tauri) que convierte lo capturado en terreno
en algo que la nube pueda usar, **sin mandar el material crudo**. La v3 es la que
apunta a `wav-intelligencev2`.

Este documento vive acá porque define un contrato de dos lados y el lado de v2 se
implementa en este repo. La app misma está en `wearevision/wav-ingest`.

---

## Su trabajo, en una frase

Mirar una carpeta de captura, entender a qué bloque pertenece cada archivo,
transcodificar el video en la máquina, subir solo lo liviano, y dejar anotado
dónde quedó el original.

Lo que **no** hace: transcribir, analizar, ni decidir nada del proceso del
estudio. Mantenerla angosta es lo que la hace mantenible.

---

## Por qué no se puede compilar todavía

La v3 habla con endpoints que **aún no existen** en v2: no hay tabla
`media_files`, ni bucket R2, ni ruta de ingesta. Eso es F6a. Compilar antes
produce una app que le habla al backend anterior.

Orden: F5 → F6a en v2 → v3 de WAV Ingest.

---

## El contrato con v2

Cuatro rutas, todas autenticadas como el usuario. **Ya existen en v2** —
`src/app/api/` — y son lo primero que hacía falta: una app de escritorio no
puede llamar server actions, así que hasta ahora no tenía con qué hablar.

| Ruta | Para qué |
|---|---|
| `GET /api/studies` | Los estudios activos, para elegir sobre cuál trabajar |
| `GET /api/studies/{id}/blocks` | La grilla esperada: `d1b1`…`d3b2` con fecha y hora de cada bloque |
| `POST /api/ingest/presign` | URLs prefirmadas de R2 para un conjunto de claves |
| `POST /api/ingest/complete` | Registra `media_files` y `artifacts` con checksum y ubicación del master |

Notas de la implementación:

- **El servidor arma la clave.** El escritorio manda nombre, tipo y bloque; no
  elige dónde se escribe. Una ruta que aceptara la clave del cliente dejaría
  escribir en el prefijo de otro estudio.
- **`complete` comprueba que el objeto exista en R2 antes de registrar.** Una
  fila sin objeto detrás hace que la grilla diga que el bloque está cubierto
  cuando no lo está. Lo que no pasa vuelve en `rejected` con su motivo, y la
  respuesta es 207: registrar diez de doce no es un fracaso, pero tampoco un
  éxito silencioso.
- **CORS solo para los orígenes del escritorio** (`tauri://localhost`,
  `http://tauri.localhost`, `http://localhost:1420`). Reflejar el origen que
  venga abriría la API a cualquier página que el operador tenga abierta.
- **`/api` queda fuera del guardián de sesión** del proxy: un redirect a
  `/login` como respuesta a una petición de API es una página HTML donde se
  esperaba JSON. Cada ruta valida el Bearer por su cuenta.

**La inversión que hace D17 concreta:** v2 publica qué espera y el escritorio
empareja contra esa lista. La nomenclatura deja de ser disciplina de una persona.

### Autenticación

Inicio de sesión con correo y contraseña contra Supabase, igual que la web. La
app guarda la sesión y la refresca.

Se descarta pedir que el operador pegue un token de acceso —que es lo que hacía
el script de carga masiva del repo anterior—: un token largo copiado a mano
termina en un archivo de notas, y no caduca.

---

## Clasificación: tres intentos, en orden

Las cámaras no nombran los archivos como uno quisiera. Un Insta360 entrega
`VID_20260913_101500_00_007.insv`, no `d1b1`.

1. **Por código en el nombre.** Si aparece `d{día}b{bloque}`, resuelto.
2. **Por hora de creación.** Si la marca de tiempo del archivo cae dentro del
   horario agendado de un bloque, se propone ese bloque. Acá se paga el trabajo
   de F5: sin fecha y hora por bloque, este paso no existe.
3. **A mano.** Lo que quede sin resolver se muestra en la grilla para que el
   operador lo asigne.

**Nada se descarta en silencio.** Un archivo mal rotulado es un error de
etiqueta, no de contenido, y el material es irrepetible.

El tipo (`video_360`, `video_dslr`, `audio_room`, `audio_mic`) se infiere de la
extensión, el códec y el nombre, y siempre es corregible antes de subir.

---

## Transcodificación

| Fuente | Salida | Escala |
|---|---|---|
| 360 equirectangular | HLS | 2560×1280 |
| DSLR | HLS | 1920×1080 |
| Audio | Se sube tal cual | — |

**Pendiente de este diseño: las grabaciones vienen cortadas.** Un Insta360 entrega
`VID_20261110_130000_00_001.insv`, `_002`, `_003`. Este documento asumía un archivo
por fuente. Como el video se transcodifica igual, unir los segmentos es un argumento
más del mismo `ffmpeg` —`concat` sobre la lista ordenada— y no un viaje extra de
datos; pero hay que agruparlos antes, y agrupar mal significaría pegar dos tomas
distintas. Las reglas están en
[2026-09-13-grabaciones-en-partes.md](2026-09-13-grabaciones-en-partes.md); acá falta
implementarlas.

El audio **no** se une: sube en partes y la app las ordena (D21).

El original **no se toca ni se mueve**. Se registra su ruta y el equipo o disco
donde quedó (`source_path`, `source_host` en `media_files`), porque con D19 el
master nunca sale de la máquina y sin esa anotación se vuelve inencontrable.

---

## Subida

- Multipart y reanudable. Son cientos de MB por bloque sobre internet chilena;
  una subida que se corta al 90 % y empieza de cero es inaceptable.
- Cola que sobrevive al cierre de la app.
- **Idempotente por checksum**: re-procesar una carpeta ya subida no vuelve a
  transcodificar ni a subir nada.

Al completar, la app declara el artifact: para la sesión X produjo
`kind=hls_manifest`, `producer=local`. El pipeline de la nube ve el casillero
lleno y se salta el paso — sin una columna nueva ni un `if` nuevo por cada
integración local (D17).

---

## Corrección · lo que la app ya hace

Este documento se escribió sin poder leer el repo, y dos cosas quedaron mal.
Verificadas en el código el 2026-09-13, sobre la versión **0.6.5**:

**La transcripción local ya existe.** `src/hooks/useModels.ts` descarga modelos
ggml de whisper.cpp —de `tiny` a `large-v3`— y el panel de Configuración los
ofrece con detección de hardware. Se había propuesto posponerla; no hay nada que
posponer.

La consecuencia para el contrato: v2 debe aceptar el **artifact de
transcripción** desde el día uno, igual que el HLS. Transcribir en la nube algo
que la máquina ya transcribió gratis es pagar dos veces, y el modelo de
artifacts (D17) ya sabe saltarse ese paso.

**La URL del servidor es una constante de compilación.** Hoy:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
```

Vite la incrusta al construir, así que apuntar la app a otro backend exige
recompilar y publicar una release. Eso ya causó un fallo real: con v2 corriendo
en el puerto 3000, la app quedó hablándole al backend equivocado y mostró "Load
failed" sin ninguna forma de corregirlo desde la interfaz.

**En la v3 la URL pasa a ser un ajuste en runtime**, guardado y editable desde
Configuración, con la variable de entorno solo como valor inicial. Un cambio de
entorno no puede costar un ciclo de compilación y release.

## Fuera de alcance de la v3

Análisis, edición, o cualquier decisión sobre el proceso del estudio. Eso vive
en la web.

---

## La v3 no está lista hasta que esté etiquetada

Lección del repo anterior, que costó caro: se acumularon quince funcionalidades
sin release. El auto-actualizador del escritorio lee `latest.json`, que apunta a
la **última release etiquetada** — así que código mergeado sin tag es código que
nadie recibe.

Terminar la v3 incluye `git tag v3.0.0 && git push --tags` y publicar la release.

---

## Orden de implementación

1. ~~**F5** en v2 — los bloques existen, con fecha y hora~~ · hecho
2. ~~**F6a** en v2 — `media_files`, bucket R2~~ · hecho
3. ~~**Las cuatro rutas** en v2~~ · hecho
4. **v3** en wav-ingest — apuntar a las rutas nuevas, clasificar, transcodificar
   y publicar los artifacts
5. **Tag y release**

Sobre el paso 4: el repo ya tiene casi todas las piezas de la v0.6.5 —
`filename-classifier`, `fragment-detector`, `sequence-detection`, la cola de
subida, y transcripción local con faster-whisper más alineación con whisperx
(`python/faster_whisper_transcribe.py` + el comando `transcribe_local`). Lo que
falta no es capacidad sino **traducción**: esas piezas hablan el contrato del
proyecto anterior. Hay que apuntarlas a `/api/ingest/*` y emitir el artifact de
transcripción con la forma de `src/features/transcripts/contract.ts` de v2 —
fuentes con hora absoluta de inicio y tiempos propios, no un archivo por
verbatim.

La app no se puede compilar ni ejecutar desde una sesión remota: no hay macOS
para levantar Tauri. Lo que se escriba desde acá se verifica con sus tests y se
prueba en la máquina de Federico.
