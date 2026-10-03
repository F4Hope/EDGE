import type { ReactNode } from "react";

type ScreenHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ScreenHeader({
  eyebrow,
  title,
  description,
  action,
}: ScreenHeaderProps) {
  return (
    <section className="screen-intro">
      <div className="screen-heading-row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="screen-title">{title}</h1>
        </div>
        {action ? <div className="screen-action">{action}</div> : null}
      </div>
      {description ? <p className="screen-copy">{description}</p> : null}
    </section>
  );
}
