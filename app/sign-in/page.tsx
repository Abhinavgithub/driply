import { Suspense } from "react";

import SignInPageClient from "@/components/sign-in-page-client";

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="mx-auto flex min-h-[70vh] max-w-md items-center" />}>
      <SignInPageClient />
    </Suspense>
  );
}
