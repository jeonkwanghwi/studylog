import { Image, View } from "react-native";

import type { FeedPhotoOut } from "../api/types";
import { color, radius, space } from "../design/tokens";

/**
 * 인증샷을 그대로 보여준다. 흐림·숨김 없이 — 서로 보는 것이 부정행위 억제 장치다.
 *
 * 피드에서 읽을 것은 사진이다. 전에는 96px 정사각형으로 고정돼서 카드 한
 * 귀퉁이의 도장처럼 보였다. 가로를 채워서 실제로 무엇을 했는지 보이게 한다.
 * 한 장뿐일 때는 절반만 차지한다 — 시작 샷만 올린 상태가 하루를 끝낸 것처럼
 * 커 보이면 안 된다.
 */
export function PhotoGrid({ photos }: { photos: FeedPhotoOut[] }) {
  if (photos.length === 0) return null;
  const single = photos.length === 1;
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {photos.map((photo) => (
        <Image
          key={photo.url}
          testID="feed-photo"
          source={{ uri: photo.url }}
          resizeMode="cover"
          style={{
            flex: single ? undefined : 1,
            width: single ? "49%" : undefined,
            aspectRatio: 1,
            borderRadius: radius.chip,
            backgroundColor: color.fill,
            // 밝은 사진이 흰 배경과 만나면 가장자리가 사라진다.
            // 아주 옅은 검정 한 줄이면 어떤 사진에서도 형태가 유지된다.
            // 회색 계열 색을 쓰면 사진 색조에 따라 튄다 — 순수 검정 투명이어야 한다.
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.08)",
          }}
        />
      ))}
    </View>
  );
}
