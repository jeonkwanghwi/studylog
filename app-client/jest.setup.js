process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:8000";

jest.mock("expo-font", () => ({
  useFonts: () => [true],
  loadAsync: jest.fn(),
  isLoaded: () => true,
}));

// 화면들이 useSafeAreaInsets 로 위아래 여백을 잡는다. 테스트는 Provider 없이
// 화면만 렌더하므로 훅이 던진다 — 라이브러리가 주는 목으로 대신한다.
// 라이브러리 목은 default 로만 내보내므로 펼쳐서 붙인다.
jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return { ...mock.default, __esModule: true };
});
