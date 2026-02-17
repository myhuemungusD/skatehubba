module.exports = {
  expo: {
    name: "SkateHubba",
    slug: "skatehubba",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "skatehubba",

    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0a0a0a"
    },

    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.skatehubba.app",
      googleServicesFile: "./GoogleService-Info.plist",
      associatedDomains: ["applinks:skatehubba.com"],
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
      package: "com.skatehubba.app",
      googleServicesFile: "./google-services.json",

      permissions: [
        "CAMERA",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECORD_AUDIO",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ],

      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          data: [
            { scheme: "https", host: "skatehubba.com", pathPrefix: "/game/" },
            { scheme: "https", host: "skatehubba.com", pathPrefix: "/challenge/" }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
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
          android: { compileSdkVersion: 36, targetSdkVersion: 36, minSdkVersion: 24 }
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#ff6600",
          sounds: [],
          defaultChannel: "default"
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
      ],
      [
        "./plugins/withCertificatePinning",
        {
          domains: [
            // Production API — pins are injected via env vars at build time.
            // Set EXPO_PUBLIC_CERT_PIN_API_PRIMARY and EXPO_PUBLIC_CERT_PIN_API_BACKUP
            // to the SPKI SHA-256 hashes of your server's certificate chain.
            process.env.EXPO_PUBLIC_CERT_PIN_API_PRIMARY && {
              hostname: process.env.EXPO_PUBLIC_APP_ENV === "staging"
                ? "staging-api.skatehubba.com"
                : "api.skatehubba.com",
              includeSubdomains: false,
              pins: [
                process.env.EXPO_PUBLIC_CERT_PIN_API_PRIMARY,
                process.env.EXPO_PUBLIC_CERT_PIN_API_BACKUP,
              ].filter(Boolean),
            },
          ].filter(Boolean),
          pinExpiration: process.env.EXPO_PUBLIC_CERT_PIN_EXPIRATION || "2027-06-01",
          allowDebugOverrides: process.env.EXPO_PUBLIC_APP_ENV !== "prod",
        }
      ]
    ],

    experiments: { typedRoutes: true },

    extra: {
      router: { origin: false },
      privacyPolicyUrl: "https://skatehubba.com/privacy",
      termsOfServiceUrl: "https://skatehubba.com/terms",
      eas: {
        projectId: "682cb6d2-cf8f-407c-a7f1-1069c45156dd"
      }
    },

    androidStatusBar: { backgroundColor: "#0a0a0a" },
    androidNavigationBar: { backgroundColor: "#0a0a0a" }
  }
};
