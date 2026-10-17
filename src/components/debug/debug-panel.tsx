/**
 * Debug 面板 —— 完整的可视化调试工具（UI 组件）
 *
 * 数据存储层已拆分到 debug-store.ts，本文件只包含 UI 渲染逻辑。
 * 外部模块推送日志请 import debug-store.ts，而非本文件。
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { X, Trash2, Bug, ChevronDown, ChevronUp, Copy, Send, Terminal, Zap, Activity, AlertTriangle, Monitor, Radio, Cpu, Database, Cloud } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import {
  type IpcLogEntry, type RustLogEntry, type ErrorLogEntry, type EventLogEntry,
  type AiRequestLogEntry, type WordCloudLogEntry, type TabType,
  useIpcLogs, useRustLogs, useErrorLogs, useEventLogs, useAiLogs, useWordCloudLogs,
  usePerfLogs, useLowFpsWarning, getIpcLogs,
  pushRustLog, pushEventLog, pushErrorLog,
  clearIpcLogs, clearRustLogs, clearErrorLogs, clearEventLogs, clearAiLogs, clearWordCloudLogs, clearPerfLogs,
  setIsRecording, setLowFpsWarning,
  formatTime, formatData,
} from "./debug-store";

// ==================== Debug 面板组件 ====================

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showButton, setShowButton] = useState(() => {
    try {
      return localStorage.getItem("pp_debug_show_button") === "true";
    } catch { return false; }
  });
  const location = useLocation();
  const isMini = location.pathname.startsWith("/mini");
  const [activeTab, setActiveTab] = useState<TabType>("ipc");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const ipcLogsList = useIpcLogs();
  const rustLogsList = useRustLogs();
  const errorLogsList = useErrorLogs();
  const eventLogsList = useEventLogs();
  const aiLogsList = useAiLogs();
  const wordCloudLogsList = useWordCloudLogs();
  const _hasLowFps = useLowFpsWarning();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // IPC 测试相关状态
  const [echoInput, setEchoInput] = useState('{\n  "testKey": "testValue",\n  "camelCase": true,\n  "number": 42\n}');
  const [echoResult, setEchoResult] = useState<string | null>(null);
  const [echoError, setEchoError] = useState<string | null>(null);
  const [echoLoading, setEchoLoading] = useState(false);

  // 监听 Rust 端推送的日志事件
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ command: string; message: string; data?: unknown; timestamp: string }>(
      "rust-log",
      (event) => {
        pushRustLog({
          command: event.payload.command,
          message: event.payload.message,
          data: event.payload.data,
          timestamp: event.payload.timestamp,
        });
        // 同时记录到事件日志
        pushEventLog({
          type: "tauri-event",
          detail: `rust-log: ${event.payload.command} - ${event.payload.message.slice(0, 50)}`,
        });
      }
    ).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // 全局错误捕获：window.onerror + unhandledrejection
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      pushErrorLog({
        type: "js-error",
        message: event.message || "未知 JS 错误",
        stack: event.error?.stack,
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      pushErrorLog({
        type: "promise-rejection",
        message: reason?.message || String(reason) || "未处理的 Promise 拒绝",
        stack: reason?.stack,
      });
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  // 监听 CustomEvent 和 popstate
  useEffect(() => {
    const handlePromptsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const source = detail?.source || "未知";
      const mutated: string[] = detail?.mutatedData || [];
      pushEventLog({
        type: "custom-event",
        detail: `prompts-updated [${source}]${mutated.length ? " 变更: " + mutated.join(", ") : ""}`,
        mutatedData: mutated,
        source,
      });
    };
    const handleOptimizationCompleted = () => {
      pushEventLog({ type: "custom-event", detail: "optimization-completed" });
    };
    const handlePopState = () => {
      pushEventLog({ type: "route", detail: `popstate → ${window.location.pathname}` });
    };
    window.addEventListener("prompts-updated", handlePromptsUpdated);
    window.addEventListener("optimization-completed", handleOptimizationCompleted);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("prompts-updated", handlePromptsUpdated);
      window.removeEventListener("optimization-completed", handleOptimizationCompleted);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // F8 快捷键切换面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 监听土豆图标双击事件切换虫子按钮显隐
  useEffect(() => {
    const handleToggle = () => {
      setShowButton((prev) => {
        const next = !prev;
        // 如果正在隐藏按钮，同时关闭面板
        if (prev) setIsOpen(false);
        try { localStorage.setItem("pp_debug_show_button", String(next)); } catch {}
        return next;
      });
    };
    window.addEventListener("toggle-debug-panel", handleToggle);
    return () => window.removeEventListener("toggle-debug-panel", handleToggle);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ipcLogsList, rustLogsList, autoScroll, activeTab]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const copyData = useCallback((data: unknown) => {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // 发送 debug_echo 测试
  const sendEchoTest = useCallback(async () => {
    setEchoLoading(true);
    setEchoResult(null);
    setEchoError(null);
    try {
      const parsed = JSON.parse(echoInput);
      const result = await invoke("debug_echo", { data: parsed });
      setEchoResult(JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof SyntaxError) {
        setEchoError(`JSON 格式错误: ${err.message}`);
      } else {
        setEchoError(String(err));
      }
    } finally {
      setEchoLoading(false);
    }
  }, [echoInput]);

  // 总日志数（用于浮动按钮的 badge）
  const totalLogs = ipcLogsList.length + rustLogsList.length;

  // 清空所有日志（包括新增的日志类型）
  const clearAllLogs = useCallback(() => {
    clearIpcLogs();
    clearRustLogs();
    clearErrorLogs();
    clearEventLogs();
    clearAiLogs();
    clearWordCloudLogs();
  }, []);

  if (!isOpen) {
    if (!showButton) return null;
    return (
      <div className={`fixed z-[9999] ${isMini ? "bottom-2 right-2" : "bottom-4 right-4"}`}>
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center justify-center p-1 text-gray-400 hover:text-gray-200 transition-colors"
          title="打开 Debug 面板 (F8)"
        >
          <Bug className="h-4.5 w-4.5" />
          {totalLogs > 0 && (
            <span className="absolute top-0.5 right-0.5 w-[6px] h-[6px] rounded-full bg-blue-500 aspect-square" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`debug-panel fixed z-[9999] flex flex-col rounded-xl bg-gray-900/95 text-white shadow-2xl backdrop-blur-sm border border-white/10 ${
        isMini
          ? (isMinimized ? "left-2 right-2 bottom-8" : "inset-2 !bottom-8")
          : "right-4 bottom-4"
      }`}
      style={isMini ? { maxHeight: isMinimized ? 44 : undefined } : { width: 555, maxHeight: isMinimized ? 44 : "75vh" }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium">Debug</span>
        </div>
        {/* 最小化时显示实时状态摘要 */}
        {isMinimized && (
          <div className="flex items-center gap-1.5 mx-2 flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {[
              { key: "ipc" as const, label: "IPC", count: ipcLogsList.length, color: "text-blue-400 hover:bg-blue-500/20" },
              { key: "rust" as const, label: "Rust", count: rustLogsList.length, color: "text-orange-400 hover:bg-orange-500/20" },
              { key: "errors" as const, label: "错误", count: errorLogsList.length, color: "text-red-400 hover:bg-red-500/20" },
              { key: "events" as const, label: "事件", count: eventLogsList.length, color: "text-cyan-400 hover:bg-cyan-500/20" },
              { key: "ai-perf" as const, label: "AI", count: aiLogsList.length, color: "text-pink-400 hover:bg-pink-500/20" },
            ]
              .filter((item) => item.count > 0)
              .map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setActiveTab(item.key);
                    setIsMinimized(false);
                  }}
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${item.color}`}
                  title={`查看${item.label}（${item.count}条）`}
                >
                  {item.label}:{item.count}
                </button>
              ))}
            {ipcLogsList.length + rustLogsList.length + errorLogsList.length + eventLogsList.length + aiLogsList.length === 0 && (
              <span className="text-[10px] text-gray-500">暂无日志</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={clearAllLogs}
            className="rounded p-1 hover:bg-white/10 transition-colors"
            title="清空所有日志"
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded p-1 hover:bg-white/10 transition-colors"
            title={isMinimized ? "展开" : "最小化"}
          >
            {isMinimized ? (
              <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 hover:bg-white/10 transition-colors"
            title="关闭面板 (F8)"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className={`flex flex-1 min-h-0 ${isMini ? "flex-col" : "flex-row"}`}>
          {/* Tab 栏：mini 模式横排，完整模式竖排 */}
          <div className={isMini
            ? "flex shrink-0 border-b border-white/10 overflow-x-auto scrollbar-none px-1 py-0.5"
            : "flex flex-col shrink-0 border-r border-white/10 overflow-y-auto py-1"
          } style={isMini ? undefined : { width: 62 }}>
            <TabButton
              active={activeTab === "ipc"}
              onClick={() => setActiveTab("ipc")}
              icon={<Activity className="h-3.5 w-3.5" />}
              label="IPC"
              count={ipcLogsList.length}
              color="blue"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "rust"}
              onClick={() => setActiveTab("rust")}
              icon={<Terminal className="h-3.5 w-3.5" />}
              label="Rust"
              count={rustLogsList.length}
              color="orange"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "test"}
              onClick={() => setActiveTab("test")}
              icon={<Zap className="h-3.5 w-3.5" />}
              label="测试"
              color="purple"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "errors"}
              onClick={() => setActiveTab("errors")}
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="错误"
              count={errorLogsList.length}
              color="red"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "state"}
              onClick={() => setActiveTab("state")}
              icon={<Monitor className="h-3.5 w-3.5" />}
              label="状态"
              color="green"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "events"}
              onClick={() => setActiveTab("events")}
              icon={<Radio className="h-3.5 w-3.5" />}
              label="事件"
              count={eventLogsList.length}
              color="cyan"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "ai-perf"}
              onClick={() => setActiveTab("ai-perf")}
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="AI/性能"
              color="pink"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "db-health"}
              onClick={() => setActiveTab("db-health")}
              icon={<Database className="h-3.5 w-3.5" />}
              label="DB健康"
              color="green"
              horizontal={isMini}
            />
            <TabButton
              active={activeTab === "wordcloud"}
              onClick={() => setActiveTab("wordcloud")}
              icon={<Cloud className="h-3.5 w-3.5" />}
              label="词云"
              count={wordCloudLogsList.length}
              color="cyan"
              horizontal={isMini}
            />
          </div>

          {/* 右侧 Tab 内容 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {activeTab === "ipc" && (
            <IpcLogTab
              logs={ipcLogsList}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              copyData={copyData}
              scrollRef={scrollRef}
              handleScroll={handleScroll}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
            />
          )}

          {activeTab === "rust" && (
            <RustLogTab
              logs={rustLogsList}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              copyData={copyData}
              scrollRef={scrollRef}
              handleScroll={handleScroll}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
            />
          )}

          {activeTab === "test" && (
            <EchoTestTab
              input={echoInput}
              setInput={setEchoInput}
              result={echoResult}
              error={echoError}
              loading={echoLoading}
              onSend={sendEchoTest}
              copyData={copyData}
            />
          )}

          {activeTab === "errors" && (
            <ErrorLogTab
              logs={errorLogsList}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              copyData={copyData}
              scrollRef={scrollRef}
              handleScroll={handleScroll}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
            />
          )}

          {activeTab === "state" && (
            <WindowStateTab />
          )}

          {activeTab === "events" && (
            <EventLogTab
              logs={eventLogsList}
              scrollRef={scrollRef}
              handleScroll={handleScroll}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
            />
          )}

          {activeTab === "ai-perf" && (
            <AiPerfTab
              aiLogs={aiLogsList}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              scrollRef={scrollRef}
              handleScroll={handleScroll}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
            />
          )}

          {activeTab === "db-health" && (
            <DbHealthTab />
          )}

          {activeTab === "wordcloud" && (
            <WordCloudTab logs={wordCloudLogsList} />
          )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Tab 按钮组件 ====================

function TabButton({ active, onClick, icon, label, count, color, horizontal }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  color: string;
  horizontal?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 border-blue-400",
    orange: "text-orange-400 border-orange-400",
    purple: "text-purple-400 border-purple-400",
    red: "text-red-400 border-red-400",
    green: "text-green-400 border-green-400",
    cyan: "text-cyan-400 border-cyan-400",
    pink: "text-pink-400 border-pink-400",
  };

  // 横排模式（mini 窗口）— 只显示图标，hover 显示标签名
  if (horizontal) {
    return (
      <button
        onClick={onClick}
        title={label + (count ? ` (${count})` : "")}
        className={`relative flex items-center justify-center p-1.5 transition-colors border-b-2 shrink-0 ${
          active
            ? `${colorMap[color]} bg-white/5`
            : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"
        }`}
      >
        {icon}
        {count !== undefined && count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 text-[8px] leading-none ${
            active ? "bg-white/20" : "bg-white/10"
          }`}>
            {count}
          </span>
        )}
      </button>
    );
  }

  // 竖排模式（完整版窗口）
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 px-1 py-2 text-[9px] transition-colors border-l-2 whitespace-nowrap ${
        active
          ? `${colorMap[color]} bg-white/5`
          : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="leading-tight">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`absolute top-1 right-0.5 rounded-full px-1 py-0 text-[8px] leading-tight ${
          active ? "bg-white/15" : "bg-white/10"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ==================== IPC 日志 Tab ====================

function IpcLogTab({ logs, expandedIds, toggleExpand, copyData, scrollRef, handleScroll, autoScroll, setAutoScroll }: {
  logs: IpcLogEntry[];
  expandedIds: Set<string>;
  toggleExpand: (key: string) => void;
  copyData: (data: unknown) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      style={{ maxHeight: "calc(75vh - 44px)" }}
    >
      {logs.length === 0 ? (
        <EmptyState icon={<Activity className="h-8 w-8" />} title="暂无 IPC 日志" subtitle="操作应用后，前端→Rust 的调用日志会自动出现" />
      ) : (
        <div className="divide-y divide-white/5">
          {logs.map((log) => {
            const key = `ipc-${log.id}`;
            const isExpanded = expandedIds.has(key);
            const isError = log.direction === "error";
            const isRequest = log.direction === "request";

            return (
              <div
                key={key}
                className={`px-3 py-1.5 hover:bg-white/5 cursor-pointer transition-colors ${
                  isError ? "bg-red-500/10" : ""
                }`}
                onClick={() => toggleExpand(key)}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-mono shrink-0 w-20">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`shrink-0 font-mono font-bold ${
                    isError ? "text-red-400" : isRequest ? "text-blue-400" : "text-green-400"
                  }`}>
                    {isError ? "✗" : isRequest ? "→" : "←"}
                  </span>
                  <span className="font-mono font-medium text-yellow-300 shrink-0">
                    {log.command}
                  </span>
                  {log.duration !== undefined && (
                    <span className={`shrink-0 font-mono ${
                      log.duration > 1000 ? "text-red-400" : log.duration > 200 ? "text-yellow-400" : "text-gray-500"
                    }`}>
                      {log.duration}ms
                    </span>
                  )}
                  <span className="ml-auto text-gray-600">{isExpanded ? "▼" : "▶"}</span>
                </div>
                {isExpanded && (
                  <ExpandedData data={log.data} copyData={copyData} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <ScrollToBottom autoScroll={autoScroll} setAutoScroll={setAutoScroll} scrollRef={scrollRef} show={!autoScroll && logs.length > 0} />
    </div>
  );
}

// ==================== Rust 日志 Tab ====================

function RustLogTab({ logs, expandedIds, toggleExpand, copyData, scrollRef, handleScroll, autoScroll, setAutoScroll }: {
  logs: RustLogEntry[];
  expandedIds: Set<string>;
  toggleExpand: (key: string) => void;
  copyData: (data: unknown) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      style={{ maxHeight: "calc(75vh - 44px)" }}
    >
      {logs.length === 0 ? (
        <EmptyState
          icon={<Terminal className="h-8 w-8" />}
          title="暂无 Rust 日志"
          subtitle="Rust 端处理命令时的日志会实时推送到这里"
        />
      ) : (
        <div className="divide-y divide-white/5">
          {logs.map((log) => {
            const key = `rust-${log.id}`;
            const isExpanded = expandedIds.has(key);

            return (
              <div
                key={key}
                className="px-3 py-1.5 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => toggleExpand(key)}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-mono shrink-0 w-20">
                    {log.timestamp}
                  </span>
                  <span className="shrink-0 font-mono font-bold text-orange-400">🦀</span>
                  <span className="font-mono font-medium text-yellow-300 shrink-0">
                    {log.command}
                  </span>
                  <span className="text-gray-400 truncate flex-1 text-[11px]">
                    {log.message.length > 60 ? log.message.slice(0, 60) + "..." : log.message}
                  </span>
                  <span className="ml-auto text-gray-600">{isExpanded ? "▼" : "▶"}</span>
                </div>
                {isExpanded && (
                  <div className="mt-1.5 relative group">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyData(log.message); }}
                      className="absolute top-1 right-1 rounded p-1 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="复制"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <pre className="text-[11px] leading-relaxed font-mono text-gray-300 bg-black/30 rounded-md p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                      {log.message}
                      {log.data !== undefined && log.data !== null && (
                        <>
                          {"\n\n--- 附带数据 ---\n"}
                          {formatData(log.data)}
                        </>
                      )}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ScrollToBottom autoScroll={autoScroll} setAutoScroll={setAutoScroll} scrollRef={scrollRef} show={!autoScroll && logs.length > 0} />
    </div>
  );
}

// ==================== IPC 测试 Tab ====================

function EchoTestTab({ input, setInput, result, error, loading, onSend, copyData }: {
  input: string;
  setInput: (v: string) => void;
  result: string | null;
  error: string | null;
  loading: boolean;
  onSend: () => void;
  copyData: (data: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: "calc(75vh - 44px)" }}>
      {/* 说明 */}
      <div className="text-[11px] text-gray-400 bg-white/5 rounded-lg p-2.5 leading-relaxed">
        <p className="font-medium text-gray-300 mb-1">🧪 IPC 回声测试（debug_echo）</p>
        <p>输入任意 JSON 数据，发送到 Rust 端，Rust 会原样返回。</p>
        <p className="mt-1">用途：验证 IPC 序列化/反序列化是否正常，检查 camelCase 命名映射。</p>
        <p className="mt-1 text-orange-400/80">💡 发送后同时查看「Rust 日志」Tab，可以看到 Rust 端实际收到的数据。</p>
      </div>

      {/* 输入区 */}
      <div>
        <label className="text-[11px] text-gray-400 mb-1 block">发送的 JSON 数据：</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full h-28 bg-black/30 border border-white/10 rounded-lg p-2.5 text-[12px] font-mono text-gray-200 resize-none focus:outline-none focus:border-purple-500/50 placeholder:text-gray-600"
          placeholder='{"key": "value"}'
          spellCheck={false}
        />
      </div>

      {/* 发送按钮 */}
      <button
        onClick={onSend}
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 text-xs font-medium transition-colors"
      >
        <Send className="h-3.5 w-3.5" />
        {loading ? "发送中..." : "发送 debug_echo"}
      </button>

      {/* 结果区 */}
      {result && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-green-400">✅ Rust 返回的数据：</label>
            <button
              onClick={() => copyData(result)}
              className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <Copy className="h-2.5 w-2.5" /> 复制
            </button>
          </div>
          <pre className="text-[11px] font-mono text-gray-300 bg-black/30 rounded-lg p-2.5 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
            {result}
          </pre>
        </div>
      )}

      {/* 错误区 */}
      {error && (
        <div>
          <label className="text-[11px] text-red-400 mb-1 block">❌ 错误：</label>
          <pre className="text-[11px] font-mono text-red-300 bg-red-500/10 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
            {error}
          </pre>
        </div>
      )}

      {/* 快捷测试按钮 */}
      <div className="border-t border-white/10 pt-3">
        <label className="text-[11px] text-gray-400 mb-2 block">快捷测试模板：</label>
        <div className="flex flex-wrap gap-1.5">
          <QuickTestButton
            label="camelCase 测试"
            onClick={() => setInput('{\n  "categoryId": "test-123",\n  "isFavorite": "true",\n  "pageSize": 20\n}')}
          />
          <QuickTestButton
            label="snake_case 测试"
            onClick={() => setInput('{\n  "category_id": "test-123",\n  "is_favorite": true,\n  "page_size": 20\n}')}
          />
          <QuickTestButton
            label="嵌套对象"
            onClick={() => setInput('{\n  "user": {\n    "name": "test",\n    "settings": {\n      "theme": "dark"\n    }\n  },\n  "tags": ["a", "b", "c"]\n}')}
          />
          <QuickTestButton
            label="空值测试"
            onClick={() => setInput('{\n  "nullField": null,\n  "emptyString": "",\n  "zero": 0,\n  "falseVal": false\n}')}
          />
        </div>
      </div>
    </div>
  );
}

// ==================== 窗口/状态 Tab ====================

function WindowStateTab() {
  const [windowInfo, setWindowInfo] = useState<Record<string, string>>({});
  const [frontendInfo, setFrontendInfo] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchInfo = useCallback(async () => {
    // 窗口信息
    const win: Record<string, string> = {
      "DPI 缩放": String(window.devicePixelRatio),
      "内部尺寸": `${window.innerWidth} × ${window.innerHeight}`,
      "外部尺寸": `${window.outerWidth} × ${window.outerHeight}`,
      "屏幕分辨率": `${screen.width} × ${screen.height}`,
      "可用屏幕": `${screen.availWidth} × ${screen.availHeight}`,
      "色深": `${screen.colorDepth} bit`,
    };

    // 尝试获取窗口模式
    try {
      const { getWindowMode } = await import("@/lib/tauri-api");
      const mode = await getWindowMode();
      win["窗口模式"] = mode;
    } catch {
      win["窗口模式"] = "获取失败";
    }

    setWindowInfo(win);

    // 前端状态
    const fe: Record<string, string> = {
      "当前路由": window.location.pathname + window.location.hash,
      "User Agent": navigator.userAgent.slice(0, 80) + "...",
      "语言": navigator.language,
      "在线状态": navigator.onLine ? "在线" : "离线",
    };

    // 尝试获取 API Key 状态
    try {
      const { getApiKeyStatus } = await import("@/lib/tauri-api");
      const hasKey = await getApiKeyStatus();
      fe["API Key"] = hasKey ? "✅ 已配置" : "❌ 未配置";
    } catch {
      fe["API Key"] = "获取失败";
    }

    // 最近 IPC 调用
    const currentIpcLogs = getIpcLogs();
    if (currentIpcLogs.length > 0) {
      const last = currentIpcLogs[currentIpcLogs.length - 1];
      fe["最近 IPC"] = `${last.command} (${last.direction})`;
    } else {
      fe["最近 IPC"] = "无";
    }

    setFrontendInfo(fe);
  }, []);

  // 初始加载和 resize 监听
  useEffect(() => {
    fetchInfo();
    const handleResize = () => fetchInfo();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fetchInfo, refreshKey]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0 p-3" style={{ maxHeight: "calc(75vh - 44px)" }}>
      {/* 刷新按钮 */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-[10px] text-gray-400 hover:text-gray-200 bg-white/10 rounded px-2 py-0.5 transition-colors"
        >
          🔄 刷新
        </button>
      </div>

      {/* 窗口信息 */}
      <div className="mb-3">
        <h3 className="text-[11px] font-medium text-green-400 mb-1.5">🖥️ 窗口信息</h3>
        <div className="bg-black/30 rounded-lg overflow-hidden">
          {Object.entries(windowInfo).map(([key, value]) => (
            <div key={key} className="flex items-center px-2.5 py-1 text-[11px] border-b border-white/5 last:border-0">
              <span className="text-gray-500 w-24 shrink-0">{key}</span>
              <span className="text-gray-200 font-mono">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 前端状态 */}
      <div>
        <h3 className="text-[11px] font-medium text-blue-400 mb-1.5">⚡ 前端状态</h3>
        <div className="bg-black/30 rounded-lg overflow-hidden">
          {Object.entries(frontendInfo).map(([key, value]) => (
            <div key={key} className="flex items-center px-2.5 py-1 text-[11px] border-b border-white/5 last:border-0">
              <span className="text-gray-500 w-24 shrink-0">{key}</span>
              <span className="text-gray-200 font-mono truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 错误日志 Tab ====================

function ErrorLogTab({ logs, expandedIds, toggleExpand, copyData, scrollRef, handleScroll, autoScroll, setAutoScroll }: {
  logs: ErrorLogEntry[];
  expandedIds: Set<string>;
  toggleExpand: (key: string) => void;
  copyData: (data: unknown) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  const typeBadge: Record<ErrorLogEntry["type"], { label: string; color: string }> = {
    "js-error": { label: "JS", color: "bg-red-500/20 text-red-400" },
    "promise-rejection": { label: "Promise", color: "bg-orange-500/20 text-orange-400" },
    "react-error": { label: "React", color: "bg-purple-500/20 text-purple-400" },
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      style={{ maxHeight: "calc(75vh - 44px)" }}
    >
      {logs.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="暂无错误"
          subtitle="全局 JS 错误、Promise 拒绝和 React 错误将自动捕获到这里"
        />
      ) : (
        <div className="divide-y divide-white/5">
          {logs.map((log) => {
            const key = `error-${log.id}`;
            const isExpanded = expandedIds.has(key);
            const badge = typeBadge[log.type];

            return (
              <div
                key={key}
                className="px-3 py-1.5 hover:bg-white/5 cursor-pointer transition-colors bg-red-500/5"
                onClick={() => toggleExpand(key)}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-mono shrink-0 w-20">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="text-red-300 truncate flex-1 text-[11px]">
                    {log.message.length > 80 ? log.message.slice(0, 80) + "..." : log.message}
                  </span>
                  <span className="ml-auto text-gray-600">{isExpanded ? "▼" : "▶"}</span>
                </div>
                {isExpanded && log.stack && (
                  <div className="mt-1.5 relative group">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyData(log.stack); }}
                      className="absolute top-1 right-1 rounded p-1 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="复制堆栈"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <pre className="text-[11px] leading-relaxed font-mono text-red-300/80 bg-black/30 rounded-md p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                      {log.stack}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ScrollToBottom autoScroll={autoScroll} setAutoScroll={setAutoScroll} scrollRef={scrollRef} show={!autoScroll && logs.length > 0} />
    </div>
  );
}

// ==================== 事件日志 Tab ====================

function EventLogTab({ logs, scrollRef, handleScroll, autoScroll, setAutoScroll }: {
  logs: EventLogEntry[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  const typeBadge: Record<EventLogEntry["type"], { label: string; color: string }> = {
    "route": { label: "路由", color: "bg-cyan-500/20 text-cyan-400" },
    "custom-event": { label: "自定义", color: "bg-green-500/20 text-green-400" },
    "tauri-event": { label: "Tauri", color: "bg-orange-500/20 text-orange-400" },
    "sync-warning": { label: "⚠ 同步", color: "bg-yellow-500/20 text-yellow-400" },
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      style={{ maxHeight: "calc(75vh - 44px)" }}
    >
      {logs.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-8 w-8" />}
          title="暂无事件"
          subtitle="路由变化、CustomEvent、Tauri 事件将自动记录到这里"
        />
      ) : (
        <div className="divide-y divide-white/5">
          {logs.map((log) => {
            const badge = typeBadge[log.type];
            const isWarning = log.type === "sync-warning";
            return (
              <div key={`event-${log.id}`} className={`px-3 py-1.5 hover:bg-white/5 transition-colors ${isWarning ? "bg-yellow-500/5" : ""}`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-mono shrink-0 w-20">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className={`truncate flex-1 text-[11px] font-mono ${isWarning ? "text-yellow-400" : "text-gray-300"}`}>
                    {log.detail}
                  </span>
                </div>
                {/* 显示 mutatedData 标签 */}
                {log.mutatedData && log.mutatedData.length > 0 && (
                  <div className="flex items-center gap-1 mt-0.5 ml-[88px]">
                    <span className="text-[10px] text-gray-500">变更:</span>
                    {log.mutatedData.map((d) => (
                      <span key={d} className="text-[10px] rounded px-1 py-0.5 bg-blue-500/15 text-blue-400">
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ScrollToBottom autoScroll={autoScroll} setAutoScroll={setAutoScroll} scrollRef={scrollRef} show={!autoScroll && logs.length > 0} />
    </div>
  );
}

// ==================== AI/性能 Tab ====================

function AiPerfTab({ aiLogs, expandedIds, toggleExpand, scrollRef, handleScroll, autoScroll, setAutoScroll }: {
  aiLogs: AiRequestLogEntry[];
  expandedIds: Set<string>;
  toggleExpand: (key: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  const statusBadge: Record<AiRequestLogEntry["status"], { label: string; color: string }> = {
    pending: { label: "请求中", color: "bg-yellow-500/20 text-yellow-400" },
    success: { label: "成功", color: "bg-green-500/20 text-green-400" },
    error: { label: "失败", color: "bg-red-500/20 text-red-400" },
  };

  // 实时更新 pending 状态的等待时间
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasPending = aiLogs.some((l) => l.status === "pending");
    if (!hasPending) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [aiLogs]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      style={{ maxHeight: "calc(75vh - 44px)" }}
    >
      {/* AI 请求列表 */}
      <div className="px-3 pt-2 pb-1">
        <h3 className="text-[11px] font-medium text-pink-400 mb-1">🤖 AI 请求日志</h3>
      </div>
      {aiLogs.length === 0 ? (
        <EmptyState
          icon={<Cpu className="h-8 w-8" />}
          title="暂无 AI 请求"
          subtitle="使用 AI 优化功能后，请求详情将在此显示"
        />
      ) : (
        <div className="divide-y divide-white/5">
          {aiLogs.map((log) => {
            const key = `ai-${log.id}`;
            const isExpanded = expandedIds.has(key);
            const badge = statusBadge[log.status];
            const elapsed = log.status === "pending"
              ? Math.round((Date.now() - log.startTime.getTime()) / 1000)
              : undefined;

            return (
              <div
                key={key}
                className="px-3 py-1.5 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => toggleExpand(key)}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-mono shrink-0 w-20">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="text-gray-300 truncate flex-1 text-[11px]">
                    {log.requestType} · {log.model}
                  </span>
                  {log.duration !== undefined && (
                    <span className={`shrink-0 font-mono text-[10px] ${
                      log.duration > 10000 ? "text-red-400" : log.duration > 3000 ? "text-yellow-400" : "text-gray-500"
                    }`}>
                      {(log.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                  {elapsed !== undefined && (
                    <span className="shrink-0 font-mono text-[10px] text-yellow-400 animate-pulse">
                      {elapsed}s...
                    </span>
                  )}
                  <span className="ml-auto text-gray-600">{isExpanded ? "▼" : "▶"}</span>
                </div>
                {isExpanded && (
                  <div className="mt-1.5 space-y-1">
                    <div className="text-[11px] text-gray-400">
                      <span className="text-gray-500">输入摘要: </span>
                      {log.promptSummary}
                    </div>
                    {log.responseSummary && (
                      <div className="text-[11px] text-gray-400">
                        <span className="text-gray-500">输出摘要: </span>
                        {log.responseSummary}
                      </div>
                    )}
                    {log.error && (
                      <pre className="text-[11px] font-mono text-red-300/80 bg-red-500/10 rounded-md p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                        {log.error}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 性能监控区域 */}
      <div className="border-t border-white/10 mt-2">
        <PerfMonitorSection />
      </div>

      <ScrollToBottom autoScroll={autoScroll} setAutoScroll={setAutoScroll} scrollRef={scrollRef} show={!autoScroll && aiLogs.length > 0} />
    </div>
  );
}

// ==================== 性能监控子组件 ====================

function PerfMonitorSection() {
  const [fps, setFps] = useState(0);
  const [memoryUsed, setMemoryUsed] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const perfLogsList = usePerfLogs();
  const fpsRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafIdRef = useRef(0);
  const lowFpsCountRef = useRef(0);

  // FPS 计数器
  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        fpsRef.current = currentFps;
        setFps(currentFps);
        frameCountRef.current = 0;
        lastTimeRef.current = now;

        // 低 FPS 警告：连续 3 秒低于 30 FPS
        if (currentFps < 30) {
          lowFpsCountRef.current++;
          if (lowFpsCountRef.current >= 3) {
            setLowFpsWarning(true);
          }
        } else {
          lowFpsCountRef.current = 0;
          setLowFpsWarning(false);
        }

        // 内存使用量
        const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
        if (perf.memory) {
          const used = (perf.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
          const limit = (perf.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0);
          setMemoryUsed(`${used} / ${limit} MB`);
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafIdRef.current);
      setLowFpsWarning(false);
    };
  }, []);

  // 录制控制
  const toggleRecording = useCallback(() => {
    if (recording) {
      setIsRecording(false);
      setRecording(false);
    } else {
      clearPerfLogs();
      setIsRecording(true);
      setRecording(true);
    }
  }, [recording]);

  // 录制摘要
  const summary = useMemo(() => {
    if (perfLogsList.length === 0) return null;
    const totalRenders = perfLogsList.length;
    const avgDuration = perfLogsList.reduce((sum, l) => sum + l.actualDuration, 0) / totalRenders;
    const slowRenders = perfLogsList.filter((l) => l.actualDuration > 16);

    // 按组件名分组，找最慢的 5 个
    const byComponent = new Map<string, { count: number; totalDuration: number; maxDuration: number }>();
    for (const log of perfLogsList) {
      const existing = byComponent.get(log.componentName) || { count: 0, totalDuration: 0, maxDuration: 0 };
      existing.count++;
      existing.totalDuration += log.actualDuration;
      existing.maxDuration = Math.max(existing.maxDuration, log.actualDuration);
      byComponent.set(log.componentName, existing);
    }
    const slowest = [...byComponent.entries()]
      .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
      .slice(0, 5);

    return { totalRenders, avgDuration, slowRenders: slowRenders.length, slowest };
  }, [perfLogsList]);

  const fpsColor = fps >= 50 ? "text-green-400" : fps >= 30 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="px-3 pt-2 pb-3">
      <h3 className="text-[11px] font-medium text-purple-400 mb-2">📊 性能监控</h3>

      {/* 实时指标 */}
      <div className="flex gap-3 mb-2">
        <div className="bg-black/30 rounded-lg px-3 py-1.5 flex-1">
          <div className="text-[10px] text-gray-500">FPS</div>
          <div className={`text-lg font-mono font-bold ${fpsColor}`}>{fps}</div>
        </div>
        {memoryUsed && (
          <div className="bg-black/30 rounded-lg px-3 py-1.5 flex-1">
            <div className="text-[10px] text-gray-500">内存</div>
            <div className="text-sm font-mono text-gray-200">{memoryUsed}</div>
          </div>
        )}
        <div className="bg-black/30 rounded-lg px-3 py-1.5 flex-1">
          <div className="text-[10px] text-gray-500">渲染次数</div>
          <div className="text-sm font-mono text-gray-200">{perfLogsList.length}</div>
        </div>
      </div>

      {/* 录制按钮 */}
      <button
        onClick={toggleRecording}
        className={`w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors mb-2 ${
          recording
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
            : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
        }`}
      >
        {recording ? "⏹ 停止录制" : "⏺ 开始录制渲染性能"}
      </button>

      {recording && (
        <div className="text-[10px] text-yellow-400/80 mb-2 animate-pulse">
          🔴 正在录制... 操作应用以捕获渲染性能数据
        </div>
      )}

      {/* 录制摘要 */}
      {!recording && summary && (
        <div className="bg-black/30 rounded-lg p-2.5 space-y-2">
          <div className="text-[11px] text-gray-300 font-medium">录制摘要</div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-gray-500">总渲染: </span>
              <span className="text-gray-200 font-mono">{summary.totalRenders}</span>
            </div>
            <div>
              <span className="text-gray-500">平均耗时: </span>
              <span className={`font-mono ${summary.avgDuration > 16 ? "text-red-400" : "text-gray-200"}`}>
                {summary.avgDuration.toFixed(1)}ms
              </span>
            </div>
            <div>
              <span className="text-gray-500">慢渲染: </span>
              <span className={`font-mono ${summary.slowRenders > 0 ? "text-red-400" : "text-green-400"}`}>
                {summary.slowRenders}
              </span>
            </div>
          </div>

          {summary.slowest.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1">最慢组件 Top 5:</div>
              <div className="space-y-0.5">
                {summary.slowest.map(([name, data], i) => (
                  <div key={name} className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-600 w-3">{i + 1}.</span>
                    <span className="text-yellow-300 font-mono truncate flex-1">{name}</span>
                    <span className="text-gray-500">{data.count}次</span>
                    <span className={`font-mono ${data.maxDuration > 16 ? "text-red-400" : "text-gray-400"}`}>
                      max {data.maxDuration.toFixed(1)}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== 通用子组件 ====================

function QuickTestButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-white/10 px-2.5 py-1 text-[10px] text-gray-300 hover:bg-white/20 transition-colors"
    >
      {label}
    </button>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <div className="mb-2 opacity-30">{icon}</div>
      <p className="text-sm">{title}</p>
      <p className="text-xs mt-1">{subtitle}</p>
    </div>
  );
}

function ExpandedData({ data, copyData }: { data: unknown; copyData: (d: unknown) => void }) {
  return (
    <div className="mt-1.5 relative group">
      <button
        onClick={(e) => { e.stopPropagation(); copyData(data); }}
        className="absolute top-1 right-1 rounded p-1 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
        title="复制数据"
      >
        <Copy className="h-3 w-3" />
      </button>
      <pre className="text-[11px] leading-relaxed font-mono text-gray-300 bg-black/30 rounded-md p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {formatData(data)}
      </pre>
    </div>
  );
}

function ScrollToBottom({ autoScroll: _autoScroll, setAutoScroll, scrollRef, show }: {
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <button
      onClick={() => {
        setAutoScroll(true);
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }}
      className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-500/80 px-3 py-1 text-[10px] hover:bg-blue-500 transition-colors"
    >
      ↓ 滚动到最新
    </button>
  );
}

// ==================== DB 健康检查 Tab ====================

import { dbHealthCheck, type DbHealthReport } from "@/lib/tauri-api";

function DbHealthTab() {
  const [report, setReport] = useState<DbHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dbHealthCheck();
      setReport(result);
      setLastCheckTime(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const isHealthy = report
    ? report.integrity_check === "ok" && report.foreign_key_violations.length === 0
    : null;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* 操作栏 */}
      <div className="flex items-center gap-2">
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-green-600/80 px-3 py-1.5 text-xs text-white hover:bg-green-600 transition-colors disabled:opacity-50"
        >
          <Database className="h-3 w-3" />
          {loading ? "检查中..." : "运行健康检查"}
        </button>
        {lastCheckTime && (
          <span className="text-[10px] text-gray-500">
            上次检查: {lastCheckTime.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-md bg-red-500/20 border border-red-500/30 p-2 text-xs text-red-300">
          ❌ 检查失败: {error}
        </div>
      )}

      {/* 未检查提示 */}
      {!report && !error && !loading && (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="点击上方按钮运行健康检查"
          subtitle="检查数据库完整性、表结构、外键约束、碎片化等"
        />
      )}

      {/* 健康报告 */}
      {report && (
        <div className="space-y-3">
          {/* 总体状态 */}
          <div className={`rounded-md p-2.5 border ${
            isHealthy
              ? "bg-green-500/10 border-green-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{isHealthy ? "✅" : "⚠️"}</span>
              <div>
                <div className={`text-sm font-medium ${isHealthy ? "text-green-300" : "text-red-300"}`}>
                  {isHealthy ? "数据库健康" : "数据库存在问题"}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  完整性: {report.integrity_check} | 外键违规: {report.foreign_key_violations.length}
                </div>
              </div>
            </div>
          </div>

          {/* 基本信息 */}
          <div className="rounded-md bg-white/5 p-2.5 space-y-1.5">
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">基本信息</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div>
                <span className="text-gray-500">数据库大小: </span>
                <span className="text-gray-200 font-mono">{formatBytes(report.db_size_bytes)}</span>
              </div>
              <div>
                <span className="text-gray-500">日志模式: </span>
                <span className="text-gray-200 font-mono uppercase">{report.journal_mode}</span>
              </div>
              <div>
                <span className="text-gray-500">页面大小: </span>
                <span className="text-gray-200 font-mono">{formatBytes(report.page_size)}</span>
              </div>
              <div>
                <span className="text-gray-500">总页数: </span>
                <span className="text-gray-200 font-mono">{report.page_count}</span>
              </div>
              <div>
                <span className="text-gray-500">外键约束: </span>
                <span className={`font-mono ${report.foreign_keys_enabled ? "text-green-400" : "text-red-400"}`}>
                  {report.foreign_keys_enabled ? "已启用" : "未启用"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">迁移版本: </span>
                <span className="text-gray-200 font-mono">v{report.migration_version}</span>
              </div>
              <div>
                <span className="text-gray-500">WAL 页数: </span>
                <span className="text-gray-200 font-mono">{report.wal_pages}</span>
              </div>
              <div>
                <span className="text-gray-500">空闲页数: </span>
                <span className={`font-mono ${report.freelist_count > 100 ? "text-yellow-400" : "text-gray-200"}`}>
                  {report.freelist_count}
                  {report.freelist_count > 100 && " (建议 VACUUM)"}
                </span>
              </div>
            </div>
          </div>

          {/* 表信息 */}
          <div className="rounded-md bg-white/5 p-2.5">
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">
              表 ({report.tables.length})
            </div>
            <div className="space-y-0.5">
              {report.tables.map((t) => (
                <div key={t.name} className="flex items-center justify-between text-[11px] py-0.5">
                  <span className="text-cyan-300 font-mono">{t.name}</span>
                  <span className="text-gray-400 font-mono">{t.row_count} 行</span>
                </div>
              ))}
            </div>
          </div>

          {/* 索引信息 */}
          <div className="rounded-md bg-white/5 p-2.5">
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">
              索引 ({report.indexes.length})
            </div>
            <div className="space-y-0.5">
              {report.indexes.map((idx) => (
                <div key={idx.name} className="flex items-center justify-between text-[11px] py-0.5">
                  <span className="text-yellow-300 font-mono text-[10px] truncate flex-1 mr-2">{idx.name}</span>
                  <span className="text-gray-500 font-mono text-[10px] shrink-0">→ {idx.table}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 外键违规（如果有） */}
          {report.foreign_key_violations.length > 0 && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2.5">
              <div className="text-[10px] text-red-400 font-medium uppercase tracking-wider mb-1.5">
                ⚠️ 外键违规 ({report.foreign_key_violations.length})
              </div>
              <div className="space-y-0.5">
                {report.foreign_key_violations.map((v, i) => (
                  <div key={i} className="text-[11px] text-red-300 font-mono">
                    {v.table} (rowid={v.rowid}) → {v.parent} (fkid={v.fkid})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== 词云提取 Tab ====================

function WordCloudTab({ logs }: { logs: WordCloudLogEntry[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (logs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
        <div className="text-center">
          <Cloud className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>暂无词云提取记录</p>
          <p className="text-[10px] mt-1 text-gray-600">首页词云 AI 翻译时会自动记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
      {/* 统计摘要 */}
      <div className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20">
        <span className="text-[10px] text-cyan-400">
          共 {logs.length} 次提取
        </span>
        <span className="text-[10px] text-gray-500">|</span>
        <span className="text-[10px] text-green-400">
          成功 {logs.filter(l => l.status === "success").length}
        </span>
        {logs.some(l => l.status === "error") && (
          <>
            <span className="text-[10px] text-gray-500">|</span>
            <span className="text-[10px] text-red-400">
              失败 {logs.filter(l => l.status === "error").length}
            </span>
          </>
        )}
      </div>

      {/* 日志列表（倒序显示最新的在前） */}
      {[...logs].reverse().map((log) => (
        <div
          key={log.id}
          className={`rounded-md border transition-colors cursor-pointer ${
            log.status === "error"
              ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
              : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04]"
          }`}
          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
        >
          {/* 摘要行 */}
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              log.status === "success" ? "bg-green-400" : "bg-red-400"
            }`} />
            <span className="text-[10px] text-gray-500 shrink-0">
              {formatTime(log.timestamp)}
            </span>
            <span className="text-[11px] text-cyan-300 font-medium">
              {log.extractedWords.length} 词
            </span>
            <span className="text-[10px] text-gray-500">
              {log.duration}ms
            </span>
            <span className="text-[10px] text-gray-600 truncate flex-1">
              输入 {log.inputLength} 字符
            </span>
            <ChevronDown className={`h-3 w-3 text-gray-500 transition-transform ${
              expandedId === log.id ? "rotate-180" : ""
            }`} />
          </div>

          {/* 展开详情 */}
          {expandedId === log.id && (
            <div className="px-2.5 pb-2.5 space-y-2 border-t border-white/5 pt-2">
              {/* 请求提示词 */}
              {log.prompt && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">请求提示词</div>
                  <pre className="text-[10px] text-gray-400 font-mono bg-black/30 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                    {log.prompt}
                  </pre>
                </div>
              )}

              {/* 错误信息 */}
              {log.error && (
                <div className="rounded bg-red-500/10 px-2 py-1">
                  <span className="text-[10px] text-red-400 font-mono break-all">{log.error}</span>
                </div>
              )}

              {/* 提取的词汇 */}
              {log.extractedWords.length > 0 && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">提取词汇 ({log.extractedWords.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {log.extractedWords.map((word, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI 原始输出 */}
              {log.rawOutput && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">AI 原始输出</div>
                  <pre className="text-[10px] text-gray-400 font-mono bg-black/30 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                    {log.rawOutput}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
