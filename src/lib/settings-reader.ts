/**
 * settings-reader.ts — AI Provider 设置读取纯函数
 * 统一从 localStorage 读取当前 AI Provider 配置，
 * 消除 useOptimize/OptimizePage/ViewSplitPage/DashboardPage 中的重复代码。
 */

import type { AiProvider } from "@/hooks/useSettings";

export interface AiProviderConfig {
  provider: AiProvider;
  openaiModel: string;
  codebuddyModel: string;
  geminiModel: string;
}

/**
 * 读取当前 Provider 对应的流式输出开关。
 * 根据 aiProvider 判断读取对应 Provider 的流式开关。
 */
export function getStreamEnabled(): boolean {
  try {
    const settingsRaw = localStorage.getItem("promptpilot_settings");
    if (!settingsRaw) return false;
    const settings = JSON.parse(settingsRaw);
    const provider = settings.aiProvider === "openai_compat"
      ? "openai_compat"
      : settings.aiProvider === "codebuddy" ? "codebuddy" : "gemini";
    if (provider === "openai_compat") return settings.openaiStreamEnabled === true;
    if (provider === "codebuddy") return settings.codebuddyStreamEnabled !== false;
    return settings.geminiStreamEnabled === true;
  } catch {
    return false;
  }
}

/**
 * 从 localStorage 读取当前 AI Provider 配置。
 * 纯函数，无副作用，可在任何上下文中安全调用。
 */
export function getCurrentAiProviderConfig(): AiProviderConfig {
  const defaults: AiProviderConfig = {
    provider: "gemini",
    openaiModel: "",
    codebuddyModel: "",
    geminiModel: "",
  };

  try {
    const settingsRaw = localStorage.getItem("promptpilot_settings");
    if (!settingsRaw) return defaults;
    const settings = JSON.parse(settingsRaw);
    return {
      provider: settings.aiProvider === "openai_compat"
        ? "openai_compat"
        : settings.aiProvider === "codebuddy" ? "codebuddy" : defaults.provider,
      openaiModel: settings.openaiModel || defaults.openaiModel,
      codebuddyModel: settings.codebuddyModel || defaults.codebuddyModel,
      geminiModel: settings.geminiModel || defaults.geminiModel,
    };
  } catch {
    return defaults;
  }
}
