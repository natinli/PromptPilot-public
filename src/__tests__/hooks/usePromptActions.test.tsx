import { act, renderHook } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePromptActions } from "@/pages/prompts/hooks/usePromptActions";
import * as api from "@/lib/tauri-api";
import type { Prompt } from "@/lib/tauri-api";

vi.mock("@/lib/tauri-api", () => ({
  createPrompt: vi.fn(),
}));

const createdPrompt = {
  id: "prompt-1",
  title: "我的提示词",
  content: "有效内容",
  raw_requirement: null,
  optimized_by_model: null,
  is_favorite: false,
  is_archived: false,
  usage_count: 0,
  optimize_count: 0,
  last_used_at: null,
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
  category_id: null,
  sort_order: 1,
} satisfies Prompt;

describe("usePromptActions.createManualPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a manual prompt and notifies other pages to refresh", async () => {
    vi.mocked(api.createPrompt).mockResolvedValue(createdPrompt);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const setPrompts = vi.fn() as unknown as Dispatch<SetStateAction<Prompt[]>>;
    const adjustTotal = vi.fn();
    const { result } = renderHook(
      () => usePromptActions(setPrompts, adjustTotal),
      { wrapper: MemoryRouter },
    );

    await act(async () => {
      await result.current.createManualPrompt({
        title: "我的提示词",
        content: "有效内容",
        categoryId: "cat-writing",
      });
    });

    expect(api.createPrompt).toHaveBeenCalledWith({
      title: "我的提示词",
      content: "有效内容",
      categoryId: "cat-writing",
      sourceType: "manual",
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "prompts-updated" }),
    );
    dispatchSpy.mockRestore();
  });
});
