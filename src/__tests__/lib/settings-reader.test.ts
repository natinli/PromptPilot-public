import { beforeEach, describe, expect, it } from "vitest";
import { getCurrentAiProviderConfig, getStreamEnabled } from "@/lib/settings-reader";

describe("settings-reader CodeBuddy 配置", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("读取 CodeBuddy Provider 和独立模型", () => {
    localStorage.setItem("promptpilot_settings", JSON.stringify({
      aiProvider: "codebuddy",
      codebuddyModel: "claude-sonnet-5",
      openaiModel: "gpt-4o",
    }));

    expect(getCurrentAiProviderConfig()).toEqual({
      provider: "codebuddy",
      openaiModel: "gpt-4o",
      codebuddyModel: "claude-sonnet-5",
      geminiModel: "",
    });
  });

  it("CodeBuddy 默认开启流式输出，并可单独关闭", () => {
    localStorage.setItem("promptpilot_settings", JSON.stringify({
      aiProvider: "codebuddy",
    }));
    expect(getStreamEnabled()).toBe(true);

    localStorage.setItem("promptpilot_settings", JSON.stringify({
      aiProvider: "codebuddy",
      codebuddyStreamEnabled: false,
    }));
    expect(getStreamEnabled()).toBe(false);
  });

  it("未知 Provider 仍回退到 Gemini", () => {
    localStorage.setItem("promptpilot_settings", JSON.stringify({
      aiProvider: "removed_provider",
      codebuddyModel: "claude-sonnet-5",
    }));

    expect(getCurrentAiProviderConfig().provider).toBe("gemini");
  });
});
