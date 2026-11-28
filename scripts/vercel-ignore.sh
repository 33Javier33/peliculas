#!/bin/bash
# Paso «Ignored Build Step» de Vercel: decide si vale la pena armar la web.
#   exit 0 → NO se arma (no gasta minutos de compilación)
#   exit 1 → se arma
# Cada compilación gasta minutos de CPU de Vercel: antes se armaba con cada cambio, aunque fuera
# solo de la app de Android, del reloj o de las esferas (que no cambian la web).

# Solo la rama principal se publica (las otras ramas no necesitan su propia copia)
if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
  echo "Rama $VERCEL_GIT_COMMIT_REF: no se publica"
  exit 0
fi

# Desde la última publicación (o el cambio anterior): ¿cambió algo de la web?
BASE="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
if ! git cat-file -e "$BASE" 2>/dev/null; then
  echo "No se encuentra la versión anterior ($BASE): se arma por si acaso"
  exit 1
fi
if git diff --quiet "$BASE" HEAD -- . \
  ':(exclude)android' \
  ':(exclude).github' \
  ':(exclude)supabase-migrations.sql' \
  ':(exclude)*.md'; then
  echo "Solo cambió la app de Android, el reloj u otros archivos que no son de la web: no se arma"
  exit 0
fi
echo "Cambió la web: se arma"
exit 1
