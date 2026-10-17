import { AuthBoundary } from "@/features/security/auth-boundary";
import { BankingLayout } from "@/components/banking-layout";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBoundary>
      <BankingLayout>{children}</BankingLayout>
    </AuthBoundary>
  );
}
