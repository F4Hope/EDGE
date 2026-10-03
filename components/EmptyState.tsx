import type { ReactNode } from "react";

type EmptyStateProps = {
  status: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({
  status,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <section className="empty-state">
      <span className="empty-status">{status}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </section>
  );
}
