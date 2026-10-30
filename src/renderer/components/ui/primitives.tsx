import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { X } from "lucide-react";

export function Button({
  className = "",
  variant = "secondary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "icon";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props} />
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet-content">
          <div className="sheet-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="icon" aria-label="Close panel">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="muted">
              {description}
            </Dialog.Description>
          )}
          {!description && (
            <Dialog.Description className="sr-only">
              {title} controls
            </Dialog.Description>
          )}
          <div className="sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function CharacterPopover({
  trigger,
  children,
  resetKey,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  resetKey?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const lastKey = React.useRef(resetKey);
  const navigationClosing = React.useRef(false);
  React.useEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      navigationClosing.current = true;
      setOpen(false);
    }
  }, [resetKey]);
  return (
    <Popover.Root open={open} onOpenChange={value => {
      if (value) navigationClosing.current = false;
      setOpen(value);
    }}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="character-popover"
          onCloseAutoFocus={event => {
            if (navigationClosing.current) {
              event.preventDefault();
              navigationClosing.current = false;
            }
          }}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                ".switcher-choice",
              ),
            );
            if (!buttons.length) return;
            event.preventDefault();
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "ArrowDown"
                ? (index + 1) % buttons.length
                : (index - 1 + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }}
        >
          {children}
          <Popover.Arrow className="popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.4} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
