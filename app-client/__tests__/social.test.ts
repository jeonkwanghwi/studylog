import * as AppleAuthentication from "expo-apple-authentication";

import { AppleUnavailable, signInWithApple } from "../src/auth/social";

jest.mock("expo-apple-authentication");

describe("Apple 로그인", () => {
  afterEach(() => jest.resetAllMocks());

  it("id_token 을 돌려준다", async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: "apple-id-token",
    });

    await expect(signInWithApple()).resolves.toBe("apple-id-token");
  });

  it("기기가 지원하지 않으면 구분 가능한 에러를 던진다", async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await expect(signInWithApple()).rejects.toBeInstanceOf(AppleUnavailable);
  });

  it("유저가 취소하면 null 토큰을 그냥 통과시키지 않는다", async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: null,
    });

    await expect(signInWithApple()).rejects.toThrow(/identityToken/);
  });
});
