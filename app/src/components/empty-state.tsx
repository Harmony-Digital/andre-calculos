import Link from "next/link";
import { FolderOpen, ArrowRight } from "lucide-react";
export function EmptyState({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FolderOpen size={25} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && label && (
        <Link className="button" href={href}>
          {label}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
