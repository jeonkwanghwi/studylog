import { shrinkForUpload } from "../src/api/shrink";

// 네이티브 모듈을 흉내낸다. 체이닝이 그대로 되도록 같은 모양을 만든다.
// jest.mock 의 팩토리는 바깥 변수를 못 보므로 이름에 mock 을 붙여야 한다.
const mockSaveAsync = jest.fn(async () => ({ uri: "file:///cache/small.jpg" }));
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();
const mockManipulate = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: "jpeg" },
}));

function withSize(width: number, height: number) {
  const rendered = { width, height, saveAsync: mockSaveAsync };
  mockResize.mockReturnValue({ renderAsync: async () => rendered });
  mockManipulate.mockReturnValue({ renderAsync: mockRenderAsync, resize: mockResize });
  mockRenderAsync.mockResolvedValue(rendered);
}

beforeEach(() => jest.clearAllMocks());

describe("업로드 전 사진 줄이기", () => {
  it("큰 사진은 긴 변을 1280 으로 맞춘다", async () => {
    withSize(3024, 4032);   // 아이폰 세로 사진
    const out = await shrinkForUpload("file:///cache/original.jpg");

    // 긴 변이 세로(4032)이므로 가로는 비율만큼 줄어든다: 3024 * 1280/4032 = 960
    expect(mockResize).toHaveBeenCalledWith({ width: 960 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.8, format: "jpeg" });
    expect(out).toBe("file:///cache/small.jpg");
  });

  it("가로 사진도 긴 변 기준으로 줄인다", async () => {
    withSize(4032, 3024);
    await shrinkForUpload("file:///cache/original.jpg");
    expect(mockResize).toHaveBeenCalledWith({ width: 1280 });
  });

  it("이미 작은 사진은 손대지 않는다", async () => {
    // 다시 인코딩하면 화질만 한 번 더 깎인다.
    withSize(1000, 800);
    const out = await shrinkForUpload("file:///cache/small-already.jpg");

    expect(mockResize).not.toHaveBeenCalled();
    expect(mockSaveAsync).not.toHaveBeenCalled();
    expect(out).toBe("file:///cache/small-already.jpg");
  });

  it("줄이는 데 실패해도 원본으로 올린다", async () => {
    // 이게 이 모듈에서 제일 중요한 성질이다. 인증은 앱의 핵심 동작이라
    // 사진을 줄이지 못했다는 이유로 막히면 안 된다. 네이티브 모듈이 없는
    // 예전 개발 빌드에서도 느릴 뿐 그대로 돌아가야 한다.
    mockManipulate.mockImplementation(() => {
      throw new Error("ExpoImageManipulator 모듈을 찾을 수 없습니다");
    });

    const out = await shrinkForUpload("file:///cache/original.jpg");
    expect(out).toBe("file:///cache/original.jpg");
  });

  it("저장 단계에서 실패해도 원본으로 올린다", async () => {
    withSize(3024, 4032);
    mockSaveAsync.mockRejectedValueOnce(new Error("디스크가 가득 찼습니다"));

    const out = await shrinkForUpload("file:///cache/original.jpg");
    expect(out).toBe("file:///cache/original.jpg");
  });
});
