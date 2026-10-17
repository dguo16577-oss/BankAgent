import { LoginForm } from "@/features/security/login-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await searchParams;
  return <LoginForm reason={reason} next={next} />;
}
