plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// App para el reloj (Wear OS): controla la música de la app del teléfono y elige qué suena.
// Mismo identificador y misma firma que la app del teléfono (Wear OS lo exige para que se hablen).
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "cl.carlospnauto.wear"
    compileSdk = 35

    defaultConfig {
        applicationId = "cl.carlospnauto.app"
        minSdk = 28
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // Reloj de cada app (mismo identificador que su app del teléfono: Wear OS lo exige)
    flavorDimensions += "app"
    productFlavors {
        create("media") {
            dimension = "app"
            applicationId = "cl.carlospnauto.app"
        }
        create("music") {
            dimension = "app"
            applicationId = "cl.carlospnauto.music"
            versionName = "1.0.${(buildNumber - 53).coerceAtLeast(1)}"
        }
    }

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
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.wear.compose:compose-material:1.4.1")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.wear.compose:compose-navigation:1.4.1")
    implementation("androidx.wear:wear-remote-interactions:1.1.0")
    // Buscar dictando o con el teclado del reloj
    implementation("androidx.wear:wear-input:1.1.0")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    // Ver el video de lo que suena en el reloj
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    // Evento en curso en la esfera ("Sonando"): al tocarlo abre esta app
    implementation("androidx.wear:wear-ongoing:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
}
