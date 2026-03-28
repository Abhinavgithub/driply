import { Suspense } from "react";

import SignUpPageClient from "@/components/sign-up-page-client";

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="mx-auto flex min-h-[70vh] max-w-md items-center" />}>
      <SignUpPageClient />
    </Suspense>
  );
}
