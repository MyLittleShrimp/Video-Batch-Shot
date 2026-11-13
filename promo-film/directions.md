# Three directions — 视频批量截图工具 v1.1.0

Same content in all three: 14 real 8K vertical videos (8.6 GB), one cover frame each, 12.5 s, nothing uploaded.
What differs is the language and the material.

The product reads: precise, quietly fast, technical, new — a small utility whose output is art. Its own
palette is #f5f6f8 paper · #ffffff panel · #1b1e23 ink · #2f6bed accent. The 14 frames it wrote carry their
own palette (paper #f2efe6, celadon #7f9c8a, vermilion #b8574a).

---

## A · 打样纸

```
A · 打样纸        language: card-montage + continuous-morph   look: 产品自己的纸灰底，白边样张一块块压上来；
                                  Microsoft YaHei 族的黑体（Noto Sans SC），数字用 Inter 表格数字；无阴影戏剧、无滤镜
Palette:         #f5f6f8 46% 纸灰底（产品 --bg） · 图片 34%（产品真实产出） · #ffffff 12% 样张白边（--panel）
                 · #1b1e23 6% 墨字（--text） · #2f6bed 2% 规则线与数字（--accent）
Logline:         一个装满 8K 竖屏视频的文件夹，14 张封面一块块压上来铺满整面墙，12.5 秒后全部停住，
                 画面只在角上写着：不上传。
Why it fits:     Transformation 形状 + 精确/技术的人格 → 最直白的一版：不解释，只给结果。工具片的观众
                 想看的就是「我那一堆文件最后变成什么」。
Feel:            hybrid；110 BPM；hook = 0 s 就有三块黑卡带着真实分辨率压在墙上，第 2 拍翻成图；
                 build 每小节 4 个事件（卡落 + 数字跳 + 规则线推进）；37% 处连切爆发（14 块一拍拍满）；
                 峰值后急停 1.2 s，只剩 12.5 和一条蓝线；resolve 回品牌。
Risk:            它最像「产品截图加字幕」。需要靠运镜（整墙缓慢推进 + 每块落地的实感）和断点撑住，
                 否则会滑成一页 PPT。
```

**与流行款的区别**：全场是产品的纸灰白，不是奶油白 + Geist + 柠檬绿；唯一的彩色来自用户自己的画。

## B · 长廊

```
B · 长廊          language: 3d-object（CSS 3D 纸面空间）   look: 墨黑展厅，14 张白边样张成两列向灭点退去；
                                  柔光打在最近的一张上，远处按大气透视压暗
Palette:         #0f1116 52% 展厅地（由 --text 压暗） · 图片 34% · #fdfcf9 8% 样张白边（--panel 略暖）
                 · #ffeecd 4% 展厅主光（取自画里的纸色 #f2efe6） · #2f6bed / #6d9bff 2%（--accent）
Logline:         镜头贴着最近的一张样张掠过，14 张封面在黑暗里一列列退向深处，最后停在 12.5 秒。
Why it fits:     同一份内容换成一个真实空间。给「产出很值钱」这件事一个物理体量：这些图不是列表项，
                 是挂在墙上的东西。深度方向在三个里只出现这一次。
Feel:            continuous；96 BPM，不切，一段镜头走完；第一秒就是在动（相机沿墙推 + 近景失焦）；
                 高潮是镜头穿过最后一张样张、远处灯亮。
Risk:            在一个小工具身上用 3D 容易过火。要靠「就是纸和白边」克制住，不能加玻璃、发光、镀铬。
```

**与流行款的区别**：黑底是产品自己的墨色，强调色仍是品牌蓝；没有橙、没有柠檬、没有辉光滥用。

## C · 定格

```
C · 定格          language: photo-led + continuous-morph   look: 真实 8K 原片（城隍庙推镜）满幅竖着占住画面，
                                  定格瞬间的残影还留在左边；极细的蓝色读数；黑场
Palette:         #0b0d11 38% 黑场 · 图片 54%（用户真实原片） · #2f6bed 4%（--accent 的读数与短线）
                 · #f4f2ec 4% 字（取自画里的纸白）
Logline:         镜头正穿过一座城隍庙的山门，鼓点落下的那一帧，整个世界停住——这就是工具做的事：
                 把运动定成一帧。然后 13 张一起落下来，12.5 秒。
Why it fits:     这个产品唯一的动作就是「让画面停住」。全片用真实原片演这件事，别人抄不走：
                 没有这批 8K 素材，这个镜头不成立。
Feel:            hybrid；110 BPM；0 s 就是运动中的真实画面（不是标题卡）；第一次定格在 2.6 s 的重拍上，
                 残影拖在左边证明它刚在动；中段 14 张定格连切爆发；结尾回到黑的定格帧。
Risk:            需要逐帧序列（已经从原片抽了 96 帧）；如果观众看不出「刚才是动的」，整个立意就塌了，
                 所以定格前后必须有可见的位移。
```

**与流行款的区别**：全片没有品牌色的大色块，颜色全部来自用户自己的片子——这是最不可能被认成
「又一个 AI 做的产品片」的一版。

---

音乐不在选项里。选定方向后我按产品的性格定：A 走干净的电子节拍 + 打印机的机械声，B 走低频铺底
加一次大提琴进入，C 走真实打击乐（木鱼、鼓）加一次急停。三个方向都按 110 BPM 附近搭事件。
