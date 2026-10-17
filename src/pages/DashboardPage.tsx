import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as api from "@/lib/tauri-api";
import type { Prompt } from "@/lib/tauri-api";
import { cn, markdownToPlainText, parseUTCDate } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import { getVersion } from "@tauri-apps/api/app";
import { pushWordCloudLog } from "@/components/debug/debug-store";
import { getCurrentAiProviderConfig } from "@/lib/settings-reader";

// ====== 游戏行业 + AI 相关英文词汇 200 词（用于混合补齐） ======
const SUPPLEMENT_WORDS = [
  // ── 游戏核心机制 ──
  "Dungeon", "Loot", "Spawn", "Cooldown", "Buff", "Nerf",
  "Quest", "Respawn", "Checkpoint", "Waypoint", "Trigger", "Portal",
  "Boss", "Combo", "Crit", "Aggro", "Mana", "Stealth",
  "Dodge", "Parry", "Stagger", "Heal", "Revive", "Summon",
  // ── 图形 / 渲染 ──
  "Shader", "Render", "Voxel", "Skybox", "Terrain", "Particle",
  "Bloom", "Shadow", "Ambient", "Occlusion", "Reflection", "Refract",
  "Texture", "Normal", "Albedo", "Emissive", "Metallic", "Roughness",
  "Deferred", "Forward", "Rasterize", "Raytrace", "Denoise", "Upscale",
  // ── 物理 / 碰撞 / 寻路 ──
  "Hitbox", "Ragdoll", "Collider", "Raycast", "Navmesh", "Rigidbody",
  "Gravity", "Friction", "Impulse", "Torque", "Kinematic", "Softbody",
  // ── 多人 / 网络 ──
  "Multiplayer", "Netcode", "Rollback", "Lobby", "Matchmake", "Sync",
  "Latency", "Tick", "Replicate", "Shard", "Relay", "Dedicate",
  // ── 游戏类型 / 文化 ──
  "Roguelike", "Sandbox", "Gacha", "Metaverse", "Esports", "Speedrun",
  "Soulslike", "Openworld", "Survival", "Tycoon", "Deckbuild", "Autobattle",
  "Indie", "Retro", "Pixel", "Lowpoly", "Isometric", "Topdown",
  // ── 游戏系统 ──
  "Inventory", "Crafting", "Guild", "Raid", "Arena", "Leaderboard",
  "Auction", "Enchant", "Socket", "Upgrade", "Prestige", "Season",
  "Dialogue", "Cutscene", "Cinematic", "Emote", "Mount", "Cosmetic",
  "Minimap", "Compass", "Fog", "Waymark", "Ping", "Marker",
  // ── 游戏引擎 / 工具 ──
  "Blueprint", "Prefab", "Tilemap", "Sprite", "Spline", "Decal",
  "LOD", "Culling", "Batching", "Instancing", "Streaming", "Async",
  "Profiler", "Debugger", "Console", "Hotfix", "Patch", "Modding",
  // ── AI 核心 ──
  "Neural", "Inference", "Token", "Embedding", "Attention", "Transformer",
  "Gradient", "Backprop", "Dropout", "Softmax", "Sigmoid", "Relu",
  "Encoder", "Decoder", "Latent", "Vector", "Tensor", "Scalar",
  // ── AI 应用 / 生成 ──
  "Prompt", "Agent", "Diffusion", "Finetune", "Reinforce", "Evolve",
  "Hallucinate", "Grounding", "Retrieval", "Augment", "Chain", "Reason",
  "Multimodal", "Vision", "Speech", "Whisper", "Segment", "Detect",
  // ── AI × 游戏交叉 ──
  "Procedural", "Pathfind", "Behavior", "Swarm", "Simulate", "Emerge",
  "Heuristic", "Minimax", "Montecarlo", "Bandit", "Reward", "Policy",
  "Imitate", "Curriculum", "Selfplay", "Coevolution", "Novelty", "Fitness",
  "Narrative", "Adaptive", "Dynamic", "Personalize", "Recommend", "Balance",
];

// ====== AI 翻译缓存 Key 和有效期 ======
const AI_WORDS_CACHE_KEY = "pp_dashboard_ai_words_v2";
const AI_WORDS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时

interface AiWordsCacheData {
  words: string[];
  timestamp: number;
  promptHash: string; // 用于检测提示词内容是否变化
}

