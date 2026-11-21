plugins {
    id("com.android.application")
}

android {
    namespace = "space.notka.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "space.notka.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 35
        versionName = "2.6.3"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Native framework only - minimal footprint, pure WebView shell
}
