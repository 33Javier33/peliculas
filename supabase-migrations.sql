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