// 简单哈希：用于检测提示词内容是否变化，变化则重新翻译
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// 从缓存读取 AI 翻译结果
function loadAiWordsCache(currentHash: string): string[] | null {
  try {
    const raw = localStorage.getItem(AI_WORDS_CACHE_KEY);
    if (!raw) return null;
    const data: AiWordsCacheData = JSON.parse(raw);
    // 检查是否过期 或 提示词内容已变化
    if (Date.now() - data.timestamp > AI_WORDS_CACHE_TTL) return null;
    if (data.promptHash !== currentHash) return null;
    return data.words;
  } catch {
    return null;
  }
}

// 保存 AI 翻译结果到缓存
function saveAiWordsCache(words: string[], promptHash: string): void {
  try {
    const data: AiWordsCacheData = { words, timestamp: Date.now(), promptHash };
    localStorage.setItem(AI_WORDS_CACHE_KEY, JSON.stringify(data));
  } catch { /* 忽略存储失败 */ }
}

// 调用 AI 从中文提示词中提取关键词并翻译为英文单词
async function translateKeywordsWithAI(chineseText: string): Promise<string[]> {
  // 截取前 2000 字符，避免 token 过多
  const truncated = chineseText.slice(0, 2000);
  const promptText = `你是一个关键词提取和翻译专家。请从以下中文文本中提取 40-60 个有代表性的关键词/概念，并将每个翻译为一个英文单词（首字母大写）。

要求：
1. 提取的词要有多样性，覆盖文本的不同主题
2. 每个英文词只保留一个单词（不要短语）
3. 直接返回英文单词列表，用英文逗号分隔
4. 不要返回任何解释，只返回逗号分隔的英文单词

文本内容：
${truncated}`;

  const startTime = performance.now();

  // 读取当前 AI Provider 设置
  const { provider: currentProvider, openaiModel: currentOpenaiModel, codebuddyModel: currentCodebuddyModel, geminiModel: currentGeminiModel } = getCurrentAiProviderConfig();

  const result = await api.optimizePrompt({
    rawRequirement: promptText,
    mode: "raw",
    language: "English",
    outputFormat: "plain_text",
    skipLog: true,
    provider: currentProvider,
    openaiModel: currentProvider === "openai_compat" ? currentOpenaiModel : undefined,
    codebuddyModel: currentProvider === "codebuddy" ? currentCodebuddyModel : undefined,
    geminiModel: currentProvider === "gemini" && currentGeminiModel ? currentGeminiModel : undefined,
  });

  // 解析 AI 返回的逗号分隔单词列表
  const raw = result.optimized_prompt || "";
  const words = raw
    .split(/[,，\n]+/)
    .flatMap((segment) => {
      // 每个片段可能包含多个空格分隔的词，先按空格拆分
      const trimmed = segment.trim();
      return trimmed.includes(" ") ? trimmed.split(/\s+/) : [trimmed];
    })
    .map((w) => w.trim().replace(/[^a-zA-Z]/g, ""))
    .filter((w) => w.length >= 3 && w.length <= 18) // 过滤掉超长连词
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const uniqueWords = [...new Set(words)];

  // 推送词云提取日志到 Debug 面板
  pushWordCloudLog({
    prompt: promptText,
    inputLength: truncated.length,
    rawOutput: raw,
    extractedWords: uniqueWords,
    duration: Math.round(performance.now() - startTime),
    status: "success",
  });

  return uniqueWords;
}

// 同步提取：从提示词中提取英文单词（基础能力，不依赖 AI）
function extractEnglishWords(prompts: Prompt[]): string[] {
  const allText = prompts
    .map((p) => markdownToPlainText(p.content) + " " + p.title)
    .join(" ");

  // 排除 AI 指令中常见的词（这些是 translateKeywordsWithAI 的 prompt 指令残留）
  const instructionWords = new Set([
    "you", "are", "expert", "keyword", "extraction", "translation",
    "analyze", "provided", "text", "each", "item", "must", "single",
    "english", "separated", "commas", "ensure", "thematic", "diversity",
    "covering", "return", "explanation", "extra", "insert", "here",
    "following", "requirements", "directly", "list", "without", "any",
    "from", "the", "and", "for", "with", "that", "this", "not",
    "about", "only", "word", "words", "below", "above", "please",
    "just", "don", "should", "would", "could", "will", "have",
  ]);

  return allText
    .match(/[a-zA-Z]{3,}/g)
    ?.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .filter((w) => w.length <= 18 && !instructionWords.has(w.toLowerCase())) || [];
}

