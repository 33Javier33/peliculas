plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

// Lo que comparten todas las esferas: accesos directos (PulsoMedia, PulsoMusic, alarmas…),
// la marca Carlos P. Nauto Interactive y la pantalla de Personalizar.
android {
    namespace = "cl.carlospnauto.esfera.comun"
    compileSdk = 35

    defaultConfig {
        minSdk = 30
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
    api("androidx.core:core-ktx:1.13.1")
    api("androidx.activity:activity-ktx:1.9.3")
    api("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    api("androidx.wear.watchface:watchface:1.2.1")
    api("androidx.wear.watchface:watchface-complications-rendering:1.2.1")
    api("androidx.wear.watchface:watchface-editor:1.2.1")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
