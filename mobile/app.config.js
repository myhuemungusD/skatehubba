export default {
  expo: {
    name: "SkateHubba",
    slug: "skatehubba",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "skatehubba",

    // REQUIRED FOR EXPO ROUTER
    entryPoint: "expo-router/entry",

    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0a0a0a"
    },

    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.skathubba.app",
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        NSCameraUsageDescription: "SkateHubba needs camera access to record trick videos for challenges.",
        NSLocationWhenInUseUsageDescription: "SkateHubba needs your location to discover nearby skate spots and enable AR check-ins.",
        NSMicrophoneUsageDescription: "SkateHubba needs microphone access to record audio with your trick videos."
      }
    },

    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0a0a0a"
      },
      package: "com.skathubba.app",
      googleServicesFile: "./google-services.json",

      permissions: [
        "CAMERA",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECORD_AUDIO",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    },

    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },

    plugins: [
      "expo-router",
      [
        "expo-build-properties",
        {
          android: { compileSdkVersion: 34, targetSdkVersion: 34, minSdkVersion: 23 }
        }
      ],
      [
        "react-native-vision-camera",
        {
          cameraPermissionText: "Allow SkateHubba to access your camera to record trick videos.",
          enableMicrophonePermission: true,
          microphonePermissionText: "Allow SkateHubba to access your microphone to record audio with trick videos."
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow SkateHubba to use your location to discover skate spots."
        }
      ]
    ],

    experiments: { typedRoutes: true },

    extra: {
      router: { origin: false },
      eas: {
        projectId: "682cb6d2-cf8f-407c-a7f1-1069c45156dd"
      }
    },

    androidStatusBar: { backgroundColor: "#0a0a0a" },
    androidNavigationBar: { backgroundColor: "#0a0a0a" }
  }
};
