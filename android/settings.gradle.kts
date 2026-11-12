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
// Esferas de reloj (Wear OS)
include(":esfera-explorer")
project(":esfera-explorer").projectDir = file("esferas-de-reloj/explorer")
