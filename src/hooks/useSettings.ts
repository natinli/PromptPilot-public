/**
 * useSettings — 全局设置管理 Hook
 * 管理应用设置，持久化到 localStorage。
 */
import { useState, useCallback, useEffect } from "react";

const SETTINGS_KEY = "promptpilot_settings";

/** 首页词云数据来源模式 */
export type WordCloudMode = "smart" | "user-only" | "preset-only";

/** 主题模式 */
export type ThemeMode = "light" | "dark" | "system";

/** 窗口关闭行为 */
export type CloseBehavior = "minimize" | "quit";

/** AI Provider 选择 */
export type AiProvider = "gemini" | "openai_compat" | "codebuddy";

export interface AppSettings {
  /** 首页词云模式：smart（智能混合）、user-only（仅我的提示词）、preset-only（仅预设词汇） */
  wordCloudMode: WordCloudMode;
  /** 主题模式：light / dark / system */
  theme: ThemeMode;
  /** 窗口关闭行为：minimize（最小化到托盘）/ quit（直接退出） */
  closeBehavior: CloseBehavior;
  /** 自定义系统提示词（追加到 AI 优化的 system prompt 末尾） */
  customSystemPrompt: string;
  /** 单张图片最大大小（MB） */
  maxImageSizeMB: number;
  /** 最多上传图片数量 */
  maxImageCount: number;
  /** 全局快捷键（如 "Alt+T"） */
  globalShortcut: string;
  /** 开发者模式（打包版也能使用 Debug 面板和右键菜单） */
  devMode: boolean;
  /** 是否显示 AI 优化思路（优化结果中的分析部分） */
  showAnalysis: boolean;
  /** 是否启用 Windows 11 Mica 材质效果（仅浅色模式生效） */
  micaEnabled: boolean;
  /** Mica 材质上叠加的白色遮罩不透明度（0 = 完全透明/Mica最强，100 = 完全不透明/无Mica） */
  micaOpacity: number;
  /** 是否启用视图拆分功能（侧边栏显示入口） */
  viewSplitEnabled: boolean;
  /** AI Provider 选择：gemini（默认）| openai_compat（OpenAI 兼容中转）| codebuddy */
  aiProvider: AiProvider;
  /** OpenAI 兼容 Provider 的模型名称（用户自由填写，如 gpt-4.1-mini） */
  openaiModel: string;
  /** CodeBuddy Provider 的模型名称 */
  codebuddyModel: string;
  /** Gemini 模型名称（开发者模式下可切换，默认空表示使用默认模型） */
  geminiModel: string;
  /** 是否启用开发者直通模式入口 */
  developerRawModeEnabled: boolean;
/** 是否启用开发者 Gemini 模型切换 */
  developerGeminiModelSelectorEnabled: boolean;
  /** 是否启用开发者 Debug 工具 */
  developerDebugToolsEnabled: boolean;
  /** 是否启用 Gemini 流式输出 */
  geminiStreamEnabled: boolean;
  /** 是否启用 OpenAI 流式输出 */
  openaiStreamEnabled: boolean;
  /** 是否启用 CodeBuddy 流式输出 */
  codebuddyStreamEnabled: boolean;
  /** 是否启用图片生成功能（开发者设置中开启后侧边栏显示入口） */
  imageGenEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  wordCloudMode: "smart",
  theme: "light",
  closeBehavior: "minimize",
  customSystemPrompt: "",
  maxImageSizeMB: 20,
  maxImageCount: 10,
  globalShortcut: "Alt+T",
  devMode: false,
  showAnalysis: false,
  micaEnabled: false,
  micaOpacity: 25,
  viewSplitEnabled: false,
  aiProvider: "gemini",
  openaiModel: "",
  codebuddyModel: "",
  geminiModel: "",
  developerRawModeEnabled: true,
  developerGeminiModelSelectorEnabled: true,
  developerDebugToolsEnabled: true,
  geminiStreamEnabled: true,
  openaiStreamEnabled: true,
  codebuddyStreamEnabled: true,
  imageGenEnabled: false,
};

function mergeSettings(parsed: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    // 已移除的旧 Provider 配置不能继续进入运行时状态，未知值统一回退到 Gemini。
    aiProvider: parsed.aiProvider === "openai_compat" || parsed.aiProvider === "codebuddy"
      ? parsed.aiProvider
      : "gemini",
  };
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return mergeSettings(parsed);
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

