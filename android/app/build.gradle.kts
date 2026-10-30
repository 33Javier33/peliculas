plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Número de versión: el de la compilación en GitHub (así cada APK nuevo actualiza al anterior)
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "cl.carlospnauto.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "cl.carlospnauto.app"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        // Dirección de la app web que se abre dentro de la app
        buildConfigField("String", "WEB_URL", "\"https://peliculas-neon.vercel.app\"")
    }

    // Firma: una propia si está configurada en los secretos de GitHub (ANDROID_KEYSTORE_*);
    // si no, la de depuración, que GitHub guarda entre compilaciones (caché privada) para que
    // cada APK nuevo se instale encima del anterior sin desinstalar.
    val keystorePath = System.getenv("ANDROID_KEYSTORE_FILE")
    signingConfigs {
        if (!keystorePath.isNullOrBlank() && file(keystorePath).exists()) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        // NewPipe Extractor necesita las bibliotecas de Java modernas en Android antiguo
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += setOf("META-INF/*.kotlin_module", "META-INF/LICENSE*", "META-INF/NOTICE*", "META-INF/DEPENDENCIES")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.media:media:1.7.0")
    // Extrae el audio y el video de YouTube desde el propio teléfono (como NewPipe)
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.26.5")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Pequeño servidor local: entrega el audio al reproductor de la app
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
