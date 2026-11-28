plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The phone shows the same page as the Windows app (the repository's www/ folder, with its 21 languages):
// it is copied into the APK at build time, and host.js connects it to the phone's engine.
val wwwOut = layout.buildDirectory.dir("generated/www")
val copyWww by tasks.registering(Copy::class) {
    from(rootProject.file("../www"))
    into(wwwOut.map { it.dir("www") })
}

android {
    namespace = "com.gabrydl99.gfc"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.gabrydl99.gfc"
        minSdk = 26
        targetSdk = 35
        // must stay above the APK already on the phone (107000 = 1.7.0), so it installs as an update
        versionCode = (project.findProperty("appCode") as String?)?.toInt() ?: 108000
        versionName = (project.findProperty("appVersion") as String?) ?: "1.8.0"
    }

    sourceSets["main"].assets.srcDir(wwwOut)

    buildTypes {
        release { isMinifyEnabled = false }
    }

    packaging {
        // ffmpeg ships as lib/<abi>/libffmpeg.so and is run as a program, so it must be extracted on install
        jniLibs { useLegacyPackaging = true }
        resources { excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*", "META-INF/*.kotlin_module") }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint { checkReleaseBuilds = false; abortOnError = false }
}

tasks.named("preBuild") { dependsOn(copyWww) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("com.tom-roush:pdfbox-android:2.0.27.0")
}
