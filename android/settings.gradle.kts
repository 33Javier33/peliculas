pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
rootProject.name = "CarlosPNauto"
include(":app")
include(":wear")
// Esferas de reloj: lo común (accesos a PulsoMedia/PulsoMusic, marca, personalizar)
include(":esferas-comun")
// Esferas de reloj (Wear OS): cada carpeta de esferas-de-reloj es una esfera (un APK)
file("esferas-de-reloj").listFiles()
    ?.filter { File(it, "build.gradle.kts").exists() }
    ?.sortedBy { it.name }
    ?.forEach {
        include(":esfera-${it.name}")
        project(":esfera-${it.name}").projectDir = it
    }
