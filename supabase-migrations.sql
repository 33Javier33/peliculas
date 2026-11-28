-- Películas → Supabase (proyecto de socios-comicion-propina: teemahksasdougehrcly)
-- Ejecutar una vez en: SQL Editor del proyecto. Es idempotente.

create table if not exists public.peliculas_viendo (
  user_id    text   not null,
  movie_id   text   not null,
  movie      jsonb  not null,
  t          integer not null,
  dur        integer not null,
  at         bigint  not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create table if not exists public.peliculas_descargas (
  user_id    text    not null,
  movie_id   text    not null,
  movie      jsonb   not null,
  url        text    not null,
  parts      integer not null default 0,
  size       bigint  not null default 0,
  total      bigint  not null default 0,
  mime       text    not null default 'video/mp4',
  done       boolean not null default false,
  saved_at   bigint  not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create index if not exists peliculas_viendo_user_at on public.peliculas_viendo (user_id, at desc);

alter table public.peliculas_viendo    enable row level security;
alter table public.peliculas_descargas enable row level security;

-- La app no usa Supabase Auth: el cliente anónimo puede leer/escribir SOLO estas dos tablas.
drop policy if exists "peliculas_viendo anon" on public.peliculas_viendo;
create policy "peliculas_viendo anon" on public.peliculas_viendo
  for all to anon using (true) with check (true);

drop policy if exists "peliculas_descargas anon" on public.peliculas_descargas;
create policy "peliculas_descargas anon" on public.peliculas_descargas
  for all to anon using (true) with check (true);

-- ── Cuenta (respaldo de la biblioteca) ─────────────────────────────
-- El login sigue en el Apps Script; aquí se guarda la sesión (huella del token) y el respaldo.
-- RLS activo SIN políticas: el rol anon no puede leer ni escribir. Solo /api/cuenta, con la
-- service_role key (variable SUPABASE_SERVICE_ROLE_KEY en Vercel), accede a estas tablas.

create table if not exists public.cuenta_sesiones (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now()
);
create index if not exists cuenta_sesiones_email on public.cuenta_sesiones (email);

create table if not exists public.cuenta_respaldos (
  email      text primary key,
  data       text,
  updated_at bigint not null default 0
);

alter table public.cuenta_sesiones  enable row level security;
alter table public.cuenta_respaldos enable row level security;

-- ── Dispositivos (qué suena en cada uno y órdenes entre ellos) ─────
-- Igual que las tablas de cuenta: RLS sin políticas, solo el servidor (/api/cuenta) accede.
-- Las órdenes además viajan al instante por un canal Realtime (broadcast) con nombre secreto por
-- cuenta; esta tabla es el respaldo para el dispositivo que no estaba conectado al canal.

create table if not exists public.cuenta_dispositivos (
  email   text    not null,
  device  text    not null,
  name    text    not null default '',
  app     text    not null default 'media',
  playing boolean not null default false,
  track   jsonb,
  at      bigint  not null,
  primary key (email, device)
);

create table if not exists public.cuenta_ordenes (
  id        bigserial primary key,
  email     text   not null,
  to_device text   not null,
  cmd       jsonb  not null,
  at        bigint not null
);
create index if not exists cuenta_ordenes_destino on public.cuenta_ordenes (email, to_device);

alter table public.cuenta_dispositivos enable row level security;
alter table public.cuenta_ordenes      enable row level security;

-- ── Uso (panel de administración /admin) ───────────────────────────
-- Las apps y la web escriben DIRECTO aquí (sin pasar por Vercel) con la clave anónima, pero solo
-- a través de estas tres funciones (security definer): no pueden leer ni tocar las tablas.
-- Leer es solo para el servidor (/api/admin, con la service_role key) y solo para el administrador.

-- Un dispositivo (número al azar, sin datos personales) y los días en que se usó
create table if not exists public.uso_dispositivos (
  device      text primary key,
  app         text not null default 'web',   -- media | music | web
  version     text not null default '',
  con_cuenta  boolean not null default false,
  primera_vez timestamptz not null default now(),
  ultima_vez  timestamptz not null default now()
);
create table if not exists public.uso_dias (
  dia    date not null,
  device text not null,
  app    text not null default 'web',
  primary key (dia, device)
);

-- Canciones que sonaron (una fila por canción y día)
create table if not exists public.uso_reproducciones (
  dia     date not null,
  track   text not null,
  titulo  text not null default '',
  artista text not null default '',
  veces   integer not null default 0,
  primary key (dia, track)
);

-- Errores que reportan las apps y la web
create table if not exists public.uso_errores (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  device  text not null default '',
  app     text not null default 'web',
  version text not null default '',
  donde   text not null default '',
  mensaje text not null default '',
  online  boolean not null default true,
  pagina  text not null default ''
);
create index if not exists uso_errores_at on public.uso_errores (at desc);

-- Errores que el administrador marcó como resueltos (por mensaje), con su nota
create table if not exists public.uso_errores_resueltos (
  mensaje text primary key,
  nota    text not null default '',
  at      timestamptz not null default now()
);

alter table public.uso_dispositivos      enable row level security;
alter table public.uso_dias              enable row level security;
alter table public.uso_reproducciones    enable row level security;
alter table public.uso_errores           enable row level security;
alter table public.uso_errores_resueltos enable row level security;

create or replace function public.uso_ping(p_device text, p_app text, p_version text, p_cuenta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or length(p_device) < 6 or length(p_device) > 60 then return; end if;
  insert into uso_dispositivos (device, app, version, con_cuenta)
    values (p_device, left(coalesce(p_app, 'web'), 10), left(coalesce(p_version, ''), 20), coalesce(p_cuenta, false))
    on conflict (device) do update set app = excluded.app, version = excluded.version,
      con_cuenta = excluded.con_cuenta, ultima_vez = now();
  insert into uso_dias (dia, device, app) values (current_date, p_device, left(coalesce(p_app, 'web'), 10))
    on conflict do nothing;
end $$;

create or replace function public.uso_play(p_track text, p_titulo text, p_artista text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_track is null or length(p_track) < 3 or length(p_track) > 80 then return; end if;
  insert into uso_reproducciones (dia, track, titulo, artista, veces)
    values (current_date, p_track, left(coalesce(p_titulo, ''), 200), left(coalesce(p_artista, ''), 120), 1)
    on conflict (dia, track) do update set veces = uso_reproducciones.veces + 1;
end $$;

create or replace function public.uso_error(p_device text, p_app text, p_version text, p_donde text, p_mensaje text, p_online boolean, p_pagina text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mensaje is null or length(p_mensaje) = 0 then return; end if;
  -- Freno: como mucho 30 errores por dispositivo al día
  if (select count(*) from uso_errores where device = coalesce(p_device, '') and at > now() - interval '1 day') >= 30 then return; end if;
  insert into uso_errores (device, app, version, donde, mensaje, online, pagina)
    values (left(coalesce(p_device, ''), 60), left(coalesce(p_app, 'web'), 10), left(coalesce(p_version, ''), 20),
            left(coalesce(p_donde, ''), 60), left(p_mensaje, 500), coalesce(p_online, true), left(coalesce(p_pagina, ''), 200));
end $$;

revoke all on function public.uso_ping(text, text, text, boolean) from public;
revoke all on function public.uso_play(text, text, text) from public;
revoke all on function public.uso_error(text, text, text, text, text, boolean, text) from public;
grant execute on function public.uso_ping(text, text, text, boolean) to anon;
grant execute on function public.uso_play(text, text, text) to anon;
grant execute on function public.uso_error(text, text, text, text, text, boolean, text) to anon;

-- Resumen para el panel (lo calcula la base: sirve con miles de filas). Solo el servidor lo usa.
create or replace function public.uso_admin_resumen()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'activos', (
      select jsonb_object_agg(p.periodo, p.datos) from (
        select x.periodo, jsonb_build_object(
          'total', (select count(distinct device) from uso_dias where dia > current_date - x.dias),
          'porApp', coalesce((select jsonb_object_agg(app, n) from (
              select app, count(distinct device) n from uso_dias where dia > current_date - x.dias group by app) a), '{}'::jsonb)
        ) datos
        from (values ('hoy', 1), ('semana', 7), ('mes', 30)) as x(periodo, dias)
      ) p
    ),
    'dispositivos', jsonb_build_object(
      'total', (select count(*) from uso_dispositivos),
      'mes', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days'),
      'conCuenta', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days' and con_cuenta),
      'sinCuenta', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days' and not con_cuenta),
      'versiones', coalesce((select jsonb_agg(jsonb_build_array(v, n) order by n desc) from (
          select app || ' ' || coalesce(nullif(version, ''), '?') v, count(*) n from uso_dispositivos
          where ultima_vez > now() - interval '30 days' group by 1) s), '[]'::jsonb)
    ),
    'cuentas', coalesce((select jsonb_agg(c order by c->>'ultimaVez' desc) from (
        select jsonb_build_object(
          'email', r.email,
          'respaldo', r.updated_at,
          'dispositivos', (select count(*) from cuenta_dispositivos d where d.email = r.email),
          'apps', coalesce((select jsonb_agg(distinct d.app) from cuenta_dispositivos d where d.email = r.email), '[]'::jsonb),
          'ultimaVez', greatest(r.updated_at, coalesce((select max(d.at) from cuenta_dispositivos d where d.email = r.email), 0))
        ) c from cuenta_respaldos r) t), '[]'::jsonb),
    'canciones', jsonb_build_object(
      'semana', coalesce((select jsonb_agg(t order by (t->>'veces')::int desc) from (
          select jsonb_build_object('track', track, 'titulo', max(titulo), 'artista', max(artista), 'veces', sum(veces)) t
          from uso_reproducciones where dia > current_date - 7 group by track order by sum(veces) desc limit 50) s), '[]'::jsonb),
      'mes', coalesce((select jsonb_agg(t order by (t->>'veces')::int desc) from (
          select jsonb_build_object('track', track, 'titulo', max(titulo), 'artista', max(artista), 'veces', sum(veces)) t
          from uso_reproducciones where dia > current_date - 30 group by track order by sum(veces) desc limit 50) s), '[]'::jsonb)
    ),
    'errores', coalesce((select jsonb_agg(e order by (e->>'dispositivos')::int desc, (e->>'veces')::int desc) from (
        select jsonb_build_object(
          'mensaje', mensaje,
          'veces', count(*),
          'dispositivos', count(distinct device),
          'ultima', max(at),
          'donde', (array_agg(distinct donde))[1:8],
          'paginas', (array_agg(distinct pagina) filter (where pagina <> ''))[1:6],
          'versiones', (array_agg(distinct app || ' ' || version))[1:8],
          'sinInternet', count(*) filter (where not online)
        ) e
        from uso_errores where at > now() - interval '30 days'
        group by mensaje order by count(distinct device) desc, count(*) desc limit 200) s), '[]'::jsonb),
    'resueltos', coalesce((select jsonb_agg(jsonb_build_object('mensaje', mensaje, 'nota', nota, 'at', at)) from uso_errores_resueltos), '[]'::jsonb)
  )
$$;
revoke all on function public.uso_admin_resumen() from public;
revoke all on function public.uso_admin_resumen() from anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.uso_admin_resumen() from authenticated;
  end if;
end $$;
grant execute on function public.uso_admin_resumen() to service_role;

-- Limpieza: errores de más de 90 días (se puede ejecutar a mano de vez en cuando)
-- delete from public.uso_errores where at < now() - interval '90 days';

-- ── Uso v2 (más detalle en el panel) ───────────────────────────────
-- Correo de la cuenta (si el dispositivo tiene sesión) en dispositivos y errores, y quién escuchó
-- cada canción (para contar personas distintas). Las funciones nuevas conviven con las anteriores
-- (las apps sin actualizar siguen usando las de antes).
alter table public.uso_dispositivos add column if not exists cuenta text not null default '';
alter table public.uso_errores add column if not exists cuenta text not null default '';
create index if not exists uso_dispositivos_cuenta on public.uso_dispositivos (cuenta);

create table if not exists public.uso_escuchas (
  dia    date not null,
  track  text not null,
  device text not null,
  primary key (dia, track, device)
);
alter table public.uso_escuchas enable row level security;

create or replace function public.uso_ping(p_device text, p_app text, p_version text, p_cuenta boolean, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform uso_ping(p_device, p_app, p_version, p_cuenta);
  if p_device is not null and length(p_device) between 6 and 60 then
    update uso_dispositivos set cuenta = left(lower(coalesce(p_email, '')), 120) where device = p_device;
  end if;
end $$;

create or replace function public.uso_play(p_track text, p_titulo text, p_artista text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform uso_play(p_track, p_titulo, p_artista);
  if p_track is not null and length(p_track) between 3 and 80 and p_device is not null and length(p_device) between 6 and 60 then
    insert into uso_escuchas (dia, track, device) values (current_date, p_track, p_device) on conflict do nothing;
  end if;
end $$;

create or replace function public.uso_error(p_device text, p_app text, p_version text, p_donde text, p_mensaje text, p_online boolean, p_pagina text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  select count(*) into n from uso_errores;
  perform uso_error(p_device, p_app, p_version, p_donde, p_mensaje, p_online, p_pagina);
  -- (la fila recién anotada, si se anotó: se le pone la cuenta)
  update uso_errores set cuenta = left(lower(coalesce(p_email, '')), 120)
    where id = (select max(id) from uso_errores where device = left(coalesce(p_device, ''), 60))
      and (select count(*) from uso_errores) > n;
end $$;

revoke all on function public.uso_ping(text, text, text, boolean, text) from public;
revoke all on function public.uso_play(text, text, text, text) from public;
revoke all on function public.uso_error(text, text, text, text, text, boolean, text, text) from public;
grant execute on function public.uso_ping(text, text, text, boolean, text) to anon;
grant execute on function public.uso_play(text, text, text, text) to anon;
grant execute on function public.uso_error(text, text, text, text, text, boolean, text, text) to anon;

-- Resumen v2 para el panel (reemplaza al anterior)
create or replace function public.uso_admin_resumen()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'hoy', current_date,
    'activos', (
      select jsonb_object_agg(p.periodo, p.datos) from (
        select x.periodo, jsonb_build_object(
          'total', (select count(distinct device) from uso_dias where dia > current_date - x.dias),
          'nuevos', (select count(*) from uso_dispositivos where primera_vez::date > current_date - x.dias),
          'porApp', coalesce((select jsonb_object_agg(app, n) from (
              select app, count(distinct device) n from uso_dias where dia > current_date - x.dias group by app) a), '{}'::jsonb)
        ) datos
        from (values ('hoy', 1), ('semana', 7), ('mes', 30)) as x(periodo, dias)
      ) p
    ),
    'diario', coalesce((select jsonb_agg(jsonb_build_object('dia', g.dia, 'total', coalesce(d.total, 0), 'porApp', coalesce(d.por_app, '{}'::jsonb)) order by g.dia)
        from generate_series(current_date - 29, current_date, interval '1 day') as g(dia)
        left join (
          select dia, count(distinct device) total,
                 (select jsonb_object_agg(app, n) from (select app, count(distinct device) n from uso_dias u2 where u2.dia = u.dia group by app) z) por_app
          from uso_dias u where dia > current_date - 30 group by dia
        ) d on d.dia = g.dia::date), '[]'::jsonb),
    'porApp', coalesce((select jsonb_agg(jsonb_build_object('app', app, 'activos', n, 'conCuenta', c, 'sinCuenta', n - c, 'nuevos', nv) order by n desc) from (
        select app, count(*) n, count(*) filter (where con_cuenta) c, count(*) filter (where primera_vez > now() - interval '30 days') nv
        from uso_dispositivos where ultima_vez > now() - interval '30 days' group by app) s), '[]'::jsonb),
    'dispositivos', jsonb_build_object(
      'total', (select count(*) from uso_dispositivos),
      'mes', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days'),
      'conCuenta', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days' and con_cuenta),
      'sinCuenta', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days' and not con_cuenta)
    ),
    'versiones', coalesce((select jsonb_agg(jsonb_build_object('app', app, 'version', version, 'dispositivos', n, 'ultimaVez', u) order by app, n desc) from (
        select app, coalesce(nullif(version, ''), '?') version, count(*) n, max(ultima_vez) u from uso_dispositivos
        where ultima_vez > now() - interval '30 days' group by 1, 2) s), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(c order by (c->>'ultimaVez')::bigint desc) from (
        select jsonb_build_object(
          'email', r.email,
          'respaldo', r.updated_at,
          'dispositivos', greatest(
              (select count(*) from cuenta_dispositivos d where d.email = r.email),
              (select count(*) from uso_dispositivos u where u.cuenta = lower(r.email))),
          'apps', coalesce((select jsonb_agg(distinct a) from (
              select d.app a from cuenta_dispositivos d where d.email = r.email
              union select u.app from uso_dispositivos u where u.cuenta = lower(r.email)) x), '[]'::jsonb),
          'desde', (select min(u.primera_vez) from uso_dispositivos u where u.cuenta = lower(r.email)),
          'canciones30', (select count(*) from uso_escuchas e join uso_dispositivos u on u.device = e.device
              where u.cuenta = lower(r.email) and e.dia > current_date - 30),
          'ultimaVez', greatest(r.updated_at,
              coalesce((select max(d.at) from cuenta_dispositivos d where d.email = r.email), 0),
              coalesce((select (extract(epoch from max(u.ultima_vez)) * 1000)::bigint from uso_dispositivos u where u.cuenta = lower(r.email)), 0))
        ) c from cuenta_respaldos r) t), '[]'::jsonb),
    'canciones', jsonb_build_object(
      'semana', coalesce((select jsonb_agg(t order by (t->>'veces')::int desc) from (
          select jsonb_build_object('track', r.track, 'titulo', max(r.titulo), 'artista', max(r.artista), 'veces', sum(r.veces),
                 'personas', (select count(distinct e.device) from uso_escuchas e where e.track = r.track and e.dia > current_date - 7),
                 'ultimaVez', max(r.dia)) t
          from uso_reproducciones r where r.dia > current_date - 7 group by r.track order by sum(r.veces) desc limit 100) s), '[]'::jsonb),
      'mes', coalesce((select jsonb_agg(t order by (t->>'veces')::int desc) from (
          select jsonb_build_object('track', r.track, 'titulo', max(r.titulo), 'artista', max(r.artista), 'veces', sum(r.veces),
                 'personas', (select count(distinct e.device) from uso_escuchas e where e.track = r.track and e.dia > current_date - 30),
                 'ultimaVez', max(r.dia)) t
          from uso_reproducciones r where r.dia > current_date - 30 group by r.track order by sum(r.veces) desc limit 100) s), '[]'::jsonb)
    ),
    'errores', coalesce((select jsonb_agg(e order by (e->>'dispositivos')::int desc, (e->>'veces')::int desc) from (
        select jsonb_build_object(
          'mensaje', er.mensaje,
          'veces', count(*),
          'dispositivos', count(distinct er.device),
          'primera', min(er.at),
          'ultima', max(er.at),
          'donde', (array_agg(distinct er.donde))[1:8],
          'paginas', (array_agg(distinct er.pagina) filter (where er.pagina <> ''))[1:6],
          'versiones', (array_agg(distinct er.app || ' ' || er.version))[1:8],
          'sinInternet', count(*) filter (where not er.online),
          'casos', (select jsonb_agg(jsonb_build_object('at', c.at, 'app', c.app, 'version', c.version, 'cuenta', c.cuenta,
                       'device', c.device, 'pagina', c.pagina, 'online', c.online, 'donde', c.donde) order by c.at desc)
                    from (select * from uso_errores c where c.mensaje = er.mensaje and c.at > now() - interval '30 days' order by c.at desc limit 15) c)
        ) e
        from uso_errores er where er.at > now() - interval '30 days'
        group by er.mensaje order by count(distinct er.device) desc, count(*) desc limit 200) s), '[]'::jsonb),
    'resueltos', coalesce((select jsonb_agg(jsonb_build_object('mensaje', mensaje, 'nota', nota, 'at', at)) from uso_errores_resueltos), '[]'::jsonb)
  )
$$;
revoke all on function public.uso_admin_resumen() from public;
revoke all on function public.uso_admin_resumen() from anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.uso_admin_resumen() from authenticated;
  end if;
end $$;
grant execute on function public.uso_admin_resumen() to service_role;

-- ── Uso v3: conexiones (fecha y hora), quién escucha cada canción y quién tiene cada versión ──
-- Cada vez que alguien abre la app o la web (o vuelve después de 30 min) se anota la hora.
create table if not exists public.uso_conexiones (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  device  text not null,
  app     text not null default 'web',
  version text not null default '',
  cuenta  text not null default ''
);
create index if not exists uso_conexiones_at on public.uso_conexiones (at desc);
create index if not exists uso_conexiones_cuenta on public.uso_conexiones (cuenta, at desc);
alter table public.uso_conexiones enable row level security;

create or replace function public.uso_conexion(p_device text, p_app text, p_version text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or length(p_device) < 6 or length(p_device) > 60 then return; end if;
  -- Freno: como mucho una cada 10 min por dispositivo
  if exists (select 1 from uso_conexiones where device = p_device and at > now() - interval '10 minutes') then return; end if;
  insert into uso_conexiones (device, app, version, cuenta)
    values (p_device, left(coalesce(p_app, 'web'), 10), left(coalesce(p_version, ''), 20), left(lower(coalesce(p_email, '')), 120));
  -- Se guarda lo de los últimos 180 días
  if random() < 0.01 then delete from uso_conexiones where at < now() - interval '180 days'; end if;
end $$;
revoke all on function public.uso_conexion(text, text, text, text) from public;
grant execute on function public.uso_conexion(text, text, text, text) to anon;

-- Resumen v3 (agrega «conexiones», quién escucha cada canción y quién tiene cada versión)
create or replace function public.uso_admin_resumen()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'hoy', current_date,
    'activos', (
      select jsonb_object_agg(p.periodo, p.datos) from (
        select x.periodo, jsonb_build_object(
          'total', (select count(distinct device) from uso_dias where dia > current_date - x.dias),
          'nuevos', (select count(*) from uso_dispositivos where primera_vez::date > current_date - x.dias),
          'porApp', coalesce((select jsonb_object_agg(app, n) from (
              select app, count(distinct device) n from uso_dias where dia > current_date - x.dias group by app) a), '{}'::jsonb)
        ) datos
        from (values ('hoy', 1), ('semana', 7), ('mes', 30)) as x(periodo, dias)
      ) p
    ),
    'diario', coalesce((select jsonb_agg(jsonb_build_object('dia', g.dia, 'total', coalesce(d.total, 0), 'porApp', coalesce(d.por_app, '{}'::jsonb)) order by g.dia)
        from generate_series(current_date - 29, current_date, interval '1 day') as g(dia)
        left join (
          select dia, count(distinct device) total,
                 (select jsonb_object_agg(app, n) from (select app, count(distinct device) n from uso_dias u2 where u2.dia = u.dia group by app) z) por_app
          from uso_dias u where dia > current_date - 30 group by dia
        ) d on d.dia = g.dia::date), '[]'::jsonb),
    'porApp', coalesce((select jsonb_agg(jsonb_build_object('app', app, 'activos', n, 'conCuenta', c, 'sinCuenta', n - c, 'nuevos', nv) order by n desc) from (
        select app, count(*) n, count(*) filter (where con_cuenta) c, count(*) filter (where primera_vez > now() - interval '30 days') nv
        from uso_dispositivos where ultima_vez > now() - interval '30 days' group by app) s), '[]'::jsonb),
    'dispositivos', jsonb_build_object(
      'total', (select count(*) from uso_dispositivos),
      'mes', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days'),
      'conCuenta', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days' and con_cuenta),
      'sinCuenta', (select count(*) from uso_dispositivos where ultima_vez > now() - interval '30 days' and not con_cuenta)
    ),
    -- Cada versión con los dispositivos que la tienen (y de quién son)
    'versiones', coalesce((select jsonb_agg(jsonb_build_object('app', s.app, 'version', s.version, 'dispositivos', s.n, 'ultimaVez', s.u,
          'quienes', (select jsonb_agg(jsonb_build_object('cuenta', d.cuenta, 'device', d.device, 'ultimaVez', d.ultima_vez) order by d.ultima_vez desc)
                      from (select * from uso_dispositivos d where d.app = s.app and coalesce(nullif(d.version, ''), '?') = s.version
                              and d.ultima_vez > now() - interval '30 days' order by d.ultima_vez desc limit 50) d)
        ) order by s.app, s.n desc) from (
        select app, coalesce(nullif(version, ''), '?') version, count(*) n, max(ultima_vez) u from uso_dispositivos
        where ultima_vez > now() - interval '30 days' group by 1, 2) s), '[]'::jsonb),
    'cuentas', coalesce((select jsonb_agg(c order by (c->>'ultimaVez')::bigint desc) from (
        select jsonb_build_object(
          'email', r.email,
          'respaldo', r.updated_at,
          'dispositivos', greatest(
              (select count(*) from cuenta_dispositivos d where d.email = r.email),
              (select count(*) from uso_dispositivos u where u.cuenta = lower(r.email))),
          'apps', coalesce((select jsonb_agg(distinct a) from (
              select d.app a from cuenta_dispositivos d where d.email = r.email
              union select u.app from uso_dispositivos u where u.cuenta = lower(r.email)) x), '[]'::jsonb),
          'desde', (select min(u.primera_vez) from uso_dispositivos u where u.cuenta = lower(r.email)),
          'canciones30', (select count(*) from uso_escuchas e join uso_dispositivos u on u.device = e.device
              where u.cuenta = lower(r.email) and e.dia > current_date - 30),
          'conexiones30', (select count(*) from uso_conexiones k where k.cuenta = lower(r.email) and k.at > now() - interval '30 days'),
          'ultimaConexion', (select max(k.at) from uso_conexiones k where k.cuenta = lower(r.email)),
          'ultimaVez', greatest(r.updated_at,
              coalesce((select max(d.at) from cuenta_dispositivos d where d.email = r.email), 0),
              coalesce((select (extract(epoch from max(u.ultima_vez)) * 1000)::bigint from uso_dispositivos u where u.cuenta = lower(r.email)), 0))
        ) c from cuenta_respaldos r) t), '[]'::jsonb),
    -- Últimas conexiones (fecha y hora exactas) y a qué horas del día se conecta la gente (30 días)
    'conexiones', coalesce((select jsonb_agg(jsonb_build_object('at', k.at, 'cuenta', k.cuenta, 'device', k.device, 'app', k.app, 'version', k.version) order by k.at desc)
        from (select * from uso_conexiones order by at desc limit 300) k), '[]'::jsonb),
    'porHora', coalesce((select jsonb_agg(jsonb_build_object('hora', h, 'n', n) order by h) from (
        select extract(hour from at at time zone 'America/Santiago')::int h, count(*) n
        from uso_conexiones where at > now() - interval '30 days' group by 1) z), '[]'::jsonb),
    'canciones', jsonb_build_object(
      'semana', coalesce((select jsonb_agg(t order by (t->>'veces')::int desc) from (
          select jsonb_build_object('track', r.track, 'titulo', max(r.titulo), 'artista', max(r.artista), 'veces', sum(r.veces),
                 'personas', (select count(distinct e.device) from uso_escuchas e where e.track = r.track and e.dia > current_date - 7),
                 'quienes', (select jsonb_agg(jsonb_build_object('cuenta', q.cuenta, 'dias', q.dias) order by q.dias desc) from (
                     select coalesce(nullif(u.cuenta, ''), 'disp. ' || left(e.device, 6)) cuenta, count(*) dias
                     from uso_escuchas e left join uso_dispositivos u on u.device = e.device
                     where e.track = r.track and e.dia > current_date - 7 group by 1 order by 2 desc limit 30) q),
                 'ultimaVez', max(r.dia)) t
          from uso_reproducciones r where r.dia > current_date - 7 group by r.track order by sum(r.veces) desc limit 100) s), '[]'::jsonb),
      'mes', coalesce((select jsonb_agg(t order by (t->>'veces')::int desc) from (
          select jsonb_build_object('track', r.track, 'titulo', max(r.titulo), 'artista', max(r.artista), 'veces', sum(r.veces),
                 'personas', (select count(distinct e.device) from uso_escuchas e where e.track = r.track and e.dia > current_date - 30),
                 'quienes', (select jsonb_agg(jsonb_build_object('cuenta', q.cuenta, 'dias', q.dias) order by q.dias desc) from (
                     select coalesce(nullif(u.cuenta, ''), 'disp. ' || left(e.device, 6)) cuenta, count(*) dias
                     from uso_escuchas e left join uso_dispositivos u on u.device = e.device
                     where e.track = r.track and e.dia > current_date - 30 group by 1 order by 2 desc limit 30) q),
                 'ultimaVez', max(r.dia)) t
          from uso_reproducciones r where r.dia > current_date - 30 group by r.track order by sum(r.veces) desc limit 100) s), '[]'::jsonb)
    ),
    'errores', coalesce((select jsonb_agg(e order by (e->>'dispositivos')::int desc, (e->>'veces')::int desc) from (
        select jsonb_build_object(
          'mensaje', er.mensaje,
          'veces', count(*),
          'dispositivos', count(distinct er.device),
          'primera', min(er.at),
          'ultima', max(er.at),
          'donde', (array_agg(distinct er.donde))[1:8],
          'paginas', (array_agg(distinct er.pagina) filter (where er.pagina <> ''))[1:6],
          'versiones', (array_agg(distinct er.app || ' ' || er.version))[1:8],
          'sinInternet', count(*) filter (where not er.online),
          'casos', (select jsonb_agg(jsonb_build_object('at', c.at, 'app', c.app, 'version', c.version, 'cuenta', c.cuenta,
                       'device', c.device, 'pagina', c.pagina, 'online', c.online, 'donde', c.donde) order by c.at desc)
                    from (select * from uso_errores c where c.mensaje = er.mensaje and c.at > now() - interval '30 days' order by c.at desc limit 15) c)
        ) e
        from uso_errores er where er.at > now() - interval '30 days'
        group by er.mensaje order by count(distinct er.device) desc, count(*) desc limit 200) s), '[]'::jsonb),
    'resueltos', coalesce((select jsonb_agg(jsonb_build_object('mensaje', mensaje, 'nota', nota, 'at', at)) from uso_errores_resueltos), '[]'::jsonb)
  )
$$;
revoke all on function public.uso_admin_resumen() from public;
revoke all on function public.uso_admin_resumen() from anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.uso_admin_resumen() from authenticated;
  end if;
end $$;
grant execute on function public.uso_admin_resumen() to service_role;
