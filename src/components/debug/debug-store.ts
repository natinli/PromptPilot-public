/**
 * Debug Store — Debug 面板的数据存储层
 *
 * 存储所有日志数据和订阅机制，与 UI 组件解耦。
 * 外部模块（tauri-api.ts、error-boundary.tsx、App.tsx 等）
 * 只需 import 此文件即可推送日志，不再引入整个 debug-panel.tsx。
 */

import { useState, useEffect } from "react";

// ==================== IPC 日志 ====================

export interface IpcLogEntry {
  id: number;
  timestamp: Date;
  command: string;
  direction: "request" | "response" | "error";
  data: unknown;
  duration?: number;
}

const MAX_LOGS = 200;
let logIdCounter = 0;
let ipcLogs: IpcLogEntry[] = [];
const ipcListeners = new Set<() => void>();

export function pushIpcLog(entry: Omit<IpcLogEntry, "id" | "timestamp">) {
  const log: IpcLogEntry = { ...entry, id: ++logIdCounter, timestamp: new Date() };
  ipcLogs = [...ipcLogs.slice(-(MAX_LOGS - 1)), log];
  ipcListeners.forEach((fn) => fn());
}

export function clearIpcLogs() {
  ipcLogs = [];
  ipcListeners.forEach((fn) => fn());
}

export function getIpcLogs() { return ipcLogs; }

export function useIpcLogs(): IpcLogEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    ipcListeners.add(listener);
    return () => { ipcListeners.delete(listener); };
  }, []);
  return ipcLogs;
}

// ==================== Rust 日志 ====================

export interface RustLogEntry {
  id: number;
  timestamp: string;
  command: string;
  message: string;
  data?: unknown;
  receivedAt: Date;
}

let rustLogIdCounter = 0;
let rustLogs: RustLogEntry[] = [];
const rustListeners = new Set<() => void>();

export function pushRustLog(entry: Omit<RustLogEntry, "id" | "receivedAt">) {
  const log: RustLogEntry = { ...entry, id: ++rustLogIdCounter, receivedAt: new Date() };
  rustLogs = [...rustLogs.slice(-(MAX_LOGS - 1)), log];
  rustListeners.forEach((fn) => fn());
}

export function clearRustLogs() {
  rustLogs = [];
  rustListeners.forEach((fn) => fn());
}

export function useRustLogs(): RustLogEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    rustListeners.add(listener);
    return () => { rustListeners.delete(listener); };
  }, []);
  return rustLogs;
}

// ==================== 错误日志 ====================

export interface ErrorLogEntry {
  id: number;
  type: "js-error" | "promise-rejection" | "react-error";
  message: string;
  stack?: string;
  timestamp: Date;
}

const MAX_ERROR_LOGS = 100;
let errorLogIdCounter = 0;
let errorLogs: ErrorLogEntry[] = [];
const errorListeners = new Set<() => void>();

export function pushErrorLog(entry: Omit<ErrorLogEntry, "id" | "timestamp">) {
  const log: ErrorLogEntry = { ...entry, id: ++errorLogIdCounter, timestamp: new Date() };
  errorLogs = [...errorLogs.slice(-(MAX_ERROR_LOGS - 1)), log];
  errorListeners.forEach((fn) => fn());
}

export function clearErrorLogs() {
  errorLogs = [];
  errorListeners.forEach((fn) => fn());
}

export function useErrorLogs(): ErrorLogEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    errorListeners.add(listener);
    return () => { errorListeners.delete(listener); };
  }, []);
  return errorLogs;
}

// ==================== 事件日志 ====================

export interface EventLogEntry {
  id: number;
  type: "route" | "custom-event" | "tauri-event" | "sync-warning";
  detail: string;
  timestamp: Date;
  mutatedData?: string[];
  source?: string;
}

const MAX_EVENT_LOGS = 50;
let eventLogIdCounter = 0;
let eventLogs: EventLogEntry[] = [];
const eventListeners = new Set<() => void>();

export function pushEventLog(entry: Omit<EventLogEntry, "id" | "timestamp">) {
  const log: EventLogEntry = { ...entry, id: ++eventLogIdCounter, timestamp: new Date() };
  eventLogs = [...eventLogs.slice(-(MAX_EVENT_LOGS - 1)), log];
  eventListeners.forEach((fn) => fn());
}

export function pushRouteChange(from: string, to: string, navType: string) {
  pushEventLog({ type: "route", detail: `${from} → ${to} (${navType})` });
}

export function clearEventLogs() {
  eventLogs = [];
  eventListeners.forEach((fn) => fn());
}

export function useEventLogs(): EventLogEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    eventListeners.add(listener);
    return () => { eventListeners.delete(listener); };
  }, []);
  return eventLogs;
}

// ==================== 性能监控 ====================

export interface PerfRenderEntry {
  id: number;
  componentName: string;
  phase: string;
  actualDuration: number;
  baseDuration: number;
  timestamp: Date;
}

const MAX_PERF_LOGS = 200;
let perfLogIdCounter = 0;
let perfLogs: PerfRenderEntry[] = [];
const perfListeners = new Set<() => void>();
let isRecording = false;
let lowFpsWarning = false;
const lowFpsListeners = new Set<() => void>();

