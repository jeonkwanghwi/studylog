/**
 * 결제 SDK 는 실제로 결제할 때만 불러온다.
 *
 * react-native-purchases 는 네이티브 모듈이라 Expo Go 에는 들어 있지 않다.
 * 최상단에서 import 하면 앱이 켜지는 순간 이 모듈이 로드돼서, 결제와 아무
 * 상관없는 화면까지 전부 못 뜬다. 개발 빌드에서도 앱 시작을 느리게 만들
 * 이유가 없다.
 */
async function sdk() {
  return (await import("react-native-purchases")).default;
}

/**
 * RevenueCat 의 appUserID 는 반드시 우리 서버의 user.id 와 같아야 한다.
 * 웹훅이 app_user_id 로 유저를 찾기 때문에, 다르면 결제는 되는데
 * 챌린지가 안 열린다.
 */
export async function initPurchases(userId: string): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_KEY;
  if (!apiKey) throw new Error("EXPO_PUBLIC_REVENUECAT_KEY 가 없습니다.");
  const Purchases = await sdk();
  await Purchases.configure({ apiKey, appUserID: userId });
}

/**
 * 결제만 한다. 크레딧 지급과 챌린지 개설은 서버가 웹훅으로 처리하므로,
 * 여기서 서버에 "샀다"고 알리는 경로는 만들지 않는다.
 */
export async function buyProduct(productId: string): Promise<void> {
  const Purchases = await sdk();
  const products = await Purchases.getProducts([productId]);
  const product = products.find((p) => p.identifier === productId);
  if (!product) throw new Error(`스토어에 없는 상품입니다: ${productId}`);
  await Purchases.purchaseStoreProduct(product);
}
