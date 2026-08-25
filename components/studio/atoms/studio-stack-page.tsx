import type { HTMLAttributes, ReactNode } from "react";

export type StudioStackPageKind = "service" | "record" | "workflow";

export interface StudioStackPageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  kind: StudioStackPageKind;
}

export function StudioStackPage({
  children,
  className = "",
  kind,
  ...props
}: StudioStackPageProps) {
  const classes = ["studio-stack-page", `is-${kind}`, className].filter(Boolean).join(" ");

  return (
    <div className={classes} data-studio-stack-kind={kind} {...props}>
      {children}
    </div>
  );
}

export interface StudioStackSectionProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  action?: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
  title?: ReactNode;
}

export function StudioStackSection({
  action,
  children,
  className = "",
  meta,
  title,
  ...props
}: StudioStackSectionProps) {
  const classes = ["studio-stack-section", className].filter(Boolean).join(" ");
  const hasHeader = title !== undefined || meta !== undefined || action !== undefined;

  return (
    <section className={classes} {...props}>
      {hasHeader ? (
        <header className="studio-stack-section-header">
          <div className="studio-stack-section-heading">
            {title === undefined ? null : <h2>{title}</h2>}
            {meta === undefined ? null : <span className="studio-stack-section-meta">{meta}</span>}
          </div>
          {action === undefined ? null : <div className="studio-stack-section-action">{action}</div>}
        </header>
      ) : null}
      <div className="studio-stack-section-body">{children}</div>
    </section>
  );
}