export function pushPerfLog(entry: Omit<PerfRenderEntry, "id" | "timestamp">) {
  if (!isRecording) return;
  const log: PerfRenderEntry = { ...entry, id: ++perfLogIdCounter, timestamp: new Date() };
  perfLogs = [...perfLogs.slice(-(MAX_PERF_LOGS - 1)), log];
  perfListeners.forEach((fn) => fn());
}

export function clearPerfLogs() {
  perfLogs = [];
  perfListeners.forEach((fn) => fn());
}

export function getIsRecording() { return isRecording; }
export function setIsRecording(v: boolean) {
  isRecording = v;
  perfListeners.forEach((fn) => fn());
}

export function usePerfLogs(): PerfRenderEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    perfListeners.add(listener);
    return () => { perfListeners.delete(listener); };
  }, []);
  return perfLogs;
}

export function setLowFpsWarning(v: boolean) {
  if (lowFpsWarning !== v) {
    lowFpsWarning = v;
    lowFpsListeners.forEach((fn) => fn());
  }
}

export function useLowFpsWarning(): boolean {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    lowFpsListeners.add(listener);
    return () => { lowFpsListeners.delete(listener); };
  }, []);
  return lowFpsWarning;
}

// ==================== AI 请求日志 ====================

export interface AiRequestLogEntry {
  id: number;
  requestType: string;
  promptSummary: string;
  model: string;
  status: "pending" | "success" | "error";
  startTime: Date;
  duration?: number;
  responseSummary?: string;
  error?: string;
  timestamp: Date;
}

const MAX_AI_LOGS = 30;
let aiLogIdCounter = 0;
let aiLogs: AiRequestLogEntry[] = [];
const aiListeners = new Set<() => void>();

export function pushAiLog(entry: Omit<AiRequestLogEntry, "id" | "timestamp">): number {
  const log: AiRequestLogEntry = { ...entry, id: ++aiLogIdCounter, timestamp: new Date() };
  aiLogs = [...aiLogs.slice(-(MAX_AI_LOGS - 1)), log];
  aiListeners.forEach((fn) => fn());
  return log.id;
}

export function updateAiLog(id: number, updates: Partial<Pick<AiRequestLogEntry, "status" | "duration" | "responseSummary" | "error">>) {
  aiLogs = aiLogs.map((log) => log.id === id ? { ...log, ...updates } : log);
  aiListeners.forEach((fn) => fn());
}

export function clearAiLogs() {
  aiLogs = [];
  aiListeners.forEach((fn) => fn());
}

export function useAiLogs(): AiRequestLogEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    aiListeners.add(listener);
    return () => { aiListeners.delete(listener); };
  }, []);
  return aiLogs;
}

// ==================== 词云提取日志 ====================

export interface WordCloudLogEntry {
  id: number;
  timestamp: Date;
  prompt: string;
  inputLength: number;
  rawOutput: string;
  extractedWords: string[];
  duration: number;
  status: "success" | "error";
  error?: string;
}

const MAX_WORDCLOUD_LOGS = 20;
const WORDCLOUD_STORAGE_KEY = "pp_debug_wordcloud_logs";
let wordCloudLogIdCounter = 0;
let wordCloudLogs: WordCloudLogEntry[] = [];
const wordCloudListeners = new Set<() => void>();

try {
  const stored = localStorage.getItem(WORDCLOUD_STORAGE_KEY);
  if (stored) {
    const parsed: WordCloudLogEntry[] = JSON.parse(stored);
    wordCloudLogs = parsed.map((l) => ({ ...l, timestamp: new Date(l.timestamp) }));
    wordCloudLogIdCounter = wordCloudLogs.reduce((max, l) => Math.max(max, l.id), 0);
  }
} catch { /* ignore */ }

function persistWordCloudLogs() {
  try { localStorage.setItem(WORDCLOUD_STORAGE_KEY, JSON.stringify(wordCloudLogs)); } catch { /* ignore */ }
}

export function pushWordCloudLog(entry: Omit<WordCloudLogEntry, "id" | "timestamp">) {
  const log: WordCloudLogEntry = { ...entry, id: ++wordCloudLogIdCounter, timestamp: new Date() };
  wordCloudLogs = [...wordCloudLogs.slice(-(MAX_WORDCLOUD_LOGS - 1)), log];
  persistWordCloudLogs();
  wordCloudListeners.forEach((fn) => fn());
}

export function clearWordCloudLogs() {
  wordCloudLogs = [];
  persistWordCloudLogs();
  wordCloudListeners.forEach((fn) => fn());
}

export function useWordCloudLogs(): WordCloudLogEntry[] {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    wordCloudListeners.add(listener);
    return () => { wordCloudListeners.delete(listener); };
  }, []);
  return wordCloudLogs;
}

// ==================== 工具函数 ====================

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }) + "." + String(date.getMilliseconds()).padStart(3, "0");
}

export function formatData(data: unknown): string {
  if (data === undefined || data === null) return "—";
  try {
    const str = JSON.stringify(data, null, 2);
    if (str.length > 500) return str.slice(0, 500) + "\n... (已截断)";
    return str;
  } catch {
    return String(data);
  }
}

// ==================== Tab 类型 ====================

export type TabType = "ipc" | "rust" | "test" | "errors" | "state" | "events" | "ai-perf" | "db-health" | "wordcloud";
