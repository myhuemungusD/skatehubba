import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * True when running inside the Expo Go client app.
 * Native-only libraries (react-native-maps, react-native-vision-camera)
 * are unavailable in Expo Go and must show fallback UI.
 */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
