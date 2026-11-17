# Integración de Películas con Supabase

## 📋 Resumen

Se ha integrado la app de películas con Supabase para:
- Sincronizar historial de reproducción ("Seguir viendo")
- Sincronizar estado de descargas
- Mantener caché local para funcionamiento offline

**Proyecto Supabase**: socios-comicion-propina  
**URL**: https://teemahksasdougehrcly.supabase.co  
**Tabla Base**: socios (reutilización del almacenamiento existente)

---

## 🚀 Pasos de Implementación

### 1️⃣ Crear las Tablas en Supabase

Accede a Supabase y ejecuta el SQL en `supabase-migrations.sql`:

```bash
# En la consola de Supabase:
1. Ir a SQL Editor
2. Crear una nueva consulta
3. Copiar y pegar el contenido de supabase-migrations.sql
4. Ejecutar
```

**Tablas creadas:**
- `movies` - Catálogo de películas
- `movie_watching` - Historial de reproducción
- `movie_downloads` - Películas descargadas para offline

---

### 2️⃣ Variables de Entorno

Crear `.env.local` en `/peliculas/`:

```env
# Supabase (socios-comicion-propina)
NEXT_PUBLIC_SUPABASE_URL=https://teemahksasdougehrcly.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZW1haGtzYXNkb3VnZWhyY2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTkwNjIsImV4cCI6MjA5Njg3NTA2Mn0.EIQ7gRcwf3zYgvGESKw3s5lnZMABN_EuNWsrJK3L1zk
```

**⚠️ IMPORTANTE**: El `.env.local` **NO debe hacerse push** (ya está en `.gitignore`).

---

### 3️⃣ Instalar Dependencias

```bash
cd /home/user/peliculas
npm install
```

Se agregó: `@supabase/supabase-js@^2.45.0`

---

### 4️⃣ Integrar en la App

#### En `app/peliculas/page.tsx` (o donde inicie la app):

```tsx
'use client'

import { useMovieSyncSupabase } from '@/hooks/useMovieSyncSupabase'

export default function MoviesPage() {
  // Iniciar sincronización automática con Supabase
  useMovieSyncSupabase({ userId: 'default-user' })
  
  // ... resto del componente
  return (
    <>
      {/* Tu contenido */}
    </>
  )
}
```

---

### 5️⃣ Usar en Componentes

El flujo es automático: los cambios en `useMovieStore` se sincronizan con Supabase en background.

```tsx
import { useMovieStore } from '@/store/movieStore'

export function MoviePlayer({ movie }) {
  const saveProgress = useMovieStore(s => s.saveProgress)
  
  // Cuando el usuario ve una película, se guarda automáticamente
  const handleTimeUpdate = (currentTime: number, duration: number) => {
    saveProgress(movie, currentTime, duration)
    // ✅ Automáticamente se sincroniza con Supabase en background
  }
  
  // ... resto del componente
}
```

---

## 🔄 Flujo de Sincronización

```
┌─────────────────────────────────────┐
│  Usuario interactúa con películas   │
│  (reproduce, descarga, etc.)        │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌────────────────┐
        │ localStorage   │ ◄─── Caché local (funciona offline)
        │ (movieStore)   │
        └────────────────┘
               │
               │ (Con conexión)
               ▼
        ┌────────────────┐
        │  Supabase DB   │ ◄─── Sincronización en background
        │  (socios-comicion) │
        └────────────────┘
```

**Comportamiento:**
- ✅ **Sin conexión**: Usa localStorage (funciona normalmente)
- ✅ **Con conexión**: Sincroniza cambios automáticamente
- ✅ **Reconexión**: Al volver online, sincroniza cambios pendientes
- ✅ **Múltiples dispositivos**: El historial se sincroniza entre ellos

---

## 📊 Tablas de Base de Datos

### `movies`
```sql
- id (uuid, PK)
- source (text): 'archive_es', 'archive_classic', 'pluto', 'cinelatino'
- title (text)
- summary (text, máx 400 chars)
- url (text)
- poster (text)
- duration (integer)
- genre (text)
- year (integer)
- director (text)
- created_at (timestamp)
- updated_at (timestamp)
```

