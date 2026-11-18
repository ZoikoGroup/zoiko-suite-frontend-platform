import Image from "next/image";
import type { ReactNode } from "react";

// Two columns, as on the reference login page the user supplied: the left half is the
// marketing hero (public/login-hero.png, the left 905×1024 of the mock), filling the
// column from the top; the right half is a plain light surface with the card centred
// in it. The card keeps the mock's proportions (597×954), so its width is capped by the
// window height as well as by the reference's 546 px, and the page never scrolls.
// Phones and tablets get the card alone on the light surface.
const HERO_SRC = "/login-hero.png";

/** 546 px like the reference, or less when the window is too short for the card plus 20 px margins (954/597 ≈ 1.6). */
const CARD_WIDTH = "lg:w-[min(546px,calc((100dvh_-_40px)*0.62))]";

/** What the picture says, for readers who cannot see it. */
const HERO_COPY =
  "Zoiko Suite. All your business in one intelligent suite. Accounting. Finance. Operations. " +
  "Compliance. Smarter tools for a stronger tomorrow. Streamline operations, accurate accounting, " +
  "built-in compliance, global readiness.";

type LoginSceneProps = {
  children: ReactNode;
};

export function LoginScene({ children }: LoginSceneProps) {
  return (
    <div className="flex min-h-dvh w-full">
      <div className="relative hidden w-1/2 lg:block">
        <Image
          src={HERO_SRC}
          alt=""
          fill
          sizes="50vw"
          loading="eager"
          fetchPriority="high"
          className="object-cover object-top"
        />
        <p className="sr-only">{HERO_COPY}</p>
      </div>

      <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-canvas px-4 py-5 lg:w-1/2">
        {/* The card measures itself against this box (container units in LoginForm). */}
        <div className={`@container w-full max-w-[464px] lg:max-w-none ${CARD_WIDTH}`}>{children}</div>
      </div>
    </div>
  );
}
