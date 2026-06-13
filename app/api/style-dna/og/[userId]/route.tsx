import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSignedProfilePhotoUrl } from "@/lib/profile-media";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  if (!UUID_RE.test(userId)) {
    return new Response("Not found", { status: 404 });
  }

  const dna = await prisma.styleDNA.findUnique({
    where: { userId },
    select: {
      archetypeName: true,
      description: true,
      traits: true,
      colorPalette: true,
      moodboardUrl: true,
      moodboardStatus: true,
      textStatus: true,
    },
  });

  if (!dna || dna.textStatus !== "READY") {
    return new Response("Style DNA not ready", { status: 404 });
  }

  const moodboardUrl =
    dna.moodboardStatus === "READY" ? await getSignedProfilePhotoUrl(dna.moodboardUrl) : null;

  const palette = dna.colorPalette.slice(0, 5);
  const primary = palette[0] ?? "#1a1a1a";
  const secondary = palette[1] ?? "#2c2c2c";

  return new ImageResponse(
    <div
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(135deg, ${primary}22 0%, #0a0a0a 50%, ${secondary}22 100%)`,
        fontFamily: "sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background decoration */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${primary}44 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${secondary}33 0%, transparent 70%)`,
        }}
      />

      {/* Moodboard image */}
      {moodboardUrl ? (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 540,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={moodboardUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 540,
              background: "linear-gradient(to bottom, transparent 60%, #0a0a0a 100%)",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 540,
            flexShrink: 0,
            background: `linear-gradient(135deg, ${palette.join(", ")})`,
          }}
        />
      )}

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "56px 64px 0",
          flex: 1,
        }}
      >
        {/* Label */}
        <div
          style={{
            display: "flex",
            color: "#666",
            fontSize: 20,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          STYLE DNA
        </div>

        {/* Archetype name */}
        <div
          style={{
            display: "flex",
            color: "#fff",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.05,
            marginBottom: 28,
          }}
        >
          {dna.archetypeName}
        </div>

        {/* Description */}
        <div
          style={{
            display: "flex",
            color: "#aaa",
            fontSize: 28,
            lineHeight: 1.5,
            marginBottom: 40,
            maxWidth: 820,
          }}
        >
          {dna.description}
        </div>

        {/* Traits */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 48 }}>
          {dna.traits.map((trait) => (
            <div
              key={trait}
              style={{
                display: "flex",
                color: "#fff",
                background: "#ffffff15",
                border: "1px solid #ffffff22",
                borderRadius: 100,
                padding: "10px 24px",
                fontSize: 22,
              }}
            >
              {trait}
            </div>
          ))}
        </div>

        {/* Color palette */}
        <div style={{ display: "flex", gap: 12 }}>
          {palette.map((color) => (
            <div
              key={color}
              style={{
                display: "flex",
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: color,
                border: "2px solid #ffffff22",
              }}
            />
          ))}
        </div>
      </div>

      {/* Watermark */}
      <div
        style={{
          display: "flex",
          padding: "32px 64px",
          justifyContent: "flex-end",
          color: "#444",
          fontSize: 22,
          letterSpacing: 1,
        }}
      >
        driply
      </div>
    </div>,
    {
      width: 1080,
      height: 1350,
    },
  );
}
