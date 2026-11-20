plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Esfera de reloj "clasica" (Wear OS).
// Se publica junto a las apps con el mismo número de versión.
// Versión según los cambios de la esfera (y de esferas-comun): solo sube si la esfera cambió, así
// la app del reloj sabe cuáles hay que actualizar. Desde 1000 (antes era el número de compilación).
val faceChanges = providers.exec {
    commandLine("git", "rev-list", "--count", "HEAD", "--", projectDir.absolutePath, rootProject.file("esferas-comun").absolutePath)
    isIgnoreExitValue = true
}.standardOutput.asText.get().trim().toIntOrNull() ?: 0

android {
    namespace = "cl.carlospnauto.esfera"
    compileSdk = 35

    defaultConfig {
        applicationId = "cl.carlospnauto.esfera.clasica"
        minSdk = 30
        targetSdk = 34
        versionCode = 1000 + faceChanges
        versionName = "2.$faceChanges"
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
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), rootProject.file("esferas-comun/proguard-esferas.pro"))
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
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
    implementation(project(":esferas-comun"))
}
