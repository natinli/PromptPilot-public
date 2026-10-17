import type { PaginationState } from "../hooks/usePrompts";

interface Props {
  pagination: PaginationState;
  onGoToPage: (page: number) => void;
}

export default function PromptPagination({ pagination, onGoToPage }: Props) {
  if (pagination.total_pages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-6">
      <button
        disabled={pagination.page <= 1}
        onClick={() => onGoToPage(pagination.page - 1)}
        className="rounded-xl border border-border/50 px-4 py-2 text-xs font-medium text-foreground/60 transition-all duration-200 hover:text-foreground/75 hover:bg-muted/50 hover:border-border disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-border/50"
      >
        上一页
      </button>
      <span className="text-xs text-foreground/40 tabular-nums px-2">
        {pagination.page}{" "}
        <span className="text-foreground/15">/</span>{" "}
        {pagination.total_pages}
      </span>
      <button
        disabled={pagination.page >= pagination.total_pages}
        onClick={() => onGoToPage(pagination.page + 1)}
        className="rounded-xl border border-border/50 px-4 py-2 text-xs font-medium text-foreground/60 transition-all duration-200 hover:text-foreground/75 hover:bg-muted/50 hover:border-border disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-border/50"
      >
        下一页
      </button>
    </div>
  );
}
