import * as AvatarPrimitive from "@radix-ui/react-avatar"
import * as React from "react"

import { avatarStyleForId, avatarTextColor } from "@/lib/avatar-color"
import { cn } from "@/lib/utils"

function resolveAvatarTone(
  userId?: number | string,
  color?: string,
): { backgroundColor: string; color: string } | undefined {
  if (color) {
    return {
      backgroundColor: color,
      color: avatarTextColor(color),
    }
  }

  if (userId === undefined || userId === null || userId === "") {
    return undefined
  }

  return avatarStyleForId(userId)
}

function Avatar({
  className,
  userId,
  color,
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  userId?: number | string
  color?: string
}) {
  const tone = resolveAvatarTone(userId, color)

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      style={
        tone
          ? ({
              ...style,
              "--avatar-bg": tone.backgroundColor,
              "--avatar-fg": tone.color,
            } as React.CSSProperties)
          : style
      }
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      style={{
        backgroundColor: "var(--avatar-bg)",
        color: "var(--avatar-fg)",
        ...style,
      }}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
