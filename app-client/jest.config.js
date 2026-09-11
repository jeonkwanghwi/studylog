module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  // TanStack Query의 QueryClient는 캐시 GC용 타이머를 노드 이벤트 루프에
  // unref 없이 남긴다. 테스트가 실제로는 끝났는데도 jest가 그 타이머 때문에
  // 계속 대기하므로 강제 종료한다.
  forceExit: true,
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
};