// 混合补齐：用户词 + 补充词，凑够 80 个
function mergeAndFill(userWords: string[]): string[] {
  const unique = [...new Set(userWords)];
  if (unique.length >= 80) return unique.slice(0, 80);

  const userSet = new Set(unique.map((w) => w.toLowerCase()));
  const filler = SUPPLEMENT_WORDS.filter((w) => !userSet.has(w.toLowerCase()));
  return [...unique, ...filler].slice(0, 80);
}

// ====== 全屏文字云组件（超大文字，沉浸式） ======
function ImmersiveWordCloud({ words }: { words: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  // 缓存元素位置，避免每帧 60 次 getBoundingClientRect()
  const positionsCacheRef = useRef<{ cx: number; cy: number }[]>([]);
  const cacheValidRef = useRef(false);

  // 检测暗色模式：监听 <html> 上的 .dark 类变化
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // 为每个词生成稳定的随机属性 — 超大字号，像参考图那样
  const wordItems = useMemo(() => {
    const sizes = [24, 28, 32, 36, 42, 48, 56, 64, 72, 84, 100];
    const weights = [300, 400, 500, 600, 700, 800];
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    const items: { text: string; size: number; weight: number; opacity: number }[] = [];
    // 生成足够多的词来铺满大面积
    for (let i = 0; i < 60; i++) {
      const word = shuffled[i % shuffled.length];
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      const weight = weights[Math.floor(Math.random() * weights.length)];
      const opacity = 0.04 + Math.random() * 0.08;
      items.push({ text: word, size, weight, opacity });
    }
    // 词项变化时使位置缓存失效
    cacheValidRef.current = false;
    return items;
  }, [words]);

  // 在 layout 完成后缓存所有元素的中心位置
  const updatePositionsCache = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const wrapperEl = container.children[0];
    if (!wrapperEl) return;
    const containerRect = container.getBoundingClientRect();
    const positions: { cx: number; cy: number }[] = [];
    for (let i = 0; i < wrapperEl.children.length; i++) {
      const el = wrapperEl.children[i] as HTMLElement;
      const rect = el.getBoundingClientRect();
      positions.push({
        cx: rect.left - containerRect.left + rect.width / 2,
        cy: rect.top - containerRect.top + rect.height / 2,
      });
    }
    positionsCacheRef.current = positions;
    cacheValidRef.current = true;
  }, []);

  // 初始化和窗口 resize 时更新缓存
  useEffect(() => {
    // 等待一帧让 layout 完成
    const raf = requestAnimationFrame(() => updatePositionsCache());
    const handleResize = () => {
      cacheValidRef.current = false;
      requestAnimationFrame(() => updatePositionsCache());
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, [wordItems, updatePositionsCache]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      // 首次鼠标移入时确保缓存有效
      if (!cacheValidRef.current) updatePositionsCache();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [updatePositionsCache]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none cursor-default"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex flex-wrap content-start items-baseline gap-x-3 gap-y-0 p-6 pb-24 leading-[0.95]">
        {wordItems.map((item, i) => {
          let highlight = 0;
          if (mousePos && positionsCacheRef.current[i]) {
            const cached = positionsCacheRef.current[i];
            const dist = Math.sqrt((mousePos.x - cached.cx) ** 2 + (mousePos.y - cached.cy) ** 2);
            const radius = 150;
            highlight = Math.max(0, 1 - dist / radius);
          }

          const finalOpacity = item.opacity + highlight * (0.75 - item.opacity);
          const color = highlight > 0.05
            ? isDark
              ? `oklch(0.65 ${0.03 + highlight * 0.18} 270 / ${finalOpacity})`
              : `oklch(0.55 ${0.03 + highlight * 0.17} 270 / ${finalOpacity})`
            : undefined;

          return (
            <span
              key={i}
              className="inline-block whitespace-nowrap transition-all duration-300 ease-out text-foreground"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: item.size,
                fontWeight: item.weight,
                opacity: finalOpacity,
                color,
                transform: highlight > 0.2 ? `scale(${1 + highlight * 0.05})` : undefined,
                lineHeight: 1,
              }}
            >
              {item.text}
            </span>
          );
        })}
      </div>
      {/* 底部渐隐遮罩，防止文字被硬切 */}
      {/* 亮色用白色实色，暗色用与 main bg-card 视觉等效的不透明色（--card 带透明度无法遮住文字） */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 140 }}
      >
        <div className="w-full h-full dark:hidden" style={{ background: "linear-gradient(to top, white 0%, white 15%, transparent 100%)" }} />
        <div className="w-full h-full hidden dark:block" style={{ background: "linear-gradient(to top, oklch(0.28 0.007 270) 0%, oklch(0.28 0.007 270) 15%, transparent 100%)" }} />
      </div>
    </div>
  );
}