/** 同窗口内设置变更事件名（StorageEvent 只在跨窗口时触发，同窗口需要 CustomEvent） */
const SETTINGS_CHANGED_EVENT = "pp_settings_changed";

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    // 派发 CustomEvent 通知同窗口内其他 useSettings 实例刷新
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: settings }));
  } catch {
    // ignore
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);

  // 监听其他窗口的 storage 变化（Mini 和 Full 窗口同步）
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setSettingsState(mergeSettings(parsed));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // 监听同窗口内其他 useSettings 实例的变更（解决开发者模式等设置不立即生效的问题）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail;
      if (detail) {
        setSettingsState(mergeSettings(detail));
      }
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handler);
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const setWordCloudMode = useCallback((mode: WordCloudMode) => {
    updateSettings({ wordCloudMode: mode });
  }, [updateSettings]);

  const setTheme = useCallback((theme: ThemeMode) => {
    updateSettings({ theme });
  }, [updateSettings]);

  const setCloseBehavior = useCallback((behavior: CloseBehavior) => {
    updateSettings({ closeBehavior: behavior });
  }, [updateSettings]);

  const setCustomSystemPrompt = useCallback((prompt: string) => {
    updateSettings({ customSystemPrompt: prompt });
  }, [updateSettings]);



  const setGlobalShortcut = useCallback((shortcut: string) => {
    updateSettings({ globalShortcut: shortcut });
  }, [updateSettings]);

  const setDevMode = useCallback((enabled: boolean) => {
    updateSettings({ devMode: enabled });
  }, [updateSettings]);

  const setShowAnalysis = useCallback((enabled: boolean) => {
    updateSettings({ showAnalysis: enabled });
  }, [updateSettings]);

  const setMicaEnabled = useCallback((enabled: boolean) => {
    updateSettings({ micaEnabled: enabled });
  }, [updateSettings]);

  const setMicaOpacity = useCallback((opacity: number) => {
    updateSettings({ micaOpacity: Math.max(0, Math.min(100, opacity)) });
  }, [updateSettings]);

  const setViewSplitEnabled = useCallback((enabled: boolean) => {
    updateSettings({ viewSplitEnabled: enabled });
  }, [updateSettings]);

  const setAiProvider = useCallback((provider: AiProvider) => {
    updateSettings({ aiProvider: provider });
  }, [updateSettings]);

  const setOpenaiModel = useCallback((model: string) => {
    updateSettings({ openaiModel: model });
  }, [updateSettings]);

  const setCodebuddyModel = useCallback((model: string) => {
    updateSettings({ codebuddyModel: model });
  }, [updateSettings]);

  const setGeminiModel = useCallback((model: string) => {
    updateSettings({ geminiModel: model });
  }, [updateSettings]);

  const setDeveloperRawModeEnabled = useCallback((enabled: boolean) => {
    updateSettings({ developerRawModeEnabled: enabled });
  }, [updateSettings]);

  const setDeveloperGeminiModelSelectorEnabled = useCallback((enabled: boolean) => {
    updateSettings({ developerGeminiModelSelectorEnabled: enabled });
  }, [updateSettings]);

  const setDeveloperDebugToolsEnabled = useCallback((enabled: boolean) => {
    updateSettings({ developerDebugToolsEnabled: enabled });
  }, [updateSettings]);

  const setGeminiStreamEnabled = useCallback((enabled: boolean) => {
    updateSettings({ geminiStreamEnabled: enabled });
  }, [updateSettings]);

  const setOpenaiStreamEnabled = useCallback((enabled: boolean) => {
    updateSettings({ openaiStreamEnabled: enabled });
  }, [updateSettings]);

  const setCodebuddyStreamEnabled = useCallback((enabled: boolean) => {
    updateSettings({ codebuddyStreamEnabled: enabled });
  }, [updateSettings]);

  const setImageGenEnabled = useCallback((enabled: boolean) => {
    updateSettings({ imageGenEnabled: enabled });
  }, [updateSettings]);

  return {
    settings,
    updateSettings,
    wordCloudMode: settings.wordCloudMode,
    setWordCloudMode,
    theme: settings.theme,
    setTheme,
    closeBehavior: settings.closeBehavior,
    setCloseBehavior,
    customSystemPrompt: settings.customSystemPrompt,
    setCustomSystemPrompt,
    maxImageSizeMB: settings.maxImageSizeMB,
    maxImageCount: settings.maxImageCount,
    globalShortcut: settings.globalShortcut,
    setGlobalShortcut,
    devMode: settings.devMode,
    setDevMode,
    showAnalysis: settings.showAnalysis,
    setShowAnalysis,
    micaEnabled: settings.micaEnabled,
    setMicaEnabled,
    micaOpacity: settings.micaOpacity,
    setMicaOpacity,
    viewSplitEnabled: settings.viewSplitEnabled,
    setViewSplitEnabled,
    aiProvider: settings.aiProvider,
    setAiProvider,
    openaiModel: settings.openaiModel,
    setOpenaiModel,
    codebuddyModel: settings.codebuddyModel,
    setCodebuddyModel,
    geminiModel: settings.geminiModel,
    setGeminiModel,
    developerRawModeEnabled: settings.developerRawModeEnabled,
    setDeveloperRawModeEnabled,
    developerGeminiModelSelectorEnabled: settings.developerGeminiModelSelectorEnabled,
    setDeveloperGeminiModelSelectorEnabled,
    developerDebugToolsEnabled: settings.developerDebugToolsEnabled,
    setDeveloperDebugToolsEnabled,
    geminiStreamEnabled: settings.geminiStreamEnabled,
    setGeminiStreamEnabled,
    openaiStreamEnabled: settings.openaiStreamEnabled,
    setOpenaiStreamEnabled,
    codebuddyStreamEnabled: settings.codebuddyStreamEnabled,
    setCodebuddyStreamEnabled,
    imageGenEnabled: settings.imageGenEnabled,
    setImageGenEnabled,
  };
}
