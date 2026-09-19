import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

/**
 * 이 파일은 src/auth/social 을 **모킹하지 않는다**.
 *
 * login.test.tsx 는 social 을 통째로 모킹해서, 설정이 없을 때 Google 훅이
 * 렌더 도중 던지는 문제를 영원히 못 잡았다. 실기기에서 로그인 화면이
 * 통째로 크래시하고 나서야 발견됐다 — 카카오·Apple 버튼까지 같이 죽어서
 * 앱에 들어갈 방법이 아예 없었다.
 *
 * 카카오는 이 문제가 없다(useAuthRequest 는 clientId 가 비어도 던지지 않는다).
 * 코드에는 키가 없으면 버튼을 잠그는 가드를 넣어뒀지만, 그걸 테스트하려면
 * 앱 매니페스트까지 흉내내야 해서 여기서는 다루지 않는다.
 */

function Harness({ useHook }: { useHook: () => { request: unknown } }) {
  const { request } = useHook();
  return <Text>{request ? "준비됨" : "잠김"}</Text>;
}

describe("소셜 로그인 설정 누락", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  it("Google client id 가 하나도 없으면 던지지 않고 버튼만 잠근다", async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

    const { useGoogleIdToken } = require("../src/auth/social");
    await render(<Harness useHook={useGoogleIdToken} />);

    expect(screen.getByText("잠김")).toBeTruthy();
  });
});
