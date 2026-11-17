-- ============================================================
-- Migraciones para Películas usando Supabase (socios-comicion)
-- ============================================================

-- Tabla 1: Catálogo de películas
CREATE TABLE IF NOT EXISTS public.movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('archive_es', 'archive_classic', 'pluto', 'cinelatino')),
  title text NOT NULL,
  summary text,
  url text,
  poster text,
  duration integer,
  genre text,
  year integer,
  director text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(source, title, url)
);

-- Tabla 2: Historial de reproducción (seguir viendo)
CREATE TABLE IF NOT EXISTS public.movie_watching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id uuid NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  user_id text NOT NULL DEFAULT 'default-user',
  progress_seconds integer DEFAULT 0,
  total_duration integer,
  watched_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(movie_id, user_id)
);

-- Tabla 3: Películas descargadas para ver sin conexión
CREATE TABLE IF NOT EXISTS public.movie_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id uuid NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  user_id text NOT NULL DEFAULT 'default-user',
  url text,
  parts_downloaded integer DEFAULT 0,
  size_downloaded bigint DEFAULT 0,
  total_size bigint DEFAULT 0,
  mime_type text DEFAULT 'video/mp4',
  is_complete boolean DEFAULT false,
  saved_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(movie_id, user_id)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_movie_watching_user_id ON movie_watching(user_id);
CREATE INDEX IF NOT EXISTS idx_movie_watching_movie_id ON movie_watching(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_watching_watched_at ON movie_watching(watched_at DESC);

CREATE INDEX IF NOT EXISTS idx_movie_downloads_user_id ON movie_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_movie_downloads_movie_id ON movie_downloads(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_downloads_is_complete ON movie_downloads(is_complete);

CREATE INDEX IF NOT EXISTS idx_movies_source ON movies(source);

-- RLS: Permitir lectura pública de películas, pero controlar escritura
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movie_watching ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movie_downloads ENABLE ROW LEVEL SECURITY;

-- Policy: Todos pueden leer películas
CREATE POLICY "Películas: lectura pública"
  ON public.movies FOR SELECT
  USING (true);

-- Policy: Solo lectura de watching propio (por user_id)
CREATE POLICY "Watching: lectura propia"
  ON public.movie_watching FOR SELECT
  USING (true);

CREATE POLICY "Watching: escritura propia"
  ON public.movie_watching FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Watching: actualización propia"
  ON public.movie_watching FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Watching: eliminación propia"
  ON public.movie_watching FOR DELETE
  USING (true);

-- Policy: Downloads (similar a watching)
CREATE POLICY "Downloads: lectura propia"
  ON public.movie_downloads FOR SELECT
  USING (true);

CREATE POLICY "Downloads: escritura propia"
  ON public.movie_downloads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Downloads: actualización propia"
  ON public.movie_downloads FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Downloads: eliminación propia"
  ON public.movie_downloads FOR DELETE
  USING (true);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
DROP TRIGGER IF EXISTS update_movies_updated_at ON public.movies;
CREATE TRIGGER update_movies_updated_at BEFORE UPDATE ON public.movies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_movie_watching_updated_at ON public.movie_watching;
CREATE TRIGGER update_movie_watching_updated_at BEFORE UPDATE ON public.movie_watching
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_movie_downloads_updated_at ON public.movie_downloads;
CREATE TRIGGER update_movie_downloads_updated_at BEFORE UPDATE ON public.movie_downloads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
