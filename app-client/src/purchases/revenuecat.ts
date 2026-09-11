import Purchases from "react-native-purchases";

/**
 * RevenueCat 의 appUserID 는 반드시 우리 서버의 user.id 와 같아야 한다.
 * 웹훅이 app_user_id 로 유저를 찾기 때문에, 다르면 결제는 되는데
 * 챌린지가 안 열린다.
 */
export async function initPurchases(userId: string): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_KEY;
  if (!apiKey) throw new Error("EXPO_PUBLIC_REVENUECAT_KEY 가 없습니다.");
  await Purchases.configure({ apiKey, appUserID: userId });
}

/**
 * 결제만 한다. 크레딧 지급과 챌린지 개설은 서버가 웹훅으로 처리하므로,
 * 여기서 서버에 "샀다"고 알리는 경로는 만들지 않는다.
 */
export async function buyProduct(productId: string): Promise<void> {
  const products = await Purchases.getProducts([productId]);
  const product = products.find((p) => p.identifier === productId);
  if (!product) throw new Error(`스토어에 없는 상품입니다: ${productId}`);
  await Purchases.purchaseStoreProduct(product);
}
