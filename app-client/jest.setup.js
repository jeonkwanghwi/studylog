process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:8000";

jest.mock("expo-font", () => ({
  useFonts: () => [true],
  loadAsync: jest.fn(),
  isLoaded: () => true,
}));
