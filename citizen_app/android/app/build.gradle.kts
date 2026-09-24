plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied last
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.example.aapdasetu_v2"
    
    // Explicitly set for Android 16 (API 36)
    compileSdk = 36 
    ndkVersion = "27.0.12077973" // Modern NDK for 2026 builds
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.example.aapdasetu_v2"
        
        // Android 16 compatibility
        minSdk = 24 
        targetSdk = 36 
        
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Required for 16KB page size devices (like Android 16 hardware)
        packaging {
            jniLibs {
                useLegacyPackaging = false
            }
        }
    }

    buildTypes {
        getByName("release") {
            // Correct Kotlin DSL syntax
            isMinifyEnabled = false
            isShrinkResources = false
            
            signingConfig = signingConfigs.getByName("debug")
        }
        
        getByName("debug") {
            // You don't usually need anything here for debug
        }
    }
}

flutter {
    source = "../.."
}