// ====== 统计行组件 ======
function StatRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 leading-relaxed">
      <span className="text-foreground/30 font-medium min-w-[60px] uppercase tracking-[2px] text-[9px]" style={{ fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif" }}>
        {label}
      </span>
      <span className="text-primary/20 text-[10px]">›</span>
      <span
        className={cn(
          "uppercase tracking-[1px] text-[10px]",
          highlight ? "text-primary font-bold" : "text-foreground/50 font-semibold"
        )}
        style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}
      >
        {value}
      </span>
    </div>
  );
}

// ====== 统计数据接口 ======
interface TicketStats {
  todayOptimizations: number;
  totalOptimizations: number;
  totalPrompts: number;
  totalFavorites: number;
  totalTokens: number;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const isFirstMount = useRef(true);
  const { wordCloudMode, aiProvider, openaiModel, codebuddyModel, geminiModel } = useSettings();

  // 格式化模型显示名：大写 + 特殊处理
  const displayModelName = (() => {
    let name: string;
    if (aiProvider === "openai_compat" && openaiModel) {
      name = openaiModel;
    } else if (aiProvider === "codebuddy" && codebuddyModel) {
      name = codebuddyModel;
    } else if (aiProvider === "gemini" && geminiModel) {
      name = geminiModel;
    } else {
      name = "gemini-3.1-flash-lite-preview";
    }
    // 特殊处理：gemini-3.1-flash-lite-preview 去掉 -preview 后缀
    if (name.toLowerCase() === "gemini-3.1-flash-lite-preview") {
      name = "gemini-3.1-flash-lite";
    }
    return name.toUpperCase();
  })();

  // 票据卡片统计数据
  const [ticketStats, setTicketStats] = useState<TicketStats>({
    todayOptimizations: 0,
    totalOptimizations: 0,
    totalPrompts: 0,
    totalFavorites: 0,
    totalTokens: 0,
  });
  const [_appVersion, setAppVersion] = useState<string>("...");
  const [allPromptsForWords, setAllPromptsForWords] = useState<Prompt[]>([]);
  const [aiTranslatedWords, setAiTranslatedWords] = useState<string[]>([]);

  // 条码线数据
  const barcodeWidths = useRef(
    Array.from({ length: 50 }, () => ({
      w: Math.random() > 0.6 ? Math.random() * 3 + 2 : Math.random() * 1.5 + 0.5,
      o: 0.3 + Math.random() * 0.7,
    }))
  );

  // 获取应用版本号
  useEffect(() => {
    getVersion().then((v) => setAppVersion(v)).catch(() => setAppVersion("0.0.0"));
  }, []);



  // 加载数据
  const fetchData = useCallback(async () => {
    try {
      const [statsResult, logsResult, allPromptsResult] = await Promise.all([
        api.getStats(),
        api.getOptimizationLogs(100),
        api.getPrompts({ pageSize: 50 }),
      ]);

      // 计算今日优化次数
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const todayCount = logsResult.filter(
        (log) => {
          if (log.status !== "success") return false;
          const localDate = parseUTCDate(log.created_at);
          const localStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
          return localStr === todayStr;
        }
      ).length;

      // 汇总所有 token 消耗
      const totalTokens = logsResult.reduce((sum, log) => {
        return sum + (log.token_in ?? 0) + (log.token_out ?? 0);
      }, 0);

      setTicketStats({
        todayOptimizations: todayCount,
        totalOptimizations: statsResult.total_optimizations,
        totalPrompts: statsResult.total_prompts,
        totalFavorites: statsResult.total_favorites,
        totalTokens,
      });

      setAllPromptsForWords(allPromptsResult.items || []);
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFirstMount.current) return;
    isFirstMount.current = false;
    fetchData();
  }, [fetchData]);

  // 监听数据变更
  useEffect(() => {
    const handleUpdate = () => fetchData();
    window.addEventListener("prompts-updated", handleUpdate);
    window.addEventListener("optimization-completed", handleUpdate);
    return () => {
      window.removeEventListener("prompts-updated", handleUpdate);
      window.removeEventListener("optimization-completed", handleUpdate);
    };
  }, [fetchData]);

