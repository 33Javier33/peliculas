# App de Android (APK)

Envuelve la app web (https://peliculas-neon.vercel.app) y le suma lo que el navegador no permite:

- **Audio de YouTube desde el teléfono** (NewPipe Extractor + servidor local 127.0.0.1): YouTube no lo bloquea.
- **Sigue sonando con la pantalla bloqueada y en otras apps** (servicio en primer plano, el WebView no se pausa).
- **Notificación con controles** (también pantalla bloqueada y auriculares) → `window.__cpnNativeAction`.

La web detecta la app con `window.CPNNative` (`lib/native.ts`).

El APK lo arma GitHub Actions (`.github/workflows/android.yml`) en cada cambio de esta carpeta y lo publica en
la versión **android-latest**: https://github.com/33Javier33/peliculas/releases/download/android-latest/CarlosPNauto.apk

Firma: la de depuración guardada en la caché privada de GitHub Actions (cada APK actualiza al anterior),
o una propia con los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y
`ANDROID_KEY_PASSWORD`. La firma nunca se sube al repositorio.
