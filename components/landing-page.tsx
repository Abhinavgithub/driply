"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Pointer-driven flourishes (magnetic buttons, tilt, spotlights, parallax) are
 * skipped on touch devices and when the user prefers reduced motion — they're
 * decorative, and on touch they fire on tap with no hover to reset them.
 */
function prefersInteractiveMotion() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: hover)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type OutfitItem = { label: string; name: string; img: string };
type Outfit = {
  label: string;
  temp: string;
  items: [OutfitItem, OutfitItem, OutfitItem];
  tags: [string, string, string];
  tagAccent: number;
};

const outfits: Outfit[] = [
  {
    label: "Today's look",
    temp: "18.5°C",
    items: [
      { label: "Top", name: "Striped Shirt", img: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200&h=267&fit=crop&q=80" },
      { label: "Bottom", name: "Wide Jeans", img: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=267&fit=crop&q=80" },
      { label: "Shoes", name: "White Sneakers", img: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=200&h=267&fit=crop&q=80" },
    ],
    tags: ["Color match", "Smart casual", "Rain ready"],
    tagAccent: 0,
  },
  {
    label: "Evening option",
    temp: "14°C",
    items: [
      { label: "Top", name: "Black Turtleneck", img: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200&h=267&fit=crop&q=80" },
      { label: "Bottom", name: "Slim Trousers", img: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=200&h=267&fit=crop&q=80" },
      { label: "Shoes", name: "Chelsea Boots", img: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=200&h=267&fit=crop&q=80" },
    ],
    tags: ["Monochrome", "Date night", "Cold snap"],
    tagAccent: 2,
  },
  {
    label: "Weekend fit",
    temp: "22°C",
    items: [
      { label: "Top", name: "Vintage Tee", img: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&h=267&fit=crop&q=80" },
      { label: "Bottom", name: "Cargo Shorts", img: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=200&h=267&fit=crop&q=80" },
      { label: "Shoes", name: "Loafers", img: "https://images.unsplash.com/photo-1531310197839-ccf54634509e?w=200&h=267&fit=crop&q=80" },
    ],
    tags: ["Chill vibes", "Breathable", "Sun ready"],
    tagAccent: 1,
  },
];

const marqueeItems = [
  "Weather-aware styling", "Color harmony matching", "Your wardrobe, only",
  "Daily outfit picks", "Zero waste fashion", "Gen-Z approved", "Privacy-first",
  "Weather-aware styling", "Color harmony matching", "Your wardrobe, only",
  "Daily outfit picks", "Zero waste fashion", "Gen-Z approved", "Privacy-first",
];

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.5 2.5l.7.7M8.8 8.8l.7.7M2.5 9.5l.7-.7M8.8 3.2l.7-.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1l1.5 3.5L12 6l-3.5 1.5L7 11l-1.5-3.5L2 6l3.5-1.5L7 1z" stroke="currentColor" strokeWidth="1.2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function LandingPage() {
  const [currentOutfit, setCurrentOutfit] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const badge1Ref = useRef<HTMLDivElement>(null);
  const badge2Ref = useRef<HTMLDivElement>(null);

  // Nav scroll
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handler = () => nav.classList.toggle("lp-nav-scrolled", window.scrollY > 40);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Scroll reveals + word reveals
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }); },
      { threshold: 0.15 }
    );

    container.querySelectorAll<HTMLElement>(".lp-reveal, .lp-word-reveal").forEach((el) => observer.observe(el));

    setTimeout(() => {
      container
        .querySelectorAll<HTMLElement>(".lp-hero .lp-reveal, .lp-hero .lp-word-reveal")
        .forEach((el) => el.classList.add("visible"));
    }, 100);

    return () => observer.disconnect();
  }, []);

  // Outfit auto-cycle
  useEffect(() => {
    const timer = setInterval(() => setCurrentOutfit((prev) => (prev + 1) % outfits.length), 3500);
    return () => clearInterval(timer);
  }, []);

  // Mobile menu keyboard / body-scroll lock
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsMobileMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [isMobileMenuOpen]);

  // Cursor spotlight — RAF loop starts only on first pointer move, skipped on touch devices
  useEffect(() => {
    const el = spotlightRef.current;
    if (!el || !prefersInteractiveMotion()) return;
    let spotX = 0, spotY = 0, targetX = 0, targetY = 0;
    let rafId: number;
    let running = false;
    let started = false;

    const tick = () => {
      const dx = targetX - spotX;
      const dy = targetY - spotY;
      spotX += dx * 0.12;
      spotY += dy * 0.12;
      el.style.transform = `translate(${spotX}px, ${spotY}px) translate(-50%, -50%)`;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        rafId = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX; targetY = e.clientY;
      if (!running) {
        running = true;
        if (!started) {
          started = true;
          spotX = targetX; spotY = targetY;
        }
        el.style.opacity = "1";
        rafId = requestAnimationFrame(tick);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(rafId); };
  }, []);

  // Magnetic buttons
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !prefersInteractiveMotion()) return;
    type H = { el: HTMLElement; onMove: (e: PointerEvent) => void; onLeave: () => void };
    const handlers: H[] = Array.from(
      container.querySelectorAll<HTMLElement>(".lp-btn-primary, .lp-nav-cta")
    ).map((btn) => {
      const onMove = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      };
      const onLeave = () => { btn.style.transform = ""; };
      btn.addEventListener("pointermove", onMove);
      btn.addEventListener("pointerleave", onLeave);
      return { el: btn, onMove, onLeave };
    });
    return () => handlers.forEach(({ el, onMove, onLeave }) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    });
  }, []);

  // 3D card tilt
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !prefersInteractiveMotion()) return;
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(1000px) rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 10}deg)`;
      card.style.setProperty("--mx", `${x * 100}%`);
      card.style.setProperty("--my", `${y * 100}%`);
    };
    const onLeave = () => { card.style.transform = ""; };
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    return () => { card.removeEventListener("pointermove", onMove); card.removeEventListener("pointerleave", onLeave); };
  }, []);

  // Feature card mouse-tracking spotlight
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !prefersInteractiveMotion()) return;
    const handlers = Array.from(container.querySelectorAll<HTMLElement>(".lp-feature-card")).map((fc) => {
      const fn = (e: PointerEvent) => {
        const r = fc.getBoundingClientRect();
        fc.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        fc.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
      };
      fc.addEventListener("pointermove", fn);
      return { el: fc, fn };
    });
    return () => handlers.forEach(({ el, fn }) => el.removeEventListener("pointermove", fn));
  }, []);

  // Parallax floating badges
  useEffect(() => {
    const b1 = badge1Ref.current, b2 = badge2Ref.current;
    if (!b1 || !b2 || !prefersInteractiveMotion()) return;
    const onScroll = () => {
      const y = window.scrollY;
      b1.style.translate = `0 ${y * -0.08}px`;
      b2.style.translate = `0 ${y * 0.05}px`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const outfit = outfits[currentOutfit];

  return (
    <div className="lp" ref={containerRef}>
      {/* CURSOR SPOTLIGHT */}
      <div className="lp-cursor-spotlight" ref={spotlightRef} />

      {/* NAV */}
      <nav ref={navRef} className={`lp-nav${isMobileMenuOpen ? " menu-open" : ""}`}>
        <div className="lp-nav-inner">
          <Link href="/" className="lp-nav-logo">
            drip<span>ly</span>
          </Link>
          <ul className="lp-nav-links">
            <li><a href="#how">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li>
              <Link href="/sign-in" className="lp-nav-cta lp-nav-cta-secondary">
                Open wardrobe
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="lp-nav-cta">
                Get started
              </Link>
            </li>
          </ul>
          <button
            type="button"
            className={`lp-hamburger${isMobileMenuOpen ? " open" : ""}`}
            onClick={() => setIsMobileMenuOpen((o) => !o)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div className="lp-mobile-menu">
          <Link href="/" className="lp-mobile-menu-logo" onClick={() => setIsMobileMenuOpen(false)}>
            drip<span>ly</span>
          </Link>
          <a href="#how" className="lp-mobile-menu-link" onClick={() => setIsMobileMenuOpen(false)}>How it works</a>
          <a href="#features" className="lp-mobile-menu-link" onClick={() => setIsMobileMenuOpen(false)}>Features</a>
          <div className="lp-mobile-divider" />
          <div className="lp-mobile-cta-group">
            <Link href="/sign-in" className="lp-mobile-btn-signin" onClick={() => setIsMobileMenuOpen(false)}>Open wardrobe</Link>
            <Link href="/sign-up" className="lp-mobile-btn-primary" onClick={() => setIsMobileMenuOpen(false)}>Get started</Link>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-aurora-blob b1" />
          <div className="lp-aurora-blob b2" />
          <div className="lp-aurora-blob b3" />
          <div className="lp-grid-overlay" />
        </div>

        <div className="lp-hero-left" style={{ position: "relative", zIndex: 2 }}>
          <div className="lp-hero-tag lp-reveal">
            <div className="lp-hero-tag-dot" />
            Your AI wardrobe assistant
          </div>
          <h1 className="lp-hero-headline">
            <span className="lp-word-reveal">
              <span style={{ transitionDelay: "0.05s" }}>Wear&nbsp;more</span>
            </span>
            <br />
            <span className="lp-word-reveal">
              <span style={{ transitionDelay: "0.15s" }}>of&nbsp;what&nbsp;you</span>
            </span>
            <br />
            <span className="lp-word-reveal">
              <span style={{ transitionDelay: "0.25s" }}><em>already&nbsp;own.</em></span>
            </span>
          </h1>
          <p className="lp-hero-sub lp-reveal lp-reveal-delay-2">
            driply turns your closet into daily ready-fits — tuned to the weather, your vibe, and colors that actually match.
          </p>
          <div className="lp-hero-actions lp-reveal lp-reveal-delay-3">
            <Link href="/sign-up" className="lp-btn-primary">
              Get started <ArrowIcon />
            </Link>
            <a href="#how" className="lp-btn-ghost">
              See how it works <ArrowIcon />
            </a>
          </div>
        </div>

        <div className="lp-hero-visual" style={{ position: "relative", zIndex: 2 }}>
          <div style={{ position: "relative" }}>
            <div className="lp-outfit-card" ref={cardRef}>
              <div className="lp-outfit-card-header">
                <div className="lp-outfit-card-title">{outfit.label}</div>
                <div className="lp-weather-pill">
                  <SunIcon />
                  <span>{outfit.temp}</span>
                </div>
              </div>
              <div className="lp-outfit-items">
                {outfit.items.map((item) => (
                  <div key={item.label} className="lp-outfit-item">
                    <div className="lp-outfit-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.img} alt={item.name} />
                    </div>
                    <div className="lp-outfit-label">{item.label}</div>
                    <div className="lp-outfit-name">{item.name}</div>
                  </div>
                ))}
              </div>
              <div className="lp-outfit-tags">
                {outfit.tags.map((tag, i) => (
                  <span key={tag} className={`lp-tag${i === outfit.tagAccent ? " lp-tag-accent" : ""}`}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="lp-cycle-indicator">
                {outfits.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`lp-cycle-dot${i === currentOutfit ? " active" : ""}`}
                    onClick={() => setCurrentOutfit(i)}
                    aria-label={`View outfit ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="lp-float-badge" ref={badge1Ref}>
              <div className="lp-float-badge-icon">✦</div>
              <div className="lp-float-badge-text">AI matched</div>
            </div>

            <div className="lp-float-badge2" ref={badge2Ref}>
              <StarIcon />
              Weather-ready
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="lp-marquee-section">
        <div className="lp-marquee-track">
          {marqueeItems.map((item, i) => (
            <div key={i} className="lp-marquee-item">
              <span className="lp-marquee-dot" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="lp-section" id="how">
        <div className="lp-section-tag lp-reveal">How it works</div>
        <h2 className="lp-section-title lp-reveal lp-reveal-delay-1">
          Three steps to<br />your best fit.
        </h2>
        <p className="lp-section-sub lp-reveal lp-reveal-delay-2">
          No subscriptions, no ads, no algorithm farming your taste. Just smarter mornings.
        </p>
        <div className="lp-steps-grid">
          <div className="lp-step lp-reveal lp-reveal-delay-1">
            <div className="lp-step-num">01</div>
            <div className="lp-step-icon">📸</div>
            <div className="lp-step-title">Upload your wardrobe</div>
            <p className="lp-step-desc">
              Photograph your clothes once. driply reads colors, fabric types, and garment categories automatically.
            </p>
          </div>
          <div className="lp-step lp-reveal lp-reveal-delay-2">
            <div className="lp-step-num">02</div>
            <div className="lp-step-icon">🌤</div>
            <div className="lp-step-title">Get daily outfit picks</div>
            <p className="lp-step-desc">
              Every morning, driply checks your local weather and surfaces three ready-to-wear combinations from your actual closet.
            </p>
          </div>
          <div className="lp-step lp-reveal lp-reveal-delay-3">
            <div className="lp-step-num">03</div>
            <div className="lp-step-icon">✦</div>
            <div className="lp-step-title">It learns your vibe</div>
            <p className="lp-step-desc">
              Rate outfits to train your taste profile. driply gets sharper with every tap — no two closets look the same.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-features-section" id="features">
        <div className="lp-features-inner">
          <div className="lp-features-header">
            <div>
              <div className="lp-section-tag lp-reveal">Features</div>
              <h2 className="lp-section-title lp-reveal lp-reveal-delay-1">
                Built different,<br />on purpose.
              </h2>
            </div>
            <p className="lp-section-sub lp-reveal lp-reveal-delay-2">
              Most fashion apps want you to buy more. driply is designed to help you shop less — and look better doing it.
            </p>
          </div>
          <div className="lp-features-grid">
            <div className="lp-feature-card lp-reveal">
              <div className="lp-feature-number">01</div>
              <div className="lp-feature-title">Color-match engine</div>
              <p className="lp-feature-desc">
                Analyzes complementary and analogous color relationships across your wardrobe so every fit coheres.
              </p>
            </div>
            <div className="lp-feature-card lp-reveal lp-reveal-delay-1">
              <div className="lp-feature-number">02</div>
              <div className="lp-feature-title">Live weather layer</div>
              <p className="lp-feature-desc">
                Fabric weight and breathability are factored into suggestions. No more dressing wrong for the day.
              </p>
            </div>
            <div className="lp-feature-card lp-reveal lp-reveal-delay-2">
              <div className="lp-feature-number">03</div>
              <div className="lp-feature-title">Private by design</div>
              <p className="lp-feature-desc">
                Your wardrobe data never leaves your device in identifiable form. No selling your style to brands.
              </p>
            </div>
            <div className="lp-feature-card lp-reveal lp-reveal-delay-3">
              <div className="lp-feature-number">04</div>
              <div className="lp-feature-title">Vibe tagging</div>
              <p className="lp-feature-desc">
                Tag moods — chill, formal, streetwear, vintage — and filter fits by the energy of your day.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta-section" id="waitlist">
        <div className="lp-cta-bg" />
        <div className="lp-cta-eyebrow lp-reveal">Get started today</div>
        <h2 className="lp-cta-title lp-reveal lp-reveal-delay-1">
          Your closet is<br />already enough.
        </h2>
        <p className="lp-cta-sub lp-reveal lp-reveal-delay-2">
          Create a free account and start building your digital wardrobe in minutes.
        </p>
        <div className="lp-cta-buttons lp-reveal lp-reveal-delay-3">
          <Link href="/sign-up" className="lp-btn-primary" style={{ fontSize: "16px", padding: "16px 36px" }}>
            Sign up <ArrowIcon />
          </Link>
          <Link href="/sign-in" className="lp-btn-secondary" style={{ fontSize: "16px" }}>
            Sign in <ArrowIcon />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <div className="lp-footer-wrap">
        <footer className="lp-footer">
          <div className="lp-footer-logo">drip<span>ly</span></div>
          <p className="lp-footer-copy">© 2026 driply. Made with less.</p>
          <ul className="lp-footer-links">
            <li><a href="#">Privacy</a></li>
            <li><a href="#">Terms</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
