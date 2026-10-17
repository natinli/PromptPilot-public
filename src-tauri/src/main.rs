// 防止在 Windows release 构建中弹出终端窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    prompt_pilot_lib::run()
}
