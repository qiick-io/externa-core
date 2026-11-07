import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Button variants. Sizes follow the shared antd control-size scale (#462,
 * #472, `--spacing-control*` in app.css): `sm` / `icon-sm` = 24px (compact
 * inline actions only, 12px text and 14px icons), `default` / `icon` = 32px
 * (14px text, 16px icons), `lg` / `icon-lg` = 40px — the same heights as
 * Input, NativeSelect, Select trigger and Toggle at the matching size.
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        "destructive-outline":
          "border border-destructive/30 bg-background text-destructive shadow-xs hover:bg-destructive/10 hover:text-destructive",
        "destructive-ghost":
          "text-destructive hover:bg-destructive/10 hover:text-destructive",
        outline:
          "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        ai: "bg-ai text-ai-foreground shadow-xs hover:bg-ai-hover",
      },
      size: {
        sm: "h-control-sm gap-1.5 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-control px-4 has-[>svg]:px-3",
        lg: "h-control-lg px-6 has-[>svg]:px-4",
        "icon-sm": "size-control-sm [&_svg:not([class*='size-'])]:size-3.5",
        // shadcn's xs sizes (used by attachment and other shadcn items) map to the
        // smallest step of the qiick scale, the same as sm / icon-sm.
        xs: "h-control-sm gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        "icon-xs": "size-control-sm [&_svg:not([class*='size-'])]:size-3",
        icon: "size-control",
        "icon-lg": "size-control-lg",
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
  variant,
  size,
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
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
