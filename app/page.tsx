import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";

function FeatureCard(props: { title: string; body: string }) {
  return (
    <article className="app-card rounded-[1.75rem] p-5">
      <h2 className="text-base font-semibold text-foreground">{props.title}</h2>
      <p className="mt-2 text-sm leading-6 muted-copy">{props.body}</p>
    </article>
  );
}

function OutfitPreviewCard() {
  return (
    <section className="app-card relative overflow-hidden rounded-[2rem] p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(17,17,17,0.06),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(17,17,17,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_35%)]" />
      <div className="relative space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] muted-copy">Today’s Look</div>
            <div className="mt-1 text-lg font-semibold text-foreground">Weather-aware outfit picks</div>
          </div>
          <span className="pill">18.5°C</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Top", name: "Striped Shirt" },
            { label: "Bottom", name: "Wide Jeans" },
            { label: "Shoes", name: "White Sneakers" },
          ].map((item, index) => (
            <div key={item.label} className="subtle-card rounded-[1.4rem] p-3">
              <div
                className={`h-32 rounded-[1rem] ${
                  index === 0
                    ? "bg-[linear-gradient(160deg,#dbd8d3,#f6f3ee)] dark:bg-[linear-gradient(160deg,#2a2a2d,#1b1b1d)]"
                    : index === 1
                      ? "bg-[linear-gradient(160deg,#c9d3e4,#eef2f9)] dark:bg-[linear-gradient(160deg,#242b34,#1a1f26)]"
                      : "bg-[linear-gradient(160deg,#d9d9d7,#f7f7f4)] dark:bg-[linear-gradient(160deg,#303034,#1e1e20)]"
                }`}
              />
              <div className="mt-3 text-[11px] uppercase tracking-[0.12em] muted-copy">{item.label}</div>
              <div className="mt-1 text-sm font-medium text-foreground">{item.name}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="pill">Color match</span>
          <span className="pill">Smart casual</span>
          <span className="pill">Rain ready</span>
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/today");
  }

  return (
    <div className="space-y-10 pb-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-surface px-6 py-10 shadow-[var(--shadow-soft)] sm:px-10 sm:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(17,17,17,0.08),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(17,17,17,0.05),transparent_34%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_34%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="pill mb-5">Personal wardrobe assistant</div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Outfit recommendations from clothes you already own.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 muted-copy sm:text-lg">
              Upload your wardrobe once, then get daily outfit combinations based on weather, color harmony, and style fit.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-up" className="button-primary">
                Get Started with driply
              </Link>
            </div>
          </div>

          <OutfitPreviewCard />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FeatureCard
          title="Upload your wardrobe"
          body="Add tops, bottoms, and shoes once with simple attributes so Driply can work with your real closet."
        />
        <FeatureCard
          title="Get daily outfit picks"
          body="See complete looks built around weather, style consistency, and color combinations that make sense."
        />
        <FeatureCard
          title="Keep it personal"
          body="Your wardrobe stays private to your account, and your recommendations improve as your closet grows."
        />
      </section>
    </div>
  );
}
