// System Prompts — 5种优化模式的提示词
// 从原 TypeScript 版本精准迁移

use super::types::OptimizeMode;

const BASE_SYSTEM_PROMPT: &str = r#"你是一名专业的提示词工程师。
你的任务是将用户较粗糙、自然语言化的需求，转换为清晰、可执行、实用的高质量提示词。

规则：
1. 保留用户原始意图。
2. 让提示词更具体、更清晰、更易用。
3. 仅在有帮助时补充角色、目标、输出格式、约束条件和风格要求。
4. 不要为简单需求过度复杂化。
5. 输出格式要求（必须严格遵守）：
   - 先简要说明你的优化思路（2-3句话即可，不要太长）。
   - 然后在单独一行写上 ---PROMPT--- 作为分隔标记。
   - 分隔标记之后的内容是用户会直接复制使用的最终提示词，不要再有任何其他内容。
   - 最终提示词必须是一个完整的、可以直接发给AI使用的提示词。
   - 禁止在最终提示词末尾附加"输出要求"、"输出格式"、"注意事项"等元指令段落。如果提示词本身需要规定AI的输出格式，应自然融入提示词正文中，而不是作为独立段落附加。
   - 不要在最终提示词中包含任何分析、解释或说明性文字。
6. 禁止在输出中包含、引用或渲染用户上传的参考图片（不要输出图片URL、不要用Markdown图片语法、不要以任何形式回显图片链接）。参考图片仅供你理解需求，不应出现在你的任何输出中。"#;

/// 获取模式专属指令
fn get_mode_instruction(mode: OptimizeMode) -> &'static str {
    match mode {
        OptimizeMode::Standard => r#"优化模式：标准优化
在保留原始意图的基础上，从以下维度优化提示词：
- 明确目标和预期输出
- 补充必要的上下文和约束
- 改善措辞清晰度"#,

        OptimizeMode::Professional => r#"优化模式：专业优化
以专业级标准优化提示词：
- 明确定义角色和专业背景
- 提供详细的输出格式要求
- 添加质量标准和评估维度
- 添加成功标准和约束条件
- 使用精确、专业的措辞"#,

        OptimizeMode::Concise => r#"优化模式：精简优化
以最少的文字传达最大的信息量：
- 去除冗余表述
- 使用简洁直接的指令
- 保留核心需求，去除非必要描述
- 输出应简短精炼"#,

        OptimizeMode::Structured => r#"优化模式：结构化优化
以结构化格式组织提示词：
- 使用清晰的分段和标签（角色、目标、输入、输出、约束）
- 用编号列表组织多条要求
- 明确区分必要条件和可选条件
- 提供明确的输出格式模板"#,

        OptimizeMode::Creative => r#"优化模式：创意优化
以激发创造力为目标优化提示词：
- 鼓励多角度思考和头脑风暴
- 添加创意激发指令（如"打破常规"、"从意想不到的角度"）
- 允许更大的发挥空间
- 注重启发性而非约束性"#,

        // Raw 模式不需要模式指令，由 get_system_prompt 直接处理
        OptimizeMode::Raw => "",
    }
}

/// 获取完整 system prompt（基础 + 模式指令 + 可选自定义追加）
/// Raw 模式下返回空字符串，不添加任何系统提示词
pub fn get_system_prompt(mode: OptimizeMode, custom_suffix: Option<&str>) -> String {
    if matches!(mode, OptimizeMode::Raw) {
        return String::new();
    }
    let mut prompt = format!("{}

{}", BASE_SYSTEM_PROMPT, get_mode_instruction(mode));

    if let Some(suffix) = custom_suffix {
        let trimmed = suffix.trim();
        if !trimmed.is_empty() {
            prompt.push_str(&format!("\n\n{}", trimmed));
        }
    }

    prompt
}
/// 构建用户提示词
/// Raw 模式下直接返回原始内容，不做任何包装
pub fn get_user_prompt(
    raw_requirement: &str,
    language: Option<&str>,
    output_format: Option<&str>,
    has_images: bool,
    mode: OptimizeMode,
) -> String {
    // Raw 模式：直接透传用户原始内容，不添加任何包装
    if matches!(mode, OptimizeMode::Raw) {
        return raw_requirement.to_string();
    }

    let mut prompt = if has_images && raw_requirement.trim().is_empty() {
        // 只有图片、没有文字：反推提示词模式
        "用户只上传了图片，没有附带文字说明。请进入「反推提示词」模式：\n\
        仔细观察图片中的所有视觉细节（构图、色彩、风格、主体、场景、文字、UI 元素等），\n\
        反向推理出「如果要让 AI 生成这张图片（或实现图片中展示的效果），应该使用什么提示词」。\n\
        最终输出的提示词应该足够详细和精准，让别人拿着这个提示词就能复现出相似的结果。\n\
        重要：不要在你的回复中包含、引用或渲染用户上传的参考图片（禁止输出图片URL或Markdown图片语法），图片仅供你理解需求。".to_string()
    } else if has_images {
        // 有图片 + 有文字
        format!(
            "请结合以下用户上传的图片和文字需求，优化成更好的提示词。\n\
            分析图片中的视觉内容（如 UI 设计、流程图、产品照片等），并将其作为提示词优化的参考依据。\n\
            重要：不要在你的回复中包含、引用或渲染这些参考图片（禁止输出图片URL或Markdown图片语法），图片仅供你理解需求。\n\n\
            文字需求：\n{}",
            raw_requirement
        )
    } else {
        // 纯文字
        format!(
            "请将以下需求优化成更好的提示词。\n\n需求：\n{}",
            raw_requirement
        )
    };

    if let Some(lang) = language {
        let lang_name = match lang {
            "zh-CN" => "中文",
            "en" => "English",
            _ => lang,
        };
        prompt.push_str(&format!("\n\n【语言要求】优化后的提示词必须完全使用{}输出。", lang_name));
    }

    if let Some(fmt) = output_format {
        if fmt == "markdown" {
            prompt.push_str("\n\n【排版要求】你输出的优化后提示词请使用 Markdown 排版（标题、加粗、列表等），使结构清晰易读。注意：这是对你本次回复排版的要求，不要把这条要求写进优化后的提示词里。");
        } else {
            prompt.push_str(&format!("\n\n输出格式：{}", fmt));
        }
    }

    prompt
}
