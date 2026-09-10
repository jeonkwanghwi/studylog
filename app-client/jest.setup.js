process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:8000";

jest.mock("@expo-google-fonts/ibm-plex-sans-kr", () => ({
  useFonts: () => [true],
  IBMPlexSansKR_400Regular: "IBMPlexSansKR_400Regular",
  IBMPlexSansKR_700Bold: "IBMPlexSansKR_700Bold",
}));
jest.mock("@expo-google-fonts/ibm-plex-mono", () => ({
  IBMPlexMono_600SemiBold: "IBMPlexMono_600SemiBold",
}));
