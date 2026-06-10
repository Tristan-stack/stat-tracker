import { cn } from '@/lib/utils';

/**
 * Nappes organiques flottantes (vert / ambre / oxblood — les teintes du
 * gradient mercury-flow). Unique exception chromatique du système, réservée
 * aux frames noirs immersifs. Les éléments [data-blob] dérivent via GSAP.
 */
export function Atmosphere({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div
        data-blob
        className="absolute left-[6%] top-[8%] h-[60vh] w-[42vw] rounded-full bg-[#a0e0ab] opacity-[0.2] blur-[110px]"
      />
      <div
        data-blob
        className="absolute right-[8%] top-[26%] h-[65vh] w-[46vw] rounded-full bg-[#ffac2e] opacity-[0.15] blur-[130px]"
      />
      <div
        data-blob
        className="absolute bottom-[2%] left-[28%] h-[55vh] w-[38vw] rounded-full bg-[#a52d25] opacity-[0.2] blur-[120px]"
      />
    </div>
  );
}
