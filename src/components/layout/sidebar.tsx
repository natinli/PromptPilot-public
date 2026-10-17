import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Sparkles,
  Library,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "首页",
    href: "/dashboard",
    icon: Home,
  },
  {
    label: "优化",
    href: "/optimize",
    icon: Sparkles,
  },
  {
    label: "提示词库",
    href: "/prompts",
    icon: Library,
  },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Zap className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">PromptPilot</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          PromptPilot v0.1.0
        </p>
      </div>
    </aside>
  );
}
