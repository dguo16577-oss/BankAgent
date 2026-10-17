import { ProductDetail } from "@/features/wealth/product-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const values = await params;
  return <ProductDetail {...values} />;
}
