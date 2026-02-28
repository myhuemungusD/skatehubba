/**
 * Minimal react-native stub for vitest.
 * Prevents Rollup from trying to parse react-native's Flow syntax.
 * Individual test files can override via vi.mock("react-native", factory).
 */

class MockAnimatedValue {
  _value: number;
  constructor(val: number) {
    this._value = val;
  }
  setValue(_val: number) {}
  interpolate() {
    return this;
  }
}

export const View = "View";
export const Text = "Text";
export const Image = "Image";
export const ScrollView = "ScrollView";
export const FlatList = "FlatList";
export const TouchableOpacity = "TouchableOpacity";
export const TextInput = "TextInput";
export const Switch = "Switch";
export const ActivityIndicator = "ActivityIndicator";
export const Modal = "Modal";
export const Pressable = "Pressable";

export const StyleSheet = { create: <T extends Record<string, unknown>>(s: T): T => s };
export const Platform = {
  OS: "ios",
  select: <T>(obj: Record<string, T>): T | undefined => obj.ios ?? obj.default,
};
export const Dimensions = { get: () => ({ width: 375, height: 812 }) };
export const Alert = { alert: () => {} };
export const Keyboard = { dismiss: () => {}, addListener: () => ({ remove: () => {} }) };
export const Linking = { openURL: async () => {}, canOpenURL: async () => true };
export const Animated = {
  View: "Animated.View",
  Text: "Animated.Text",
  Image: "Animated.Image",
  Value: MockAnimatedValue,
  timing: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
  spring: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
  sequence: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
  parallel: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
  loop: () => ({ start: () => {}, stop: () => {} }),
  event: () => () => {},
  createAnimatedComponent: <T>(c: T): T => c,
};
