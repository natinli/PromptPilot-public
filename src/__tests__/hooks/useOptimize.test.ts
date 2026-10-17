/**
 * useOptimize Hook 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOptimize } from "@/hooks/useOptimize";
import { invoke } from "@tauri-apps/api/core";

// Mock useApiKey
const mockOpenSettings = vi.fn();
vi.mock("@/components/settings/api-key-provider", () => ({
  useApiKey: () => ({
    isConfigured: true,
    openSettings: mockOpenSettings,
  }),
}));

// Mock react-router-dom（useOptimize 不直接用，但 provider 可能间接用到）
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/mini" }),
  useSearchParams: () => [new URLSearchParams()],
}));

const mockedInvoke = vi.mocked(invoke);

describe("useOptimize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初始状态正确", () => {
    const { result } = renderHook(() => useOptimize());

    expect(result.current.input).toBe("");
    expect(result.current.mode).toBe("standard");
    expect(result.current.isOptimizing).toBe(false);
    expect(result.current.result).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.copied).toBe(false);
  });

  it("可以更新输入文本", () => {
    const { result } = renderHook(() => useOptimize());

    act(() => {
      result.current.setInput("测试输入");
    });

    expect(result.current.input).toBe("测试输入");
  });

  it("可以切换优化模式", () => {
    const { result } = renderHook(() => useOptimize());

    act(() => {
      result.current.setMode("professional");
    });

    expect(result.current.mode).toBe("professional");
  });

  it("输入为空时不执行优化", async () => {
    const { result } = renderHook(() => useOptimize());

    await act(async () => {
      await result.current.handleOptimize();
    });

    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(result.current.isOptimizing).toBe(false);
  });

  it("优化成功时设置结果", async () => {
    mockedInvoke.mockResolvedValueOnce({
      id: "1",
      input_text: "test",
      output_text: "优化后的提示词",
      mode: "standard",
      model_name: "gemini-3.1-flash",
      token_in: 10,
      token_out: 20,
      status: "success",
      error_message: null,
      created_at: new Date().toISOString(),
    });

    const { result } = renderHook(() => useOptimize());

    act(() => {
      result.current.setInput("测试需求");
    });

    await act(async () => {
      await result.current.handleOptimize();
    });

    expect(result.current.result).toBe("优化后的提示词");
    expect(result.current.error).toBeNull();
    expect(result.current.isOptimizing).toBe(false);
  });

  it("优化失败时设置错误信息", async () => {
    mockedInvoke.mockRejectedValueOnce("API Key 无效");

    const { result } = renderHook(() => useOptimize());

    act(() => {
      result.current.setInput("测试需求");
    });

    await act(async () => {
      await result.current.handleOptimize();
    });

    expect(result.current.result).toBe("");
    expect(result.current.error).toBe("API Key 无效");
    expect(result.current.isOptimizing).toBe(false);
  });

  it("复制功能正确", async () => {
    mockedInvoke.mockResolvedValueOnce({
      id: "1",
      input_text: "test",
      output_text: "优化结果",
      mode: "standard",
      model_name: "gemini",
      token_in: null,
      token_out: null,
      status: "success",
      error_message: null,
      created_at: new Date().toISOString(),
    });

    const { result } = renderHook(() => useOptimize());

    act(() => {
      result.current.setInput("测试");
    });

    await act(async () => {
      await result.current.handleOptimize();
    });

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("优化结果");
    expect(result.current.copied).toBe(true);
  });

  it("支持自定义默认模式", () => {
    const { result } = renderHook(() =>
      useOptimize({ defaultMode: "creative" })
    );

    expect(result.current.mode).toBe("creative");
  });

  it("无结果时不执行复制", async () => {
    const { result } = renderHook(() => useOptimize());

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
