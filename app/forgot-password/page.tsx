import { Suspense } from "react";

import ForgotPasswordPageClient from "@/components/forgot-password-page-client";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div />}>
      <ForgotPasswordPageClient />
    </Suspense>
  );
}
