# Public snapshot note

This repository is a clean public snapshot of **PromptPilot** (source code as of
v0.3.9, October 2026), published for review. It is not the development
repository — the private development repo remains the source of truth.

**Included:** all source code (React/TypeScript frontend, Rust/Tauri backend,
SQL migrations), project configuration, README and LICENSE.

**Not included:**

- Git history — this snapshot starts from a fresh import
- Internal development documentation kept in the private repo (session logs,
  code-review notes, design docs, changelog, UI mockups)
- Binary image assets (app icons under `src-tauri/icons/` and `icon/`,
  installer artwork, `public/app-icon.png`) — the paths are referenced in
  configuration as usual
- `build.bat` and the release scripts, which depend on internal changelog
  tooling
- The dependency lockfiles (`package-lock.json`, `src-tauri/Cargo.lock`) are
  omitted due to a transfer size limit — regenerate them with `npm install`
  and `cargo build`
