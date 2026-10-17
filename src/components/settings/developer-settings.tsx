import { Label } from "@/components/ui/label";
import { Sparkles, Code } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { geminiModelList } from "@/constants/optimize-modes";

export function DeveloperSettings() {
  const {
    geminiModel,
    setGeminiModel,
    aiProvider,
    developerRawModeEnabled,
    setDeveloperRawModeEnabled,
    developerGeminiModelSelectorEnabled,
    setDeveloperGeminiModelSelectorEnabled,
    developerDebugToolsEnabled,
    setDeveloperDebugToolsEnabled,
    customSystemPrompt,
    setCustomSystemPrompt,
    geminiStreamEnabled,
    setGeminiStreamEnabled,
    openaiStreamEnabled,
    setOpenaiStreamEnabled,
    codebuddyStreamEnabled,
    setCodebuddyStreamEnabled,
    imageGenEnabled,
    setImageGenEnabled,
  } = useSettings();

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Code className="h-5 w-5 text-foreground/60" />
          开发者设置
        </h4>
        <p className="text-sm text-foreground/50 mt-1">开发者模式下的高级功能配置</p>
      </div>

      <div className="space-y-6">
        {/* 开发者功能开关 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-foreground/50" />
            <Label className="text-sm font-medium text-foreground/70">功能开关</Label>
          </div>
          <p className="text-xs text-foreground/45 -mt-1">
            开发者模式开启后，你仍可以按需单独控制每个功能是否显示。
          </p>

          <div className="space-y-3 mt-2">
            {[
              {
                key: "gemini-model-selector",
                icon: "🔀",
                title: "Gemini 模型切换",
                desc: "在优化页面工具栏显示 Gemini 模型下拉选择",
                enabled: developerGeminiModelSelectorEnabled,
                onToggle: () => setDeveloperGeminiModelSelectorEnabled(!developerGeminiModelSelectorEnabled),
              },
              {
                key: "raw-mode",
                icon: "🔗",
                title: "直通模式",
                desc: "在优化模式中显示「直通」选项，不优化直接发送给 AI",
                enabled: developerRawModeEnabled,
                onToggle: () => setDeveloperRawModeEnabled(!developerRawModeEnabled),
              },
              {
                key: "debug-tools",
                icon: "🛠",
                title: "Debug 工具",
                desc: "启用 Debug 面板、F8 快捷键和标题栏图标双击调试入口",
                enabled: developerDebugToolsEnabled,
                onToggle: () => setDeveloperDebugToolsEnabled(!developerDebugToolsEnabled),
              },
              {
                key: "image-gen",
                icon: "🎨",
                title: "图片生成",
                desc: "在侧边栏显示图片生成入口，支持 OpenAI 和 Gemini 双 Provider",
                enabled: imageGenEnabled,
                onToggle: () => setImageGenEnabled(!imageGenEnabled),
              },
            ].map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-sm mt-0.5">{item.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground/75">{item.title}</div>
                    <div className="text-[11px] text-foreground/40 mt-0.5 leading-relaxed">{item.desc}</div>
                  </div>
                </div>
                <button
                  onClick={item.onToggle}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    item.enabled ? "bg-primary/80" : "bg-foreground/15"
                  }`}
                  aria-label={`切换${item.title}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                    item.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* 流式输出 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <Label className="text-sm font-medium text-foreground/70">流式输出</Label>
          </div>
          <p className="text-xs text-foreground/45 -mt-1">
            开启后 AI 优化结果逐字生成，类似 ChatGPT 的打字机效果。可按 Provider 独立控制。
          </p>

          <div className="grid grid-cols-3 gap-3 mt-2">
            {[
              { key: "gemini-stream", title: "Gemini", enabled: geminiStreamEnabled, onToggle: () => setGeminiStreamEnabled(!geminiStreamEnabled) },
              { key: "openai-stream", title: "OpenAI 兼容", enabled: openaiStreamEnabled, onToggle: () => setOpenaiStreamEnabled(!openaiStreamEnabled) },
              { key: "codebuddy-stream", title: "CodeBuddy", enabled: codebuddyStreamEnabled, onToggle: () => setCodebuddyStreamEnabled(!codebuddyStreamEnabled) },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5">
                <span className="text-sm font-medium text-foreground/75">{item.title}</span>
                <button
                  onClick={item.onToggle}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                    item.enabled ? "bg-primary/80" : "bg-foreground/15"
                  }`}
                  aria-label={`切换${item.title}流式输出`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                    item.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Gemini 模型切换 */}
        <div className={`space-y-3 transition-opacity ${developerGeminiModelSelectorEnabled ? "" : "opacity-45"}`}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-foreground/50" />
            <Label className="text-sm font-medium text-foreground/70">Gemini 模型</Label>
          </div>
          <p className="text-xs text-foreground/45 -mt-1">
选择 Gemini API 使用的模型。关闭上方「Gemini 模型切换」后，此处配置仍会保留，但优化页不再显示切换入口。
          </p>

          {aiProvider !== "gemini" && (
            <p className="text-xs text-amber-500/80 mt-1">
              ⚠ 当前使用的是 OpenAI 兼容 Provider，此设置仅在切换回 Gemini 后生效
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => setGeminiModel("")}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all cursor-pointer ${
                !geminiModel
                  ? "border-foreground/30 bg-foreground/[0.03] shadow-sm"
                  : "border-border/50 hover:border-foreground/15 bg-background"
              }`}
            >
              <span className={`font-medium ${!geminiModel ? "text-foreground" : "text-foreground/50"}`}>
                默认模型
              </span>
            </button>
            {geminiModelList.map((m) => (
              <button
                key={m}
                onClick={() => setGeminiModel(m)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all cursor-pointer ${
                  geminiModel === m
                    ? "border-foreground/30 bg-foreground/[0.03] shadow-sm"
                    : "border-border/50 hover:border-foreground/15 bg-background"
                }`}
              >
                <span className={`font-medium truncate ${geminiModel === m ? "text-foreground" : "text-foreground/50"}`}>
                  {m}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* 自定义系统提示词 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-foreground/50" />
            <Label className="text-sm font-medium text-foreground/70">自定义系统提示词</Label>
          </div>
          <p className="text-xs text-foreground/45 -mt-1 leading-relaxed">
            追加到 AI 优化的 system prompt 末尾。可用于添加个人偏好、输出风格要求等。留空则不追加。
          </p>
          <textarea
            value={customSystemPrompt}
            onChange={(e) => setCustomSystemPrompt(e.target.value)}
            placeholder="例如：请始终使用简洁专业的语气，避免使用emoji..."
            className="w-full min-h-[100px] max-h-[200px] rounded-lg border border-border/50 bg-background px-3 py-2.5 text-sm text-foreground/80 placeholder:text-foreground/25 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 resize-y transition-colors"
          />
          {customSystemPrompt && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-foreground/35">{customSystemPrompt.length} 字符</span>
              <button
                onClick={() => setCustomSystemPrompt("")}
                className="text-[11px] text-foreground/40 hover:text-foreground/60 transition-colors cursor-pointer"
              >
                清空
              </button>
            </div>
          )}
        </div>

        <div className="h-px bg-border/40" />

        {/* 关闭开发者模式提示 */}
        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-xs text-foreground/50 leading-relaxed">
            <strong className="text-foreground/65">提示：</strong>
            如需关闭开发者模式，请前往「关于」页面，连续点击 5 次应用图标即可关闭。
          </p>
        </div>
      </div>
    </div>
  );
}
