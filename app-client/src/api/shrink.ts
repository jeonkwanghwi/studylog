type Manipulator = typeof import("expo-image-manipulator");

/**
 * 네이티브 모듈을 쓸 때 불러온다.
 *
 * 맨 위에서 정적으로 import 하면, 모듈이 없는 빌드에서는 이 파일을 읽는
 * 순간 던진다 — 아래 try/catch 바깥이라 화면이 통째로 죽는다. 로그인
 * 화면이 구글 설정 없이 통째로 깨졌던 것과 같은 구조다. 호출 시점으로
 * 미루면 그 예외가 try 안에서 잡힌다.
 */
function load(): Manipulator {
  return require("expo-image-manipulator") as Manipulator;
}

/**
 * 서버와 같은 기준으로 맞춘다(server/app/config.py 의 image_max_edge,
 * image_jpeg_quality). 서버는 받은 사진을 어차피 이 크기로 다시 줄이므로,
 * 여기서 미리 맞춰 보내면 서버가 하는 일은 사실상 확인뿐이 된다.
 */
const MAX_EDGE = 1280;
const QUALITY = 0.8;

/**
 * 올리기 전에 사진을 줄인다.
 *
 * 아이폰 사진 한 장이 3~5MB 다. 그대로 올리면 느린 망에서 업로드가 오래
 * 걸리고 자주 실패하는데, 정작 서버는 받자마자 1280px 로 줄여서 버린다 —
 * 쓰지도 않을 픽셀을 셀룰러로 실어 나르고 있었다.
 *
 * **실패하면 원본 경로를 그대로 돌려준다.** 인증은 이 앱의 핵심 동작이라
 * 사진을 줄이지 못했다는 이유로 막히면 안 된다. 네이티브 모듈이 없는
 * 예전 개발 빌드에서도 앱이 그대로 돌아가야 한다 — 느릴 뿐이다.
 */
export async function shrinkForUpload(uri: string): Promise<string> {
  try {
    // 원본을 한 번만 읽는다. 렌더된 참조를 다시 입력으로 쓸 수 있어서
    // 크기를 재려고 디스크를 두 번 읽을 필요가 없다.
    const { ImageManipulator, SaveFormat } = load();
    const source = await ImageManipulator.manipulate(uri).renderAsync();
    const longest = Math.max(source.width, source.height);

    // 이미 작으면 건드리지 않는다. 다시 인코딩하면 화질만 한 번 더 깎인다.
    if (longest <= MAX_EDGE) return uri;

    const scale = MAX_EDGE / longest;
    const resized = await ImageManipulator.manipulate(source)
      .resize({ width: Math.round(source.width * scale) })
      .renderAsync();
    const saved = await resized.saveAsync({
      compress: QUALITY,
      format: SaveFormat.JPEG,
    });
    return saved.uri;
  } catch {
    return uri;
  }
}
