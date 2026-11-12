import * as React from "react"
import { cn } from "cn"

/** Elements a card may render as, so sections, articles, and disclosures keep their meaning */
type CardElement = "div" | "section" | "article" | "aside" | "header" | "footer" | "details" | "form" | "li" | "nav"

/**
 * App adaptation: top-level cards are flat (no ring or border) and cards nested in a card get a 1px border. Cards use
 * the app's 12px corners and 22px padding, and lay out their
 * children normally. Cards built from CardHeader / CardContent / CardFooter keep shadcn's spacing
 */
function Card({
  className,
  size = "default",
  as: Tag = "div",
  ...props
}: Omit<React.AllHTMLAttributes<HTMLElement>, "size" | "as"> & { size?: "default" | "sm"; as?: CardElement; ref?: React.Ref<HTMLElement> }) {
  const Element = Tag as React.ElementType
  return (
    <Element
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card min-w-0 rounded-xl bg-card text-card-foreground p-[22px] data-[size=sm]:p-4 [--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)]",
        // A card inside another card gets a hairline border so it stands apart; top-level cards stay flat
        "in-data-[slot=card]:border in-data-[slot=card]:border-(--line)",
        "has-data-[slot=card-header]:flex has-data-[slot=card-header]:flex-col has-data-[slot=card-header]:gap-(--card-spacing) has-data-[slot=card-header]:px-0 has-data-[slot=card-header]:py-(--card-spacing)",
        "has-data-[slot=card-content]:flex has-data-[slot=card-content]:flex-col has-data-[slot=card-content]:gap-(--card-spacing) has-data-[slot=card-content]:px-0 has-data-[slot=card-content]:py-(--card-spacing)",
        "has-data-[slot=card-footer]:pb-0",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
