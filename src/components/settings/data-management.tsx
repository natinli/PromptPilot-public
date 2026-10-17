import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, Loader2, Trash2, BarChart3, FolderOpen, Check } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/tauri-api";

export function DataManagement() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const [stats, setStats] = useState<api.StatsResult | null>(null);
  const [dbInfo, setDbInfo] = useState<{ sizeKB: number; path: string } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const [statsData, healthData] = await Promise.all([
          api.getStats(),
          api.dbHealthCheck(),
        ]);
        setStats(statsData);
        setDbInfo({
          sizeKB: Math.round(healthData.db_size_bytes / 1024),
          path: "",
        });
      } catch {
        // ignore
      } finally {
        setStatsLoading(false);
      }
    };
    loadStats();
  }, [refreshKey, historyCleared]);

  useEffect(() => {
    const getDbPath = async () => {
      try {
        const { appDataDir } = await import("@tauri-apps/api/path");
        const dir = await appDataDir();
        setDbInfo(prev => prev ? { ...prev, path: dir + "promptpilot.db" } : null);
      } catch {
        // ignore
      }
    };
    getDbPath();
  }, []);

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clear_optimization_logs");
      setHistoryCleared(true);
      toast.success("优化历史已清除");
      setTimeout(() => setHistoryCleared(false), 2000);
      setRefreshKey(k => k + 1);
      window.dispatchEvent(new CustomEvent("optimization-completed"));
    } catch {
      toast.error("清除失败：后端暂不支持此操作，请等待后续版本更新。");
    } finally {
      setClearingHistory(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const filePath = await save({
        defaultPath: `PromptPilot_export_${dateStr}.json`,
        filters: [{ name: "JSON 文件", extensions: ["json"] }],
        title: "导出提示词库",
      });

      if (!filePath) { setExporting(false); return; }

      const jsonStr = await api.exportPrompts();
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(filePath, jsonStr);

      const data = JSON.parse(jsonStr);
      toast.success(`导出成功！共 ${data.prompts?.length || 0} 条提示词、${data.categories?.length || 0} 个分类。`);
    } catch (err) {
      toast.error(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        const text = await file.text();
        const result = await api.importPrompts(text);
        toast.success(`导入成功！新增 ${result.imported_prompts} 条提示词、${result.imported_categories} 个分类${result.skipped_prompts > 0 ? `，跳过 ${result.skipped_prompts} 条已存在的提示词` : ""}。`);
        setRefreshKey(k => k + 1);
        window.dispatchEvent(new CustomEvent("prompts-updated", {
          detail: { source: "settings-import", mutatedData: ["prompts", "categories", "stats"] },
        }));
      } catch (err) {
        toast.error(`导入失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Database className="h-5 w-5 text-foreground/60" />
          数据管理
        </h4>
        <p className="text-sm text-foreground/50 mt-1">
          导入导出你的提示词库，方便备份、迁移或与他人分享。
        </p>
      </div>

      <div className="space-y-5">
        {/* 数据统计概览 */}
        <div className="rounded-xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-foreground/50" />
            <h5 className="text-sm font-semibold text-foreground/80">数据概览</h5>
          </div>
          {statsLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-foreground/30" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "提示词", value: stats.total_prompts, color: "text-blue-500" },
                { label: "分类", value: stats.total_categories, color: "text-emerald-500" },
                { label: "收藏", value: stats.total_favorites, color: "text-rose-500" },
                { label: "优化次数", value: stats.total_optimizations, color: "text-purple-500" },
                { label: "数据库", value: dbInfo ? (dbInfo.sizeKB > 1024 ? `${(dbInfo.sizeKB / 1024).toFixed(1)} MB` : `${dbInfo.sizeKB} KB`) : "--", color: "text-foreground/60" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted/30 px-3 py-2 text-center">
                  <div className={`text-base font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-[10px] text-foreground/40 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* 导出 */}
        <div className="rounded-xl border border-border/50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Download className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <h5 className="text-sm font-semibold text-foreground">导出提示词库</h5>
              <p className="text-xs text-foreground/50 mt-1 leading-relaxed">
                将所有提示词和分类导出为 JSON 文件。可用于备份数据或迁移到其他设备。
              </p>
            </div>
          </div>
          <Button onClick={handleExport} disabled={exporting} className="w-full" variant="outline">
            {exporting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />导出中...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />导出为 JSON 文件</>
            )}
          </Button>
        </div>

        {/* 导入 */}
        <div className="rounded-xl border border-border/50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Upload className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h5 className="text-sm font-semibold text-foreground">导入提示词库</h5>
              <p className="text-xs text-foreground/50 mt-1 leading-relaxed">
                从 JSON 文件导入提示词数据。采用合并模式：已存在的提示词会自动跳过，不会覆盖现有数据。
              </p>
            </div>
          </div>
          <Button onClick={handleImportClick} disabled={importing} className="w-full" variant="outline">
            {importing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />导入中...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />选择 JSON 文件导入</>
            )}
          </Button>
        </div>

        {/* 清除优化历史 */}
        <div className="rounded-xl border border-border/50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <Trash2 className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <h5 className="text-sm font-semibold text-foreground">清除优化历史</h5>
              <p className="text-xs text-foreground/50 mt-1 leading-relaxed">
                删除所有 AI 优化记录。此操作不可撤销，不会影响已保存的提示词。
              </p>
            </div>
          </div>
          <Button onClick={handleClearHistory} disabled={clearingHistory || historyCleared} className="w-full" variant="outline">
            {clearingHistory ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />清除中...</>
            ) : historyCleared ? (
              <><Check className="h-4 w-4 mr-2" />已清除</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-2" />清除所有优化记录</>
            )}
          </Button>
        </div>

        {dbInfo?.path && (
          <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5 text-foreground/45" />
              <span className="text-xs font-medium text-foreground/55">数据库位置</span>
            </div>
            <p className="text-[11px] text-foreground/40 font-mono break-all leading-relaxed select-all">
              {dbInfo.path}
            </p>
          </div>
        )}

        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-xs text-foreground/50 leading-relaxed">
            <strong className="text-foreground/65">提示：</strong>
            导出文件包含所有未归档的提示词及其分类信息。导入时会自动跳过已存在的数据，不会产生重复。
          </p>
        </div>
      </div>
    </div>
  );
}
