# Materials

What the film is made of, and where each piece came from. Real material first: the logo as a file, the product's own colours and type, its real interface. Anything rebuilt is traced over a capture listed here.

## Local · C:\Users\panda\WorkBuddy\视频批量截图工具  (2026-11-11)

The product: a Windows desktop app (Electron + local ffmpeg). Drag a folder of videos in, get one cover frame per video, written next to the source, nothing uploaded.

- Colours it uses: #f5f6f8 (css --bg) · #ffffff (css --panel) · #e7e9ee (css --line) · #f0f1f4 (css --line-soft) · #1b1e23 (css --text) · #71767f (css --sub) · #9aa0a8 (css --sub2) · #2f6bed (css --accent) · #eaf0fe (css --accent-soft) · #15a35b (css --green) · #d93a3a (css --red)
- Logo mark: blue rounded square, gradient #3b7bf6 → #2450c9, white picture-frame glyph. Files: `materials/icon256.png` (256 px), `materials/icon.svg` (source), `build/app.ico` (Windows). The real file is used, never redrawn.
- Typefaces: `Microsoft YaHei UI` (the app's own stack: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI"). Numbers are tabular (`font-variant-numeric: tabular-nums`).

### Interface captures — real, run on this machine (2026-11-11)

Taken with `desktop/capture.js` (`win.capturePage()`, 1920×1040, the screen's physical cap), driving the real app against the real folder `H:\2026年项目工程\AI杂项\AI视频`. Not staged: the run below really executed ffmpeg 14 times.

| File | What it shows |
| --- | --- |
| `ui-full.png` | 14 videos imported, all 14 ffmpeg thumbnails rendered, 0 已截图, all checkboxes ticked, `开始批量截图` armed |
| `ui-running.png` | mid-run: `正在截图…`, progress bar part-filled |
| `ui-done.png` | 14 / 14 已截图, every card stamped `已导出 00:00.5` in green, toast `全部完成，共 14 张 (12.5s)`, footer `14 / 14 12.5s` |
| `ui-modal.png` | the per-card 调整时间点 dialog: big preview + scrub slider |
| `ui-drop.png` | the drop overlay `松开即可导入` |
| `shell-dir.png`, `shell-dragover.png` | earlier 1080-wide captures, kept for reference |

The run's real numbers, read off the interface: **14 个视频 · 8.6 GB · 6144×8192 / 4992×6656 / 3336×4448 · 12.5 s wall clock** (README records 10.5 s for the same set; 12.5 s is this capture's, and it is the one used on screen).

### The output — the product's real result

`materials/frames/f01…f14.jpg` — the 14 files the app actually wrote to `H:\2026年项目工程\AI杂项\AI视频\截图导出` on 2026-11-05, downscaled to 1400 px on the long edge for the web (originals: 4992×6656 up to 6144×8192 JPG, 0.6–2.0 MB each). Source videos are 8K vertical AI-generated 青绿山水 / 城隍庙 scenes by Seedance 2.0/2.5 and Kling O3 — the user's own material, generated for an AI 影视 animation project.

Their palette, which the film may borrow as *content* (never as the product's own colour): paper #f2efe6 · celadon #7f9c8a / #4e7d6b · vermilion #b8574a / #a83c30 · ink blue-grey #8a97a3.

### Source video

`H:\2026年项目工程\AI杂项\AI视频\` — 14 files. If the film needs real motion, frames are extracted from these (see `materials/clips/` when present), never screen-recorded.

### Not available

No website, store page or repo — the product exists only on this machine, so there is no launch copy to quote and no brand voice beyond its own UI strings (`开始批量截图`, `导入文件夹`, `自动跳过黑场 / 纯色空帧`, `同名文件 → 直接覆盖`, `并发处理 3`). All on-screen text in the film comes from those strings or the README.
