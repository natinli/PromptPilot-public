/**
 * tauri-api.ts 关键函数测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import * as api from "@/lib/tauri-api";

const mockedInvoke = vi.mocked(invoke);

describe("tauri-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("optimizePrompt", () => {
    it("正确映射请求参数并返回结果", async () => {
      mockedInvoke.mockResolvedValueOnce({
        id: "log-1",
        input_text: "写一篇文章",
        output_text: "优化后的提示词",
        mode: "standard",
        model_name: "gemini-3.1-flash",
        token_in: 15,
        token_out: 30,
        status: "success",
        error_message: null,
        created_at: "2024-01-01T00:00:00Z",
      });

      const result = await api.optimizePrompt({
        rawRequirement: "写一篇文章",
        mode: "standard",
        language: "zh-CN",
        outputFormat: "plain_text",
      });

      expect(mockedInvoke).toHaveBeenCalledWith("optimize_prompt", {
        req: {
          raw_requirement: "写一篇文章",
          mode: "standard",
          language: "zh-CN",
          output_format: "plain_text",
          api_key: null,
          model: null,
          prompt_id: null,
          images: null,
          skip_log: false,
          provider: null,
          openai_model: null,
          openai_endpoint: null,
          codebuddy_model: null,
          custom_system_prompt: null,
        },
      });

      expect(result).toEqual({
        optimized_prompt: "优化后的提示词",
        model: "gemini-3.1-flash",
        usage: {
          input_tokens: 15,
          output_tokens: 30,
        },
      });
    });

    it("output_text 为 null 时返回空字符串", async () => {
      mockedInvoke.mockResolvedValueOnce({
        id: "log-2",
        input_text: "test",
        output_text: null,
        mode: "standard",
        model_name: "gemini",
        token_in: null,
        token_out: null,
        status: "error",
        error_message: "Error",
        created_at: "2024-01-01T00:00:00Z",
      });

      const result = await api.optimizePrompt({
        rawRequirement: "test",
        mode: "standard",
      });

      expect(result.optimized_prompt).toBe("");
    });
  });

  describe("optimizePromptStream", () => {
    it("把流式请求关联 ID 传递给 Rust command", async () => {
      mockedInvoke.mockResolvedValueOnce({
        id: "stream-log",
        input_text: "test",
        output_text: "流式结果",
        mode: "standard",
        model_name: "gemini",
        token_in: null,
        token_out: null,
        status: "success",
        error_message: null,
        created_at: "2024-01-01T00:00:00Z",
      });

      await api.optimizePromptStream({
        requestId: "stream-1",
        rawRequirement: "test",
        mode: "standard",
      });

      expect(mockedInvoke).toHaveBeenCalledWith("optimize_prompt_stream", {
        req: expect.objectContaining({
          request_id: "stream-1",
          raw_requirement: "test",
          mode: "standard",
        }),
      });
    });
  });

  describe("getPrompts", () => {
    it("正确传递查询参数", async () => {
      mockedInvoke.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      });

      await api.getPrompts({
        keyword: "测试",
        categoryId: "cat-1",
        favorite: true,
        page: 2,
        pageSize: 10,
      });

      expect(mockedInvoke).toHaveBeenCalledWith("get_prompts", {
        search: "测试",
        categoryId: "cat-1",
        isFavorite: "true",
        isArchived: "false",
        sort: null,
        page: 2,
        pageSize: 10,
      });
    });

    it("使用默认参数", async () => {
      mockedInvoke.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      });

      await api.getPrompts({});

      expect(mockedInvoke).toHaveBeenCalledWith("get_prompts", {
        search: null,
        categoryId: null,
        isFavorite: null,
        isArchived: "false",
        sort: null,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe("API Key 管理", () => {
    it("setApiKey 调用正确", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await api.setApiKey("AIzaSy-test-key");

      expect(mockedInvoke).toHaveBeenCalledWith("set_api_key", {
        key: "AIzaSy-test-key",
      });
    });

    it("getApiKeyStatus 返回布尔值", async () => {
      mockedInvoke.mockResolvedValueOnce(true);

      const result = await api.getApiKeyStatus();

      expect(result).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith("get_api_key_status", undefined);
    });

    it("clearApiKey 调用正确", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await api.clearApiKey();

      expect(mockedInvoke).toHaveBeenCalledWith("clear_api_key", undefined);
    });
  });

  describe("CodeBuddy", () => {
    it("模型列表只通过固定的 Rust Command 获取", async () => {
      mockedInvoke.mockResolvedValueOnce(["claude-sonnet-5", "gpt-5.6-sol"]);

      await expect(api.fetchCodebuddyModels()).resolves.toEqual([
        "claude-sonnet-5",
        "gpt-5.6-sol",
      ]);
      expect(mockedInvoke).toHaveBeenCalledWith("fetch_codebuddy_models", undefined);
    });
  });

  describe("窗口管理", () => {
    it("getWindowMode 返回模式字符串", async () => {
      mockedInvoke.mockResolvedValueOnce("mini");

      const result = await api.getWindowMode();

      expect(result).toBe("mini");
    });

    it("prepareSwitch 返回目标路由", async () => {
      mockedInvoke.mockResolvedValueOnce("/dashboard");

      const result = await api.prepareSwitch("full");

      expect(result).toBe("/dashboard");
      expect(mockedInvoke).toHaveBeenCalledWith("prepare_switch", {
        targetMode: "full",
      });
    });
  });
});
