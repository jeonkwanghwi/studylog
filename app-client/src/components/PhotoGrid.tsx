import { Image, View } from "react-native";

import type { FeedPhotoOut } from "../api/types";
import { color, radius, space } from "../design/tokens";

const SIZE = 96;

/** 인증샷을 그대로 보여준다. 흐림·숨김 없이 — 서로 보는 것이 부정행위 억제 장치다. */
export function PhotoGrid({ photos }: { photos: FeedPhotoOut[] }) {
  if (photos.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {photos.map((photo) => (
        <Image
          key={photo.url}
          testID="feed-photo"
          source={{ uri: photo.url }}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: radius.chip,
            backgroundColor: color.fill,
          }}
        />
      ))}
    </View>
  );
}
