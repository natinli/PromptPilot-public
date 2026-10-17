import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import * as api from "@/lib/tauri-api";
import { getCurrentAiProviderConfig } from "@/lib/settings-reader";

/** 是否运行在 Tauri 桌面环境中（纯 Web 调试模式下为 false） */
function runningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ApiKeyContextValue {
  /** 当前 API Key（仅用于向后兼容，设置后立即存入 Rust 端） */
  apiKey: string;
  /** 当前选中的 AI Provider 是否已配置了 API Key */
  isConfigured: boolean;
  /** 是否已完成初始化（异步查询 API Key 状态完成） */
  initialized: boolean;
  /** 设置 API Key（存储到 Rust 端） */
  setApiKey: (key: string) => void;
  /** 清除 API Key */
  clearApiKey: () => void;
  /** 打开设置弹窗 */
  openSettings: () => void;
  /** 关闭设置弹窗 */
  closeSettings: () => void;
  /** 设置弹窗是否打开 */
  settingsOpen: boolean;
  /** 重新检查当前 provider 的 API Key 配置状态 */
  recheckConfigured: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

export function useApiKey() {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) {
    throw new Error("useApiKey must be used within ApiKeyProvider");
  }
  return ctx;
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  /** 检查当前 aiProvider 对应的 Key 是否已配置 */
  const checkConfigured = useCallback(async () => {
    try {
      const { provider } = getCurrentAiProviderConfig();
      let configured: boolean;
      if (provider === "openai_compat" || provider === "codebuddy") {
        configured = await api.getApiKeyStatusForProvider(provider);
      } else {
        // Gemini（默认）：检查默认 key
        configured = await api.getApiKeyStatus();
      }
      setIsConfigured(configured);
      if (configured) {
        setApiKeyState("__configured__");
      } else {
        setApiKeyState("");
      }
      return configured;
    } catch {
      return false;
    }
  }, []);

  // 从 Rust 端查询 API Key 配置状态
  useEffect(() => {
    const init = async () => {
      try {
        const configured = await checkConfigured();

        // 迁移：如果 localStorage 中有旧的 key，自动迁移到 Rust 端
        const LEGACY_KEY = "promptpilot_gemini_api_key";
        const legacyKey = localStorage.getItem(LEGACY_KEY);
        if (legacyKey && !configured) {
          await api.setApiKey(legacyKey);
          setIsConfigured(true);
          setApiKeyState("__configured__");
          localStorage.removeItem(LEGACY_KEY);
        } else if (legacyKey && configured) {
          // 已迁移，清理旧数据
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch (err) {
        if (runningInTauri()) {
          // 桌面端 IPC 失败：不得把明文 Key 降级读入 localStorage，仅记录错误。
          // 初始化完成后会因未配置弹出设置窗口，用户可重试。
          console.error("[ApiKeyProvider] 初始化 API Key 状态失败:", err);
        } else {
          // 纯 Web 调试模式：降级到 localStorage
          const LEGACY_KEY = "promptpilot_gemini_api_key";
          const stored = localStorage.getItem(LEGACY_KEY);
          if (stored) {
            setApiKeyState(stored);
            setIsConfigured(true);
          }
        }
      }
      setInitialized(true);
    };
    init();
  }, [checkConfigured]);

  // 监听 aiProvider 切换（通过 settings changed 事件），重新检查配置状态
  useEffect(() => {
    const handler = () => {
      checkConfigured();
    };
    window.addEventListener("pp_settings_changed", handler);
    return () => window.removeEventListener("pp_settings_changed", handler);
  }, [checkConfigured]);

  // 初始化完成后，如果没有 Key，自动弹出设置窗口
  useEffect(() => {
    if (initialized && !isConfigured) {
      const timer = setTimeout(() => setSettingsOpen(true), 300);
      return () => clearTimeout(timer);
    }
  }, [initialized, isConfigured]);

  const setApiKey = useCallback(async (key: string) => {
    try {
      if (key) {
        await api.setApiKey(key);
        setApiKeyState("__configured__");
        setIsConfigured(true);
      } else {
        await api.clearApiKey();
        setApiKeyState("");
        setIsConfigured(false);
      }
    } catch (err) {
      if (runningInTauri()) {
        // 桌面端保存失败：不降级为 localStorage 明文存储，报错并保持原状态
        console.error("[ApiKeyProvider] 保存 API Key 失败:", err);
        toast.error("API Key 保存失败，请重试（未做任何更改）");
        return;
      }
      // 纯 Web 调试模式：降级到 localStorage
      const LEGACY_KEY = "promptpilot_gemini_api_key";
      if (key) {
        localStorage.setItem(LEGACY_KEY, key);
        setApiKeyState(key);
        setIsConfigured(true);
      } else {
        localStorage.removeItem(LEGACY_KEY);
        setApiKeyState("");
        setIsConfigured(false);
      }
    }
  }, []);

  const clearApiKey = useCallback(async () => {
    try {
      await api.clearApiKey();
    } catch {
      localStorage.removeItem("promptpilot_gemini_api_key");
    }
    setApiKeyState("");
    setIsConfigured(false);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const recheckConfigured = useCallback(() => { checkConfigured(); }, [checkConfigured]);

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey,
        isConfigured,
        initialized,
        setApiKey,
        clearApiKey,
        openSettings,
        closeSettings,
        settingsOpen,
        recheckConfigured,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}
