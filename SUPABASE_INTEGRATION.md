# Películas → Supabase

Respaldo de "Seguir viendo" y del registro de descargas en el proyecto Supabase de
socios-comicion-propina (`teemahksasdougehrcly`).

## Estado

Tablas creadas (noviembre 2026) con `supabase-migrations.sql`. Para recrearlas en otro
proyecto, ejecutarlo en el SQL Editor; es idempotente.

Ver los datos: https://supabase.com/dashboard/project/teemahksasdougehrcly/editor

## Despliegue

Solo Vercel (`peliculas-neon.vercel.app`). La conexión con Cloudflare Workers se quitó: no
hay configuración para Cloudflare en este repositorio y fallaba en cada commit.

## Tablas

| Tabla | Clave | Contenido |
|---|---|---|
| `peliculas_viendo` | `user_id, movie_id` | película (jsonb), segundo `t`, duración `dur`, `at` |
| `peliculas_descargas` | `user_id, movie_id` | película, url, partes, tamaño, `done` |

`user_id` = correo de la cuenta de la app si hay sesión; si no, un id del dispositivo (`dev:<uuid>`).

## Código

- `lib/supabase-movies.ts` — cliente y lectura/escritura.
- `components/MovieCloudSync.tsx` — montado en `app/layout.tsx`. Al abrir trae "Seguir viendo"
  y lo mezcla con lo local (gana lo más reciente); cada cambio se sube a los 3 s; al volver la
  conexión reintenta. localStorage sigue siendo la fuente local (funciona sin internet).
- Las descargas solo se suben (los archivos viven en el teléfono, no se traen a otro dispositivo).

## Seguridad

La app no usa Supabase Auth, así que las políticas RLS permiten al rol `anon` leer/escribir
**solo** estas dos tablas. Quien tenga la clave anónima (pública en el JS) podría leer el
historial de otro usuario si conoce su correo. Es aceptable para historial de películas; para
algo sensible habría que pasar por una API del servidor con la service key.

## Cuenta (respaldo de la biblioteca)

`app/api/cuenta/route.ts`: el login por código y la comunidad siguen en el Apps Script
(`backend/cuenta-apps-script.gs`). Cargar y guardar el respaldo va a Supabase:

| Tabla | Clave | Contenido |
|---|---|---|
| `cuenta_sesiones` | `token_hash` | sha256 del token de sesión → correo |
| `cuenta_respaldos` | `email` | respaldo completo (texto JSON) y `updated_at` |

- RLS activo sin políticas: la clave anónima no puede leerlas. Solo el servidor, con
  `SUPABASE_SERVICE_ROLE_KEY` (variable de entorno en Vercel, nunca en el código).
- Sin esa variable, todo sigue yendo al Apps Script como antes.
- Migración automática: la primera vez que un usuario carga o guarda, su respaldo se copia de la
  Sheet a Supabase. La Sheet queda intacta como respaldo, pero ya no se actualiza.
- Si Supabase falla, la app recibe un error temporal y reintenta; nunca se cierra la sesión.
