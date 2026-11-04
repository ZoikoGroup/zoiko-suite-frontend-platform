import Image from "next/image";
import { ChartColumn, FileChartColumn, ShieldCheck, Globe } from "lucide-react";

const FEATURES = [
  { icon: ChartColumn, label: ["Streamline", "Operations"] },
  { icon: FileChartColumn, label: ["Accurate", "Accounting"] },
  { icon: ShieldCheck, label: ["Built-In", "Compliance"] },
  { icon: Globe, label: ["Global", "Readiness"] },
];

export function LoginBrandPanel() {
  return (
    // The Figma frame's 749×900 shape, scaled to the window height (749/900 = 83.2dvh). It only
    // narrows when the window is too narrow, and the photo then crops its sides.
    <div className="@container relative hidden h-full min-w-0 overflow-hidden bg-linear-to-br from-amber-50 via-sky-50 to-slate-200 lg:block lg:w-[83.2dvh]">
      {/* Photo layer only; headline and features are live text. */}
      <Image
        src="/Login_bg_img.png"
        alt=""
        fill
        sizes="84vh"
        loading="eager"
        fetchPriority="high"
        className="object-cover object-center"
      />

      {/* Sized in cqw so the copy is the Figma frame scaled with the photo (1cqw = 7.49px at 1440×900). */}
      <div className="relative z-10 flex h-full flex-col pt-[6.1cqw] pl-[11.5cqw] pr-[5.3cqw]">
        {/* The asset carries a transparent inset — pull it back so the mark lines up with the copy. */}
        <Image
          src="/logo-transparent.png"
          alt="ZoikoSuite"
          width={336}
          height={144}
          loading="eager"
          className="-ml-[1.1cqw] h-[9.6cqw] w-auto self-start animate-fade-up"
        />

        <div className="mt-[2.7cqw] animate-fade-up" style={{ animationDelay: "80ms" }}>
          <h1 className="text-[length:6.9cqw] font-bold leading-[1.05] tracking-tight">
            <span className="block text-navy-900">All your business</span>
            <span className="block text-gold-500">in one intelligent suite.</span>
          </h1>
          <p className="mt-[1.6cqw] text-[length:max(13px,2.27cqw)] leading-[1.53] text-slate-700">
            Accounting. Finance. Operations. Compliance.
            <br />
            Smarter tools for a stronger tomorrow.
          </p>
        </div>

        {/* Fixed columns so the first label sits flush with the copy; long words overflow evenly. */}
        <ul className="mt-[4.3cqw] grid grid-cols-[repeat(4,11.2cqw)] gap-x-[5.3cqw]">
          {FEATURES.map((f, i) => (
            <li
              key={f.label.join(" ")}
              className="flex flex-col items-center text-center animate-fade-up"
              style={{ animationDelay: `${160 + i * 90}ms` }}
            >
              <span className="flex size-[8.5cqw] items-center justify-center rounded-[1.6cqw] bg-white/90 shadow-md shadow-slate-900/10 ring-1 ring-slate-900/5 backdrop-blur-sm">
                <f.icon className="size-[4.3cqw] text-navy-700" />
              </span>
              <span className="mt-[1.6cqw] whitespace-nowrap text-[length:max(12px,2.14cqw)] font-medium leading-[1.15] text-navy-900">
                {f.label[0]}
                <br />
                {f.label[1]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
