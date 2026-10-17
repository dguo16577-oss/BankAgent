import { ProductDetail } from "@/features/public/catalog-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductDetail slug={slug} />;
}
