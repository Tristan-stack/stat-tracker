import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// monopo : boutons = pill 75px, achromatique, sans ombre ni hover-elevation.
// Le pill EST l'affordance — pas d'effet de profondeur.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-pill font-normal whitespace-nowrap transition-colors outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Action primaire = ink black, texte paper
        default: "bg-ink-black text-paper-white hover:bg-carbon",
        // « destructive » reste neutre (système achromatique)
        destructive: "bg-carbon text-paper-white hover:bg-ink-black",
        // Pill contour hairline ash, fond transparent
        outline:
          "border border-ash bg-transparent text-carbon hover:bg-ink-black hover:text-paper-white hover:border-ink-black",
        // Surface utilitaire compacte (graphite) — la seule action non-noire
        secondary: "bg-graphite text-paper-white hover:bg-carbon",
        // Ghost : texte seul, pas de fond
        ghost: "text-carbon hover:bg-paper-white hover:text-ink-black",
        // Lien éditorial
        link: "rounded-none text-carbon underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-9 px-5 py-2 text-[12px] has-[>svg]:px-4",
        xs: "h-6 gap-1 px-3 text-[11px] has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-4 text-[12px] has-[>svg]:px-3",
        lg: "h-12 px-8 text-[14px] has-[>svg]:px-6",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