  // AI 翻译中文关键词（异步，带缓存）—— 仅在非 preset-only 模式下触发
  useEffect(() => {
    if (wordCloudMode === "preset-only") return;
    if (allPromptsForWords.length === 0) return;

    const allText = allPromptsForWords
      .map((p) => markdownToPlainText(p.content) + " " + p.title)
      .join(" ");

    // 检测是否有足够的中文内容值得翻译
    const chineseChars = allText.match(/[\u4e00-\u9fff]/g);
    if (!chineseChars || chineseChars.length < 20) return; // 中文太少，不调用 AI

    const hash = simpleHash(allText);

    // 优先读缓存
    const cached = loadAiWordsCache(hash);
    if (cached) {
      setAiTranslatedWords(cached);
      return;
    }

    // 异步调用 AI 翻译
    let cancelled = false;
    translateKeywordsWithAI(allText)
      .then((words) => {
        if (!cancelled && words.length >= 5) {
          setAiTranslatedWords(words);
          saveAiWordsCache(words, hash);
        }
      })
      .catch((err) => {
        console.warn("AI 词云翻译失败，使用降级方案:", err);
        pushWordCloudLog({
          prompt: `你是一个关键词提取和翻译专家...（输入 ${allText.slice(0, 2000).length} 字符）`,
          inputLength: allText.slice(0, 2000).length,
          rawOutput: "",
          extractedWords: [],
          duration: 0,
          status: "error",
          error: String(err),
        });
      });

    return () => { cancelled = true; };
  }, [allPromptsForWords, wordCloudMode]);

  // 提取文字云词汇：根据设置模式决定数据来源
  const cloudWords = useMemo(() => {
    // 模式 1：仅预设词汇
    if (wordCloudMode === "preset-only") {
      return SUPPLEMENT_WORDS;
    }

    const enWords = extractEnglishWords(allPromptsForWords);
    const combined = [...aiTranslatedWords, ...enWords];

    // 模式 2：仅我的提示词（不混入预设词，但如果用户词太少则显示提示）
    if (wordCloudMode === "user-only") {
      const unique = [...new Set(combined)];
      // 如果用户词太少，至少返回有的，不补预设词
      return unique.length > 0 ? unique.slice(0, 80) : SUPPLEMENT_WORDS;
    }

    // 模式 3：智能混合（默认）
    return mergeAndFill(combined);
  }, [allPromptsForWords, aiTranslatedWords, wordCloudMode]);

  // 加载中 — 空白占位
  if (loading) {
    return <div className="flex h-full" style={{ minHeight: "200px" }} />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ====== 左侧: 品牌 + 统计信息 ====== */}
      <div className="shrink-0 flex flex-col justify-between py-8 px-8" style={{ width: 280 }}>
      {/* 品牌名 */}
        <div>
          <div className="text-[20px] font-bold tracking-[6px] uppercase text-foreground/65 leading-tight" style={{ fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif" }}>
            PROMPT
          </div>
          <div className="text-[20px] font-bold tracking-[6px] uppercase text-foreground/65 leading-tight mt-0.5" style={{ fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif" }}>
            PILOT
          </div>
        </div>

        {/* 统计信息 */}
        <div className="space-y-2">
          <StatRow label="TODAY" value={`${ticketStats.todayOptimizations} OPTIMIZED`} />
          <StatRow label="TOTAL" value={`${ticketStats.totalOptimizations} OPTIMIZED`} />
          <StatRow label="PROMPTS" value={String(ticketStats.totalPrompts)} />
          <StatRow label="STARS" value={String(ticketStats.totalFavorites)} />
          <StatRow label="TOKENS" value={ticketStats.totalTokens >= 1000 ? `${(ticketStats.totalTokens / 1000).toFixed(1)}K USED` : `${ticketStats.totalTokens} USED`} />
        </div>

        {/* 底部: 条码 + ID */}
        <div>
          {/* 条码线 */}
          <div className="flex items-center gap-[2px] h-2 overflow-hidden">
            {barcodeWidths.current.map((bar, i) => (
              <span
                key={i}
                className="block h-full rounded-[1px] bg-foreground/8"
                style={{ width: bar.w, opacity: bar.o }}
              />
            ))}
          </div>
          <div className="text-[9px] text-foreground/20 tracking-[1px] mt-2" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
            MODEL:{displayModelName}
          </div>
        </div>
      </div>

      {/* ====== 右侧: 沉浸式文字云 ====== */}
      <div className="flex-1 h-full overflow-hidden">
        <ImmersiveWordCloud words={cloudWords} />
      </div>
    </div>
  );
}
