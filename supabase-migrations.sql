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
