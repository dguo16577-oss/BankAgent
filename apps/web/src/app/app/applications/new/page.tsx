import { ApplicationForm } from "@/features/applications/application-pages";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  return <ApplicationForm productId={product} />;
}
