import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // monopo : champ à angles vifs, hairline ash, fond paper, zéro ombre
        "h-10 w-full min-w-0 rounded-none border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-normal file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // focus achromatique : la bordure passe en ink, fin liseré carbon
        "focus-visible:border-ink-black focus-visible:ring-1 focus-visible:ring-carbon",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
