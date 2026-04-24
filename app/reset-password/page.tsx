import { Suspense } from "react";

import ResetPasswordPageClient from "@/components/reset-password-page-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div />}>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
