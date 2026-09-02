import Link from "next/link";

export default function NotFound() {
  return (
    <section className="app-card rounded-3xl p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">Page not found</h2>
      <p className="mt-2 text-sm muted-copy">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/today" className="button-primary mt-6 inline-flex">
        Go to Today
      </Link>
    </section>
  );
}
