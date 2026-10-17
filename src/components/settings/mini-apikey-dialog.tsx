import { useState, useEffect } from "react";
import { useApiKey } from "./api-key-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ExternalLink, ShieldCheck, Check, Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import * as api from "@/lib/tauri-api";

const makeKeyMask = (len: number) => "•".repeat(len || 24);
const DEFAULT_CODEBUDDY_MODEL = "gpt-5.6-luna";

type ProviderTab = "gemini" | "codebuddy";

export function MiniApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { setApiKey, clearApiKey } = useApiKey();
  const { aiProvider, setAiProvider, codebuddyModel, setCodebuddyModel } = useSettings();

  // Mini 首次配置也提供 CodeBuddy；端点不在此处暴露。
  const [activeTab, setActiveTab] = useState<ProviderTab>(aiProvider === "codebuddy" ? "codebuddy" : "gemini");

  // ========== Gemini 状态 ==========
  const [geminiInput, setGeminiInput] = useState("");
  const [geminiShowKey, setGeminiShowKey] = useState(false);
  const [geminiMasked, setGeminiMasked] = useState(true);
  const [geminiKeyLength, setGeminiKeyLength] = useState(0);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  // ========== CodeBuddy 状态 ==========
  const [codebuddyInput, setCodebuddyInput] = useState("");
  const [codebuddyShowKey, setCodebuddyShowKey] = useState(false);
  const [codebuddyMasked, setCodebuddyMasked] = useState(true);
  const [codebuddyKeyLength, setCodebuddyKeyLength] = useState(0);
  const [codebuddyConfigured, setCodebuddyConfigured] = useState(false);
  const [codebuddyChecking, setCodebuddyChecking] = useState(false);
  const [codebuddyLoadingKey, setCodebuddyLoadingKey] = useState(false);

  // 通用状态
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);

  // 初始化 Gemini 配置状态
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [gemConf, codebuddyConf] = await Promise.all([
          api.getApiKeyStatus(),
          api.getApiKeyStatusForProvider("codebuddy"),
        ]);
        setGeminiConfigured(gemConf);
        setCodebuddyConfigured(codebuddyConf);
        if (gemConf) {
          const key = await api.getApiKey();
          if (key) setGeminiKeyLength(key.length);
        }
        if (codebuddyConf) {
          const key = await api.getApiKeyForProvider("codebuddy");
          if (key) setCodebuddyKeyLength(key.length);
        }
      } catch { /* ignore */ }
    })();
    setActiveTab(aiProvider === "codebuddy" ? "codebuddy" : "gemini");
  }, [open, aiProvider]);

  // 切换 Tab
  const handleTabChange = (tab: ProviderTab) => {
    setActiveTab(tab);
    setError("");
    setSaveSuccess(false);
  };

  // 当前 Tab 是否已配置
  const currentConfigured = activeTab === "codebuddy" ? codebuddyConfigured : geminiConfigured;

  // ========== Gemini 操作 ==========
  const handleGeminiToggleShow = async () => {
    if (!geminiShowKey && geminiConfigured && geminiMasked) {
      setLoadingKey(true);
      try {
        const key = await api.getApiKey();
        setGeminiInput(key);
        setGeminiMasked(false);
        setGeminiShowKey(true);
      } catch { setError("无法获取 API Key"); }
      finally { setLoadingKey(false); }
    } else if (geminiShowKey) {
      setGeminiInput("");
      setGeminiMasked(true);
      setGeminiShowKey(false);
    } else {
      setGeminiShowKey(!geminiShowKey);
    }
  };

  const handleGeminiSave = () => {
    const trimmed = geminiInput.trim();
    if (!trimmed && geminiConfigured) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return;
    }
    if (!trimmed) { setError("请输入 API Key"); return; }
    if (!trimmed.startsWith("AIza") || trimmed.length < 30) {
      setError("API Key 格式不正确，请检查后重试");
      return;
    }
    const wasConfigured = geminiConfigured;
    setApiKey(trimmed);
    setGeminiInput("");
    setGeminiMasked(true);
    setGeminiConfigured(true);
    setError("");
    setSaveSuccess(true);
    if (!wasConfigured) {
      setTimeout(() => { onOpenChange(false); setSaveSuccess(false); }, 1200);
    } else {
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleGeminiClear = () => {
    clearApiKey();
    setGeminiInput("");
    setGeminiShowKey(false);
    setGeminiMasked(false);
    setGeminiConfigured(false);
    setError("");
  };

  // ========== CodeBuddy 操作 ==========
  const checkCodebuddyConnection = async (): Promise<boolean> => {
    setCodebuddyChecking(true);
    setError("");
    try {
      const models = await api.fetchCodebuddyModels();
      if (!models || models.length === 0) {
        setError("Key 已保存，但暂时无法验证 CodeBuddy 连接，请检查网络后重试");
        return false;
      }
      try { localStorage.setItem("pp_codebuddy_model_list", JSON.stringify(models)); } catch {}
      window.dispatchEvent(new CustomEvent("pp_codebuddy_model_list_updated"));
      const currentModel = codebuddyModel.trim();
      const selectedModel = !currentModel || currentModel === "claude-sonnet-5" || !models.includes(currentModel)
        ? models.includes(DEFAULT_CODEBUDDY_MODEL)
          ? DEFAULT_CODEBUDDY_MODEL
          : models.includes("claude-sonnet-5")
            ? "claude-sonnet-5"
            : models[0]
        : currentModel;
      setCodebuddyModel(selectedModel);
      return true;
    } catch (err: unknown) {
      setError(`Key 已保存，但连接检查失败：${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setCodebuddyChecking(false);
    }
  };

  const handleCodebuddyToggleShow = async () => {
    if (!codebuddyShowKey && codebuddyConfigured && codebuddyMasked) {
      setCodebuddyLoadingKey(true);
      try {
        const key = await api.getApiKeyForProvider("codebuddy");
        setCodebuddyInput(key);
        setCodebuddyMasked(false);
        setCodebuddyShowKey(true);
      } catch { setError("无法获取 API Key"); }
      finally { setCodebuddyLoadingKey(false); }
    } else if (codebuddyShowKey) {
      setCodebuddyInput("");
      setCodebuddyMasked(true);
      setCodebuddyShowKey(false);
    } else {
      setCodebuddyShowKey(!codebuddyShowKey);
    }
  };

  const persistCodebuddyKey = async (): Promise<boolean> => {
    const trimmed = codebuddyInput.trim();
    if (!trimmed) {
      if (!codebuddyConfigured) {
        setError("请输入 API Key");
        return false;
      }
      return true;
    }

    await api.setApiKeyForProvider(trimmed, "codebuddy");
    setCodebuddyKeyLength(trimmed.length);
    setCodebuddyConfigured(true);
    setCodebuddyInput("");
    setCodebuddyMasked(true);
    setCodebuddyShowKey(false);
    setError("");
    return true;
  };

  const handleCodebuddySave = async () => {
    try {
      if (!(await persistCodebuddyKey())) return;
      setAiProvider("codebuddy");
      if (!codebuddyModel.trim()) {
        setCodebuddyModel(DEFAULT_CODEBUDDY_MODEL);
      }
      const connected = await checkCodebuddyConnection();
      if (!connected) return;
      setSaveSuccess(true);
      setTimeout(() => { onOpenChange(false); setSaveSuccess(false); }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCodebuddyClear = async () => {
    try {
      await api.clearApiKeyForProvider("codebuddy");
      setCodebuddyInput("");
      setCodebuddyShowKey(false);
      setCodebuddyMasked(true);
      setCodebuddyConfigured(false);
      setCodebuddyModel("");
      try { localStorage.removeItem("pp_codebuddy_model_list"); } catch {}
      setError("");
    } catch { /* ignore */ }
  };

  // 通用操作
  const handleSave = () => {
    if (activeTab === "codebuddy") {
      void handleCodebuddySave();
    } else {
      handleGeminiSave();
    }
  };

  const handleClear = () => {
    if (activeTab === "codebuddy") {
      void handleCodebuddyClear();
    } else {
      handleGeminiClear();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
        <div className="p-6 space-y-5">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-foreground/60" />
              API Key 设置
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground/50 leading-relaxed">
              配置 API Key 以启用提示词优化功能。
              Gemini 和 CodeBuddy 都可以在此处完成首次配置。
            </DialogDescription>
          </DialogHeader>

          {/* Tab 切换 - 底部横线指示器 */}
          <div className="flex gap-4 border-b border-border/40">
            {([
              { key: "gemini" as ProviderTab, label: "Gemini" },
              { key: "codebuddy" as ProviderTab, label: "CodeBuddy" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`relative px-1 pb-2.5 text-sm font-medium transition-colors ${
                  activeTab === key
                    ? "text-foreground"
                    : "text-foreground/40 hover:text-foreground/60"
                }`}
              >
                {label}
                {activeTab === key && (
                  <span className="absolute left-0 -bottom-px h-0.5 w-full rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* 已配置提示 */}
            {currentConfigured && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>已配置</span>
              </div>
            )}

            {/* ========== Gemini 配置表单 ========== */}
            {activeTab === "gemini" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mini-api-key">Gemini API Key</Label>
                  <div className="relative">
                    <Input
                      id="mini-api-key"
                      type={geminiShowKey ? "text" : "password"}
                      value={geminiConfigured && geminiMasked ? makeKeyMask(geminiKeyLength) : geminiInput}
                      onChange={(e) => {
                        if (geminiMasked) {
                          setGeminiMasked(false);
                          setGeminiInput(e.target.value.replace(/•/g, ""));
                        } else {
                          setGeminiInput(e.target.value);
                        }
                        setError("");
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="AIzaSy..."
                      className="pr-10 font-mono text-sm"
                      autoComplete="off"
                      autoFocus={!geminiConfigured}
                      onFocus={async () => {
                        if (geminiConfigured && geminiMasked) {
                          setLoadingKey(true);
                          try {
                            const key = await api.getApiKey();
                            setGeminiInput(key);
                            setGeminiMasked(false);
                            requestAnimationFrame(() => {
                              const input = document.getElementById("mini-api-key") as HTMLInputElement;
                              if (input) { input.focus(); input.setSelectionRange(key.length, key.length); }
                            });
                          } catch { setError("无法获取 API Key"); }
                          finally { setLoadingKey(false); }
                        }
                      }}
                      onBlur={() => {
                        if (geminiConfigured && !geminiInput.trim()) setGeminiMasked(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleGeminiToggleShow}
                      disabled={loadingKey}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground/60 transition-colors disabled:opacity-40"
                    >
                      {geminiShowKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {error && <p className="text-xs text-rose-500">{error}</p>}
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                  <ExternalLink className="h-4 w-4 text-foreground/45 mt-0.5 shrink-0" />
                  <div className="text-xs text-foreground/65 leading-relaxed">
                    <span>还没有 API Key？前往 </span>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        import("@tauri-apps/plugin-shell").then(({ open }) => {
                          open("https://aistudio.google.com/apikey");
                        }).catch(() => {
                          window.open("https://aistudio.google.com/apikey", "_blank");
                        });
                      }}
                    >
                      Google AI Studio
                    </a>
                    <span> 免费获取。</span>
                  </div>
                </div>
              </>
            )}

            {/* ========== CodeBuddy 配置表单 ========== */}
            {activeTab === "codebuddy" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mini-codebuddy-key">CodeBuddy API Key</Label>
                  <div className="relative">
                    <Input
                      id="mini-codebuddy-key"
                      type={codebuddyShowKey ? "text" : "password"}
                      value={codebuddyConfigured && codebuddyMasked ? makeKeyMask(codebuddyKeyLength) : codebuddyInput}
                      onChange={(e) => {
                        if (codebuddyMasked) {
                          setCodebuddyMasked(false);
                          setCodebuddyInput(e.target.value.replace(/•/g, ""));
                        } else {
                          setCodebuddyInput(e.target.value);
                        }
                        setError("");
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="输入 CodeBuddy API Key"
                      className="pr-10 font-mono text-sm"
                      autoComplete="off"
                      autoFocus={!codebuddyConfigured}
                      onFocus={async () => {
                        if (codebuddyConfigured && codebuddyMasked) {
                          setCodebuddyLoadingKey(true);
                          try {
                            const key = await api.getApiKeyForProvider("codebuddy");
                            setCodebuddyInput(key);
                            setCodebuddyMasked(false);
                            requestAnimationFrame(() => {
                              const input = document.getElementById("mini-codebuddy-key") as HTMLInputElement;
                              if (input) { input.focus(); input.setSelectionRange(key.length, key.length); }
                            });
                          } catch { setError("无法获取 API Key"); }
                          finally { setCodebuddyLoadingKey(false); }
                        }
                      }}
                      onBlur={() => {
                        if (codebuddyConfigured && !codebuddyInput.trim()) setCodebuddyMasked(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleCodebuddyToggleShow}
                      disabled={codebuddyLoadingKey}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground/60 transition-colors disabled:opacity-40"
                    >
                      {codebuddyShowKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-xs text-rose-500">{error}</p>}

                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                  <ExternalLink className="h-4 w-4 text-foreground/45 mt-0.5 shrink-0" />
                  <div className="text-xs text-foreground/65 leading-relaxed">
                    <span>还没有 CodeBuddy API Key？前往 </span>
                    <a
                      href="https://tencent.sso.codebuddy.cn/profile/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        import("@tauri-apps/plugin-shell").then(({ open }) => {
                          open("https://tencent.sso.codebuddy.cn/profile/keys");
                        }).catch(() => {
                          window.open("https://tencent.sso.codebuddy.cn/profile/keys", "_blank");
                        });
                      }}
                    >
                      CodeBuddy 控制台
                    </a>
                    <span>申请。</span>
                  </div>
                </div>

              </>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-2 pt-1">
              {currentConfigured && !saveSuccess && (
                <Button variant="ghost" onClick={handleClear} className="text-foreground/65">清除</Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saveSuccess || codebuddyChecking}
                className={saveSuccess ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""}
              >
                {codebuddyChecking ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />检查连接中</>
                ) : saveSuccess ? (
                  <><Check className="h-4 w-4 mr-1.5" />已保存</>
                ) : currentConfigured ? "保存" : "保存并开始使用"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
