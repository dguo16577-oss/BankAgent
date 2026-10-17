import { NewInvestment } from "@/features/wealth/new-investment";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ suitabilityCheckId?: string | string[] }>;
}) {
  const { productId } = await params;
  const { suitabilityCheckId } = await searchParams;
  return (
    <NewInvestment
      productId={productId}
      checkId={
        typeof suitabilityCheckId === "string" ? suitabilityCheckId : undefined
      }
    />
  );
}
