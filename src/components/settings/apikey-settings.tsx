import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApiKey } from "./api-key-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ExternalLink, ShieldCheck, Check, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import * as api from "@/lib/tauri-api";

// 根据真实 Key 长度生成掩码字符串
const makeKeyMask = (len: number) => "•".repeat(len || 24);

export function ApiKeySettings() {
  const { setApiKey, clearApiKey, isConfigured, closeSettings } = useApiKey();
  const { aiProvider, setAiProvider, openaiModel, setOpenaiModel, codebuddyModel, setCodebuddyModel } = useSettings();
  // Gemini: 已配置时默认显示掩码
  const [inputValue, setInputValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);
  const [geminiMasked, setGeminiMasked] = useState(true);
  const [geminiKeyLength, setGeminiKeyLength] = useState(0);

  // OpenAI 兼容 Provider 的状态
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openaiEndpointInput, setOpenaiEndpointInput] = useState("");
  const [openaiModelInput, setOpenaiModelInput] = useState(openaiModel || "");
  const [openaiKeyPreview, setOpenaiKeyPreview] = useState("");
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [openaiShowKey, setOpenaiShowKey] = useState(false);
  const [openaiLoadingKey, setOpenaiLoadingKey] = useState(false);
  const [openaiError, setOpenaiError] = useState("");
  const [openaiSaveSuccess, setOpenaiSaveSuccess] = useState(false);
  const [openaiMasked, setOpenaiMasked] = useState(true);
  const [openaiKeyLength, setOpenaiKeyLength] = useState(0);
  const [openaiModelList, setOpenaiModelList] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem("pp_openai_model_list");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [openaiModelLoading, setOpenaiModelLoading] = useState(false);
  const [openaiModelDropdownOpen, setOpenaiModelDropdownOpen] = useState(false);

  // CodeBuddy Provider 的状态（端点固定在 Rust 端，界面只接收 Key 和模型）
  const [codebuddyKeyInput, setCodebuddyKeyInput] = useState("");
  const [codebuddyModelInput, setCodebuddyModelInput] = useState(codebuddyModel || "");
  const [codebuddyConfigured, setCodebuddyConfigured] = useState(false);
  const [codebuddyShowKey, setCodebuddyShowKey] = useState(false);
  const [codebuddyLoadingKey, setCodebuddyLoadingKey] = useState(false);
  const [codebuddyError, setCodebuddyError] = useState("");
  const [codebuddySaveSuccess, setCodebuddySaveSuccess] = useState(false);
  const [codebuddyMasked, setCodebuddyMasked] = useState(true);
  const [codebuddyKeyLength, setCodebuddyKeyLength] = useState(0);
  const [codebuddyModelList, setCodebuddyModelList] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem("pp_codebuddy_model_list");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [codebuddyModelLoading, setCodebuddyModelLoading] = useState(false);
  const [codebuddyModelDropdownOpen, setCodebuddyModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modelInputRef = useRef<HTMLDivElement>(null);

  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateDropdownPos = useCallback(() => {
    if (modelInputRef.current) {
      const rect = modelInputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.top,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // 初始化 Gemini Key 长度
  useEffect(() => {
    if (isConfigured) {
      api.getApiKey().then(key => {
        if (key) setGeminiKeyLength(key.length);
      }).catch(() => {});
    }
  }, [isConfigured]);

  // 初始化 OpenAI 配置状态
  useEffect(() => {
    const loadOpenaiConfig = async () => {
      try {
        const configured = await api.getApiKeyStatusForProvider("openai_compat");
        setOpenaiConfigured(configured);
        const endpoint = await api.getOpenaiEndpoint();
        if (endpoint) setOpenaiEndpointInput(endpoint);
        if (configured) {
          try {
            const key = await api.getApiKeyForProvider("openai_compat");
            if (key) {
              setOpenaiKeyLength(key.length);
              if (key.length > 4) {
                setOpenaiKeyPreview(key.substring(0, 4) + "••••••••");
              }
            }
          } catch { /* ignore */ }
        }
      } catch {
        // ignore
      }
    };
    loadOpenaiConfig();
  }, []);

  useEffect(() => {
    setCodebuddyModelInput(codebuddyModel || "");
  }, [codebuddyModel]);

  // 初始化 CodeBuddy 配置状态
  useEffect(() => {
    const loadCodebuddyConfig = async () => {
      try {
        const configured = await api.getApiKeyStatusForProvider("codebuddy");
        setCodebuddyConfigured(configured);
        if (configured) {
          try {
            const key = await api.getApiKeyForProvider("codebuddy");
            if (key) setCodebuddyKeyLength(key.length);
          } catch { /* ignore */ }
        }
      } catch {
        // ignore
      }
    };
    loadCodebuddyConfig();
  }, []);

  // 点击下拉框外部时关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inInput = modelDropdownRef.current?.contains(target);
      const inPortal = (e.target as HTMLElement).closest?.('[data-model-dropdown-portal]');
      if (!inInput && !inPortal) {
        setOpenaiModelDropdownOpen(false);
        setCodebuddyModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 下拉框打开时更新位置
  useEffect(() => {
    if (openaiModelDropdownOpen || codebuddyModelDropdownOpen) {
      updateDropdownPos();
      window.addEventListener('resize', updateDropdownPos);
      const scrollParent = modelInputRef.current?.closest('.overflow-y-auto');
      scrollParent?.addEventListener('scroll', updateDropdownPos);
      return () => {
        window.removeEventListener('resize', updateDropdownPos);
        scrollParent?.removeEventListener('scroll', updateDropdownPos);
      };
    }
  }, [openaiModelDropdownOpen, codebuddyModelDropdownOpen, updateDropdownPos]);

  // Gemini Key 显示/隐藏
  const handleToggleShowKey = async () => {
    if (!showKey && isConfigured && geminiMasked) {
      setLoadingKey(true);
      try {
        const key = await api.getApiKey();
        setInputValue(key);
        setGeminiMasked(false);
        setShowKey(true);
      } catch {
        setError("无法获取 API Key");
      } finally {
        setLoadingKey(false);
      }
    } else if (showKey) {
      setInputValue("");
      setGeminiMasked(true);
      setShowKey(false);
    } else {
      setShowKey(!showKey);
    }
  };

  const handleClear = () => {
    clearApiKey();
    setInputValue("");
    setShowKey(false);
    setError("");
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed && isConfigured) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return;
    }
    if (!trimmed) {
      setError("请输入 API Key");
      return;
    }
    if (!trimmed.startsWith("AIza") || trimmed.length < 30) {
      setError("API Key 格式不正确，请检查后重试");
      return;
    }
    const wasConfigured = isConfigured;
    setApiKey(trimmed);
    setInputValue("");
    setGeminiMasked(true);
    setShowKey(false);
    setError("");
    setSaveSuccess(true);

    if (!wasConfigured) {
      setTimeout(() => {
        closeSettings();
        setSaveSuccess(false);
      }, 1200);
    } else {
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  // OpenAI 兼容 Provider 处理函数
  const handleOpenaiToggleShowKey = async () => {
    if (!openaiShowKey && openaiConfigured && openaiMasked) {
      setOpenaiLoadingKey(true);
      try {
        const key = await api.getApiKeyForProvider("openai_compat");
        setOpenaiKeyInput(key);
        setOpenaiMasked(false);
        setOpenaiShowKey(true);
      } catch {
        setOpenaiError("无法获取 API Key");
      } finally {
        setOpenaiLoadingKey(false);
      }
    } else if (openaiShowKey) {
      setOpenaiKeyInput("");
      setOpenaiMasked(true);
      setOpenaiShowKey(false);
    } else {
      setOpenaiShowKey(!openaiShowKey);
    }
  };

  const handleOpenaiSave = async () => {
    const trimmedKey = openaiKeyInput.trim();
    const trimmedEndpoint = openaiEndpointInput.trim();
    const trimmedModel = openaiModelInput.trim();

    if (!trimmedEndpoint) {
      setOpenaiError("请输入 API 端点 URL");
      return;
    }
    if (!trimmedEndpoint.startsWith("http://") && !trimmedEndpoint.startsWith("https://")) {
      setOpenaiError("API 端点 URL 必须以 http:// 或 https:// 开头");
      return;
    }
    if (!trimmedKey && !openaiConfigured) {
      setOpenaiError("请输入 API Key");
      return;
    }

    try {
      if (trimmedKey) {
        await api.setApiKeyForProvider(trimmedKey, "openai_compat");
        if (trimmedKey.length > 4) {
          setOpenaiKeyPreview(trimmedKey.substring(0, 4) + "••••••••");
        }
      }
      await api.saveOpenaiEndpoint(trimmedEndpoint);
      setOpenaiModel(trimmedModel);
      setOpenaiConfigured(true);
      setOpenaiKeyInput("");
      setOpenaiMasked(true);
      setOpenaiShowKey(false);
      setOpenaiError("");
      setOpenaiSaveSuccess(true);
      setTimeout(() => setOpenaiSaveSuccess(false), 2000);
    } catch (err) {
      setOpenaiError(String(err));
    }
  };

  const handleOpenaiClear = async () => {
    try {
      await api.clearApiKeyForProvider("openai_compat");
      await api.saveOpenaiEndpoint("");
      setOpenaiKeyInput("");
      setOpenaiEndpointInput("");
      setOpenaiModelInput("");
      setOpenaiModel("");
      setOpenaiModelList([]);
      try { localStorage.removeItem("pp_openai_model_list"); } catch {}
      setOpenaiKeyPreview("");
      setOpenaiKeyLength(0);
      setOpenaiShowKey(false);
      setOpenaiMasked(true);
      setOpenaiError("");
      setOpenaiConfigured(false);
    } catch {
      // ignore
    }
  };

  const handleOpenaiKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleOpenaiSave();
    }
  };

  // CodeBuddy Provider 处理函数
  const refreshCodebuddyModels = async (): Promise<string[] | null> => {
    setCodebuddyModelLoading(true);
    setCodebuddyError("");
    try {
      const models = await api.fetchCodebuddyModels();
      if (!models || models.length === 0) {
        setCodebuddyModelList([]);
        setCodebuddyError("未获取到 CodeBuddy 模型列表，请稍后重试");
        return null;
      }
      setCodebuddyModelList(models);
      try { localStorage.setItem("pp_codebuddy_model_list", JSON.stringify(models)); } catch {}
      window.dispatchEvent(new CustomEvent("pp_codebuddy_model_list_updated"));
      const currentModel = codebuddyModelInput.trim();
      const defaultModel = models.includes("gpt-5.6-luna")
        ? "gpt-5.6-luna"
        : models.includes("claude-sonnet-5")
          ? "claude-sonnet-5"
          : models[0];
      const shouldUseDefault = !currentModel || !models.includes(currentModel) || currentModel === "claude-sonnet-5";
      const selectedModel = shouldUseDefault ? defaultModel : currentModel;
      if (shouldUseDefault) {
        setCodebuddyModel(defaultModel);
      }
      setCodebuddyModelInput(selectedModel);
      setCodebuddyModelDropdownOpen(false);
      setCodebuddyError("");
      return models;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setCodebuddyError(`获取模型列表失败: ${message}`);
      return null;
    } finally {
      setCodebuddyModelLoading(false);
    }
  };

  const handleCodebuddyToggleShowKey = async () => {
    if (!codebuddyShowKey && codebuddyConfigured && codebuddyMasked) {
      setCodebuddyLoadingKey(true);
      try {
        const key = await api.getApiKeyForProvider("codebuddy");
        setCodebuddyKeyInput(key);
        setCodebuddyMasked(false);
        setCodebuddyShowKey(true);
      } catch {
        setCodebuddyError("无法获取 API Key");
      } finally {
        setCodebuddyLoadingKey(false);
      }
    } else if (codebuddyShowKey) {
      setCodebuddyKeyInput("");
      setCodebuddyMasked(true);
      setCodebuddyShowKey(false);
    } else {
      setCodebuddyShowKey(!codebuddyShowKey);
    }
  };

  const persistCodebuddyKey = async (): Promise<boolean> => {
    const trimmedKey = codebuddyKeyInput.trim();
    if (!trimmedKey) {
      if (!codebuddyConfigured) {
        setCodebuddyError("请输入 API Key");
        return false;
      }
      return true;
    }

    await api.setApiKeyForProvider(trimmedKey, "codebuddy");
    setCodebuddyKeyLength(trimmedKey.length);
    setCodebuddyConfigured(true);
    setCodebuddyKeyInput("");
    setCodebuddyMasked(true);
    setCodebuddyShowKey(false);
    setCodebuddyError("");
    return true;
  };

  const handleCodebuddyFetchModels = async () => {
    try {
      if (!(await persistCodebuddyKey())) return;
      await refreshCodebuddyModels();
    } catch (err: unknown) {
      setCodebuddyError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCodebuddySave = async () => {
    const trimmedModel = codebuddyModelInput.trim();

    try {
      setCodebuddyModelDropdownOpen(false);
      if (!(await persistCodebuddyKey())) return;
      setCodebuddyModel(trimmedModel);
      setCodebuddyError("");

      // 保存后自动获取一次；Key 已成功保存时，模型目录失败不回滚 Key。
      await refreshCodebuddyModels();
      setCodebuddySaveSuccess(true);
      setTimeout(() => setCodebuddySaveSuccess(false), 2000);
    } catch (err: unknown) {
      setCodebuddyError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCodebuddyClear = async () => {
    try {
      await api.clearApiKeyForProvider("codebuddy");
      setCodebuddyKeyInput("");
      setCodebuddyModelInput("");
      setCodebuddyModel("");
      setCodebuddyModelList([]);
      try { localStorage.removeItem("pp_codebuddy_model_list"); } catch {}
      setCodebuddyKeyLength(0);
      setCodebuddyShowKey(false);
      setCodebuddyMasked(true);
      setCodebuddyError("");
      setCodebuddyConfigured(false);
    } catch {
      // ignore
    }
  };

  const handleCodebuddyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCodebuddySave();
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-foreground/60" />
          AI Provider 设置
        </h4>
        <p className="text-sm text-foreground/50 mt-1">
选择 AI 服务提供商并配置对应的 API Key。
          Key 安全存储在本地，不会上传到任何服务器。
        </p>
      </div>

      {/* Provider 选择器 */}
      <div className="mb-6">
        <Label className="text-sm font-medium mb-2 block">AI Provider</Label>
        <div className="flex gap-2">
          <button
            onClick={() => setAiProvider("gemini")}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              aiProvider === "gemini"
                ? "border-primary/80 bg-primary/80 text-white"
                : "border-border bg-background text-foreground/70 hover:bg-muted/50"
            }`}
          >
            Google Gemini
          </button>
          <button
            onClick={() => setAiProvider("openai_compat")}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              aiProvider === "openai_compat"
                ? "border-primary/80 bg-primary/80 text-white"
                : "border-border bg-background text-foreground/70 hover:bg-muted/50"
            }`}
          >
            OpenAI 兼容
          </button>
          <button
            onClick={() => setAiProvider("codebuddy")}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              aiProvider === "codebuddy"
                ? "border-primary/80 bg-primary/80 text-white"
                : "border-border bg-background text-foreground/70 hover:bg-muted/50"
            }`}
          >
            CodeBuddy
          </button>
        </div>
      </div>

      {/* Gemini 配置 */}
      {aiProvider === "gemini" && (
        <div className="space-y-4">
        {isConfigured && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>已配置</span>
            <span className="ml-1 font-mono text-xs text-emerald-500/70">AIza••••••••</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="api-key">Gemini API Key</Label>
          <div className="relative">
            <Input
              id="api-key"
              type={showKey ? "text" : "password"}
              value={isConfigured && geminiMasked ? makeKeyMask(geminiKeyLength) : inputValue}
              onChange={(e) => {
                if (geminiMasked) {
                  setGeminiMasked(false);
                  setInputValue(e.target.value.replace(/•/g, ""));
                } else {
                  setInputValue(e.target.value);
                }
                setError("");
              }}
              onFocus={async (e) => {
                if (isConfigured && geminiMasked) {
                  setLoadingKey(true);
                  try {
                    const key = await api.getApiKey();
                    setInputValue(key);
                    setGeminiMasked(false);
                    requestAnimationFrame(() => {
                      const input = document.getElementById("api-key") as HTMLInputElement;
                      if (input) {
                        input.focus();
                        input.setSelectionRange(key.length, key.length);
                      }
                    });
                  } catch {
                    setError("无法获取 API Key");
                  } finally {
                    setLoadingKey(false);
                  }
                } else {
                  const len = e.target.value.length;
                  requestAnimationFrame(() => {
                    e.target.setSelectionRange(len, len);
                  });
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="AIzaSy..."
              className="pr-10 font-mono text-sm"
              autoComplete="off"
              autoFocus={!isConfigured}
              readOnly={isConfigured && geminiMasked && loadingKey}
            />
            <button
              type="button"
              onClick={handleToggleShowKey}
              disabled={loadingKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground/60 transition-colors disabled:opacity-40"
              title={showKey ? "隐藏" : "显示"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

        <div className="flex items-center justify-end gap-2 pt-2">
          {isConfigured && !saveSuccess && (
            <Button variant="ghost" onClick={handleClear} className="text-foreground/65">清除</Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saveSuccess}
            className={saveSuccess ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""}
          >
            {saveSuccess ? (
              <><Check className="h-4 w-4 mr-1.5" />已保存</>
            ) : isConfigured ? "保存" : "保存并开始使用"}
          </Button>
        </div>
      </div>
      )}

      {/* OpenAI 兼容配置 */}
      {aiProvider === "openai_compat" && (
        <div className="space-y-4">
          {openaiConfigured && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>已配置</span>
              {openaiKeyPreview && (
                <span className="ml-1 font-mono text-xs text-emerald-500/70">{openaiKeyPreview}</span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="openai-endpoint">API 端点 URL</Label>
            <Input
              id="openai-endpoint"
              type="text"
              value={openaiEndpointInput}
              onChange={(e) => { setOpenaiEndpointInput(e.target.value); setOpenaiError(""); }}
              placeholder="https://api.example.com/v1"
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="openai-key">API Key</Label>
            <div className="relative">
              <Input
                id="openai-key"
                type={openaiShowKey ? "text" : "password"}
                value={openaiConfigured && openaiMasked ? makeKeyMask(openaiKeyLength) : openaiKeyInput}
                onChange={(e) => {
                  if (openaiMasked) {
                    setOpenaiMasked(false);
                    setOpenaiKeyInput(e.target.value.replace(/•/g, ""));
                  } else {
                    setOpenaiKeyInput(e.target.value);
                  }
                  setOpenaiError("");
                }}
                onFocus={async (e) => {
                  if (openaiConfigured && openaiMasked) {
                    setOpenaiLoadingKey(true);
                    try {
                      const key = await api.getApiKeyForProvider("openai_compat");
                      setOpenaiKeyInput(key);
                      setOpenaiMasked(false);
                      requestAnimationFrame(() => {
                        const input = document.getElementById("openai-key") as HTMLInputElement;
                        if (input) { input.focus(); input.setSelectionRange(key.length, key.length); }
                      });
                    } catch {
                      setOpenaiError("无法获取 API Key");
                    } finally {
                      setOpenaiLoadingKey(false);
                    }
                  } else {
                    const len = e.target.value.length;
                    requestAnimationFrame(() => { e.target.setSelectionRange(len, len); });
                  }
                }}
                onKeyDown={handleOpenaiKeyDown}
                placeholder="sk-..."
                className="pr-10 font-mono text-sm"
                autoComplete="off"
                readOnly={openaiConfigured && openaiMasked && openaiLoadingKey}
              />
              <button
                type="button"
                onClick={handleOpenaiToggleShowKey}
                disabled={openaiLoadingKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground/60 transition-colors disabled:opacity-40"
                title={openaiShowKey ? "隐藏" : "显示"}
              >
                {openaiShowKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openai-model">模型选择</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1" ref={(el) => { (modelDropdownRef as React.MutableRefObject<HTMLDivElement | null>).current = el; (modelInputRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}>
                <div className="relative">
                  <Input
                    id="openai-model"
                    type="text"
                    value={openaiModelInput}
                    onChange={(e) => {
                      setOpenaiModelInput(e.target.value);
                      setOpenaiError("");
                      if (openaiModelList.length > 0) setOpenaiModelDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (openaiModelList.length > 0) {
                        setOpenaiModelDropdownOpen(true);
                        setOpenaiModelInput("");
                      }
                    }}
                    onKeyDown={handleOpenaiKeyDown}
                    placeholder="输入模型名称或从列表选择模型"
                    className="pr-8"
                    autoComplete="off"
                  />
                  {openaiModelList.length > 0 && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                      onClick={() => {
                        const willOpen = !openaiModelDropdownOpen;
                        setOpenaiModelDropdownOpen(willOpen);
                        if (willOpen) setOpenaiModelInput("");
                      }}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${openaiModelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                {openaiModelDropdownOpen && openaiModelList.length > 0 && dropdownPos && createPortal(
                  <div
                    data-model-dropdown-portal
                    className="fixed z-[9999] overflow-hidden rounded-md border bg-background shadow-lg"
                    style={{
                      left: dropdownPos.left,
                      width: dropdownPos.width,
                      bottom: window.innerHeight - dropdownPos.top + 4,
                      maxHeight: Math.min(dropdownPos.top - 20, 400),
                    }}
                  >
                  <div className="overflow-y-auto" style={{ maxHeight: Math.min(dropdownPos.top - 20, 400) }}>
                    {openaiModelList
                      .filter(m => !openaiModelInput || m.toLowerCase().includes(openaiModelInput.toLowerCase()))
                      .map((model) => (
                        <button
                          key={model}
                          type="button"
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors ${
                            openaiModelInput === model ? 'bg-accent text-accent-foreground' : 'text-foreground/80'
                          }`}
                          onClick={() => {
                            setOpenaiModelInput(model);
                            setOpenaiModelDropdownOpen(false);
                            setOpenaiError("");
                          }}
                        >
                          {model}
                        </button>
                      ))}
                    {openaiModelList.filter(m => !openaiModelInput || m.toLowerCase().includes(openaiModelInput.toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-xs text-foreground/45">无匹配模型，可直接手动输入</div>
                    )}
                  </div>
                  </div>,
                  document.body
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs shrink-0"
                disabled={openaiModelLoading || (!openaiEndpointInput.trim() && !openaiConfigured)}
                onClick={async () => {
                  setOpenaiModelLoading(true);
                  setOpenaiError("");
                  try {
                    const endpoint = openaiEndpointInput.trim() || await api.getOpenaiEndpoint();
                    let key = openaiKeyInput.trim();
                    if (!key || key === makeKeyMask(openaiKeyLength)) {
                      try {
                        key = await api.getApiKeyForProvider("openai_compat");
                      } catch (keyErr) {
                        setOpenaiError(`获取已保存的 API Key 失败: ${String(keyErr)}`);
                        return;
                      }
                    }
                    if (!endpoint) { setOpenaiError("请先填写 API 端点 URL"); return; }
                    if (!key) { setOpenaiError("请先配置 API Key"); return; }
                    let models: string[];
                    try {
                      models = await api.fetchOpenaiModels(endpoint, key);
                    } catch (fetchErr: unknown) {
                      const fetchErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
                      console.error("[获取模型列表] fetchOpenaiModels 异常:", fetchErr);
                      setOpenaiError(`获取模型列表失败: ${fetchErrMsg}`);
                      return;
                    }
                    if (models && models.length > 0) {
                      setOpenaiModelList(models);
                      try { localStorage.setItem("pp_openai_model_list", JSON.stringify(models)); } catch {}
                      window.dispatchEvent(new CustomEvent("pp_openai_model_list_updated"));
                      setOpenaiModelInput("");
                      setOpenaiModelDropdownOpen(true);
                      setOpenaiError("");
                    } else {
                      setOpenaiModelList([]);
                      setOpenaiError(`未获取到模型列表（返回: ${JSON.stringify(models)}），该端点可能不支持 /v1/models 接口，请手动输入模型`);
                    }
                  } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    console.error("[获取模型列表] 外层异常:", err);
                    setOpenaiError(`获取模型列表失败: ${errMsg}`);
                  } finally {
                    setOpenaiModelLoading(false);
                  }
                }}
              >
                {openaiModelLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                获取模型列表
              </Button>
            </div>
          </div>

          {openaiError && <p className="text-xs text-rose-500">{openaiError}</p>}

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <ExternalLink className="h-4 w-4 text-foreground/45 mt-0.5 shrink-0" />
            <div className="text-xs text-foreground/65 leading-relaxed">
              <span>支持任何 OpenAI 兼容的 API（GPT、Claude、GLM、Kimi、DeepSeek、MiniMax、千问、混元等）</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {openaiConfigured && !openaiSaveSuccess && (
              <Button variant="ghost" onClick={handleOpenaiClear} className="text-foreground/65">清除</Button>
            )}
            <Button
              onClick={handleOpenaiSave}
              disabled={openaiSaveSuccess}
              className={openaiSaveSuccess ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""}
            >
              {openaiSaveSuccess ? (
                <><Check className="h-4 w-4 mr-1.5" />已保存</>
              ) : openaiConfigured ? "保存" : "保存并开始使用"}
            </Button>
          </div>
        </div>
      )}

      {/* CodeBuddy 配置：用户只需要填写 Key，端点由 Rust 端固定管理 */}
      {aiProvider === "codebuddy" && (
        <div className="space-y-4">
          {codebuddyConfigured && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>已配置</span>
              <span className="ml-1 font-mono text-xs text-emerald-500/70">CodeBuddy Key</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="codebuddy-key">CodeBuddy API Key</Label>
            <div className="relative">
              <Input
                id="codebuddy-key"
                type={codebuddyShowKey ? "text" : "password"}
                value={codebuddyConfigured && codebuddyMasked ? makeKeyMask(codebuddyKeyLength) : codebuddyKeyInput}
                onChange={(e) => {
                  if (codebuddyMasked) {
                    setCodebuddyMasked(false);
                    setCodebuddyKeyInput(e.target.value.replace(/•/g, ""));
                  } else {
                    setCodebuddyKeyInput(e.target.value);
                  }
                  setCodebuddyError("");
                }}
                onFocus={async (e) => {
                  if (codebuddyConfigured && codebuddyMasked) {
                    setCodebuddyLoadingKey(true);
                    try {
                      const key = await api.getApiKeyForProvider("codebuddy");
                      setCodebuddyKeyInput(key);
                      setCodebuddyMasked(false);
                      requestAnimationFrame(() => {
                        const input = document.getElementById("codebuddy-key") as HTMLInputElement;
                        if (input) { input.focus(); input.setSelectionRange(key.length, key.length); }
                      });
                    } catch {
                      setCodebuddyError("无法获取 API Key");
                    } finally {
                      setCodebuddyLoadingKey(false);
                    }
                  } else {
                    const len = e.target.value.length;
                    requestAnimationFrame(() => { e.target.setSelectionRange(len, len); });
                  }
                }}
                onKeyDown={handleCodebuddyKeyDown}
                placeholder="输入 CodeBuddy API Key"
                className="pr-10 font-mono text-sm"
                autoComplete="off"
                readOnly={codebuddyConfigured && codebuddyMasked && codebuddyLoadingKey}
              />
              <button
                type="button"
                onClick={handleCodebuddyToggleShowKey}
                disabled={codebuddyLoadingKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground/60 transition-colors disabled:opacity-40"
                title={codebuddyShowKey ? "隐藏" : "显示"}
              >
                {codebuddyShowKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

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
              <span>申请 Key。</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="codebuddy-model">模型选择</Label>
            <div className="flex items-center gap-2">
              <div
                className="relative flex-1"
                ref={(el) => {
                  (modelDropdownRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                  (modelInputRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                }}
              >
                <div className="relative">
                  <Input
                    id="codebuddy-model"
                    type="text"
                    value={codebuddyModelInput}
                    onChange={(e) => {
                      setCodebuddyModelInput(e.target.value);
                      setCodebuddyModelDropdownOpen(codebuddyModelList.length > 0);
                      setCodebuddyError("");
                    }}
                    onFocus={() => {
                      if (codebuddyModelList.length > 0) {
                        setCodebuddyModelDropdownOpen(true);
                        setCodebuddyModelInput("");
                      }
                    }}
                    onKeyDown={handleCodebuddyKeyDown}
                    placeholder="输入模型名称或从列表选择模型"
                    className="pr-8"
                    autoComplete="off"
                  />
                  {codebuddyModelList.length > 0 && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                      onClick={() => {
                        const willOpen = !codebuddyModelDropdownOpen;
                        setCodebuddyModelDropdownOpen(willOpen);
                        if (willOpen) setCodebuddyModelInput("");
                      }}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${codebuddyModelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                {codebuddyModelDropdownOpen && codebuddyModelList.length > 0 && dropdownPos && createPortal(
                  <div
                    data-model-dropdown-portal
                    className="fixed z-[9999] overflow-hidden rounded-md border bg-background shadow-lg"
                    style={{
                      left: dropdownPos.left,
                      width: dropdownPos.width,
                      bottom: window.innerHeight - dropdownPos.top + 4,
                      maxHeight: Math.min(dropdownPos.top - 20, 400),
                    }}
                  >
                    <div className="overflow-y-auto" style={{ maxHeight: Math.min(dropdownPos.top - 20, 400) }}>
                      {codebuddyModelList
                        .filter(m => !codebuddyModelInput || m.toLowerCase().includes(codebuddyModelInput.toLowerCase()))
                        .map((model) => (
                          <button
                            key={model}
                            type="button"
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors ${
                              codebuddyModelInput === model ? 'bg-accent text-accent-foreground' : 'text-foreground/80'
                            }`}
                            onClick={() => {
                              setCodebuddyModelInput(model);
                              setCodebuddyModelDropdownOpen(false);
                              setCodebuddyError("");
                            }}
                          >
                            {model}
                          </button>
                        ))}
                      {codebuddyModelList.filter(m => !codebuddyModelInput || m.toLowerCase().includes(codebuddyModelInput.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-xs text-foreground/45">无匹配模型，可直接手动输入</div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs shrink-0"
                disabled={codebuddyModelLoading || codebuddyLoadingKey || (!codebuddyConfigured && !codebuddyKeyInput.trim())}
                onClick={() => { void handleCodebuddyFetchModels(); }}
              >
                {codebuddyModelLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                获取模型列表
              </Button>
            </div>
          </div>

          {codebuddyError && <p className="text-xs text-rose-500">{codebuddyError}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            {codebuddyConfigured && !codebuddySaveSuccess && (
              <Button variant="ghost" onClick={handleCodebuddyClear} className="text-foreground/65">清除</Button>
            )}
            <Button
              onClick={handleCodebuddySave}
              disabled={codebuddySaveSuccess || codebuddyModelLoading}
              className={codebuddySaveSuccess ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""}
            >
              {codebuddySaveSuccess ? (
                <><Check className="h-4 w-4 mr-1.5" />已保存</>
              ) : codebuddyConfigured ? "保存" : "保存并开始使用"}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
