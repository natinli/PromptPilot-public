import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CreatePromptDialog,
  createDefaultPromptTitle,
} from "@/components/prompt/create-prompt-dialog";
import type { Category } from "@/lib/tauri-api";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const categories: Category[] = [
  { id: "cat-writing", name: "写作", color: null },
];

function renderDialog(
  onSave: (data: { title: string; content: string; categoryId?: string }) => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  const onOpenChange = vi.fn();
  render(
    <CreatePromptDialog
      open
      onOpenChange={onOpenChange}
      categories={categories}
      onSave={onSave}
    />,
  );
  return { onOpenChange };
}

describe("CreatePromptDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims input, generates a default title, and saves the selected category", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onOpenChange } = renderDialog(onSave);

    const categorySelect = screen.getByRole("combobox", { name: "分类（可选）" });
    expect(categorySelect).not.toHaveTextContent("不分类");

    await user.type(screen.getByLabelText("提示词正文"), "  写一段产品介绍  ");
    await user.click(categorySelect);
    await user.click(screen.getByRole("option", { name: "写作" }));
    expect(categorySelect).toHaveTextContent("写作");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      title: expect.stringMatching(/^提示词 /),
      content: "写一段产品介绍",
      categoryId: "cat-writing",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejects blank content and overlong non-empty titles before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog(onSave);

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("alert")).toHaveTextContent("内容不能为空");
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("标题（可选）"), "x".repeat(201));
    await user.type(screen.getByLabelText("提示词正文"), "有效内容");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("标题不能超过200字");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("prevents duplicate submits while saving", async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    renderDialog(onSave);

    await user.type(screen.getByLabelText("提示词正文"), "有效内容");
    const saveButton = screen.getByRole("button", { name: "保存" });
    await user.click(saveButton);
    await user.click(screen.getByRole("button", { name: "保存中..." }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("提示词正文")).toHaveValue("有效内容");
    resolveSave?.();
    await waitFor(() => expect(screen.queryByRole("button", { name: "保存中..." })).not.toBeInTheDocument());
  });

  it("keeps the form open and preserves input when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("保存失败"));
    const { onOpenChange } = renderDialog(onSave);

    await user.type(screen.getByLabelText("标题（可选）"), "我的提示词");
    await user.type(screen.getByLabelText("提示词正文"), "有效内容");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("标题（可选）")).toHaveValue("我的提示词");
    expect(screen.getByLabelText("提示词正文")).toHaveValue("有效内容");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("uses the same readable default title format as the form", () => {
    expect(createDefaultPromptTitle(new Date(2026, 7, 25, 9, 5))).toMatch(
      /^提示词 /,
    );
  });
});
