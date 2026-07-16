import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      fill="none"
      viewBox="0 0 32 32"
    >
      <path
        d="M8 10h7.5c4.7 0 8.5 3.8 8.5 8.5V22"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.75"
      />
      <path
        d="m19.5 18 4.5 4 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.75"
      />
      <circle cx="8" cy="10" r="4" fill="currentColor" />
      <circle cx="15" cy="22" r="4" fill="currentColor" />
      <path
        d="M8 14v2a6 6 0 0 0 6 6h1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.75"
      />
    </svg>
  );
}

export function Brand({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold tracking-[-0.025em]", className)}
    >
      <BrandMark className={cn("text-primary", markClassName)} />
      <span>DevRelay</span>
    </span>
  );
}