### `movie_watching`
```sql
- id (uuid, PK)
- movie_id (uuid, FK → movies.id)
- user_id (text): 'default-user' o ID del usuario
- progress_seconds (integer): segundo donde quedó
- total_duration (integer)
- watched_at (timestamp)
- created_at (timestamp)
- updated_at (timestamp)
```

### `movie_downloads`
```sql
- id (uuid, PK)
- movie_id (uuid, FK → movies.id)
- user_id (text)
- url (text)
- parts_downloaded (integer)
- size_downloaded (bigint)
- total_size (bigint)
- mime_type (text)
- is_complete (boolean)
- saved_at (timestamp)
- created_at (timestamp)
- updated_at (timestamp)
```

---

## 🛠️ Funciones Disponibles

En `lib/supabase-movies.ts`:

### Películas
```ts
addMovie(movie, source)              // Agregar película al catálogo
getMoviesBySource(source)            // Obtener películas por fuente
```

### Seguir Viendo
```ts
saveWatchProgress(...)               // Guardar progreso de reproducción
getWatchingList(userId)              // Obtener lista de "seguir viendo"
deleteWatchingEntry(movieId, userId) // Eliminar de lista
```

### Descargas
```ts
saveDownloadProgress(...)            // Guardar progreso de descarga
getDownloadsList(userId)             // Obtener descargas
deleteDownload(movieId, userId)      // Eliminar descarga
getCompleteDownloads(userId)         // Solo descargas completas
```

### Sincronización
```ts
syncWatchingWithSupabase(...)        // Sincronizar historial
syncDownloadsWithSupabase(...)       // Sincronizar descargas
```

---

## 🧪 Pruebas Recomendadas

1. **Offline-first**:
   - Desconectar internet
   - Reproducir película
   - Verificar que se guarde en localStorage
   - Reconectar internet
   - Verificar sincronización en Supabase

2. **Multi-dispositivo**:
   - Reproducir película en Dispositivo A
   - Verificar que aparezca en Dispositivo B
   - Sincronización automática

3. **Descargas**:
   - Descargar película sin conexión
   - Iniciar descarga, interrumpir
   - Reconectar y retomar descarga
   - Verificar que se marque como completa

---

## 📝 Variables del Componente Root

Para identificar al usuario (si es necesario):

```tsx
useMovieSyncSupabase({ 
  userId: 'mi-usuario-123', // O dinámico desde auth
  debounceMs: 3000,          // Esperar 3s antes de sincronizar
  syncIntervalMs: 30000      // Sincronizar cada 30s
})
```

---

## ⚙️ Configuración Avanzada

### Cambiar intervalo de sincronización

```ts
// En el layout o página raíz
useMovieSyncSupabase({ 
  userId: 'default-user',
  syncIntervalMs: 60000  // Sincronizar cada minuto (menos frecuente)
})
```

### Cargar historial al iniciar

```ts
// En un layout o componente que monte una sola vez
useLoadMovieHistoryFromSupabase('default-user')
```

---

## 🐛 Solución de Problemas

### "No se sincroniza"
- ✅ Verificar conexión a internet
- ✅ Verificar que las variables de entorno están configuradas
- ✅ Verificar que las tablas existen en Supabase
- ✅ Revisar la consola del navegador (pestana Network/Console)

### "Películas no aparecen"
- ✅ Verificar que `addMovie()` se llamó después de crear tablas
- ✅ Verificar permisos RLS en Supabase

### "Descarga se cancela"
- ✅ Verificar que el usuario tiene permiso de escritura
- ✅ Verificar tamaño disponible en dispositivo

---

## 🚀 Deploy a Producción

1. **Verificar variables de entorno** en la plataforma de deploy (Vercel, etc.)
2. **Ejecutar migraciones** en Supabase si no se hizo
3. **Testing en staging** antes de producción
4. **Monitorear logs** después del deploy

---

## 📌 Notas Importantes

- ✅ El caché local (localStorage) se mantiene como línea de defensa
- ✅ Funciona completamente offline
- ✅ Sincronización bidireccional (lee y escribe desde Supabase)
- ✅ No requiere autenticación (usa `user_id` texto simple)
- ✅ Cada usuario tiene sus propios datos (`user_id` los aísla)

---

## 📞 Contacto

Para soporte o preguntas:
- Revisar logs en Supabase > Logs
- Revisar console del navegador (F12)
- Contactar al equipo de desarrollo
