# 免费素材与授权清单

已核对作者或发布方页面，筛选标准是可以零成本用于商业游戏，而不只是“免费下载”。主组合：**Ninja Adventure 做原型美术，Kenney 做音效，Noto Sans SC 做中文界面**。不买包、不把别人的整包直接塞进项目。以下是下载入口与选用建议，尚未导入素材。核对日期：2026-11-19。

## 优先下载与选用

| 用途 | 素材与许可 | 首版选用 |
| --- | --- | --- |
| 主美术 | [Ninja Adventure，Pixel-Boy & AAA](https://pixel-boy.itch.io/ninja-adventure-asset-pack) · CC0 1.0 | 同一套俯视 16×16 像素资源，覆盖角色、敌怪、Boss、地砖、图标、VFX。先选 1 套主角动作、4 类轮廓易分辨的敌怪、1 个 Boss、1 套低对比度地砖。别导整包或示例工程。 |
| 卡片与 HUD | [Kenney UI Pack – Pixel Adventure](https://kenney.nl/assets/ui-pack-pixel-adventure) · CC0 | 商店卡片边框、按钮状态和血条。保留统一描边粗细；正式版卡片信息层级自己设计。 |
| 战斗与界面音效 | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) · [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) · 均为 CC0 | 先挑命中、受伤、拾取、升级、购买、Boss 预警各 1 个占位音，区分音色，同类高频音效加限频。 |
| 游戏内循环 BGM | [Empacotatron，OpenGameArt 作者发布页](https://opengameart.org/content/empacotatron) · CC0 | 有循环版，作为电子街机氛围备选。真机测接缝、音量与解码；若遮住预警音，宁可先不加音乐。 |
| 简体中文 UI | [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) · [SIL OFL 1.1 原文](https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt) | 优先测试系统字体；要嵌入再按首版文本做子集并复核字形、保留版权和许可文件，修改时按 OFL 检查保留字体名称条款。 |

## 备选路线

- [Pixel Shooter，PrawnForge](https://prawnforge.itch.io/pixel-shooter-asset-pack) · CC0。角色、持枪动作、敌人、武器、地形、拾取均有覆盖；如果主题转向科幻枪械，整套替换主美术，不建议混搭。

- [Tiny Questers Free Starter Pack](https://bobddadoo.itch.io/free-starter-pack) · 作者允许免费商用，但限制原素材再分发。适合试手绘动画，不能靠这一个包覆盖首版敌群、地图和 UI；暂不优先。

## 导入与授权记录

1. 下载时在项目里保留作者页、原始许可文本及素材包版本/下载日期；逐项记录实际使用文件、改动、用途和署名要求。CC0 条目也留来源，后续好替换。不要把限制原包转发的素材直接上传为公共下载。

2. 战斗区采用低对比地面、高对比轮廓。主角、危险提示、拾取物不能只靠颜色区分；隔着手机一臂远也应看清。16×16 像素素材尽量整数倍最近邻缩放，拿两台不同屏形的手机看效果。

3. 免费包解决原型成本，不负责辨识度。正式版优先自制：主角夜班维修工轮廓、招牌电弧特效、改装卡面和抖音封面。参考游戏不使用角色、素材、界面或音频。

## 原创整备台素材

整备台工作垫由项目内脚本用固定种子生成，无第三方素材，随项目使用。输出是 360 × 640 的不透明 PNG，保留 35 个低对比度色阶，作为文字和物品图标下方的底图。已通过尺寸、色阶及原尺寸目视检查。 [生成源文件](../art/workshop/bake-workbench.py) · [游戏资源](../creator-m0/assets/resources/workshop-ui/workbench.png)

## 3D 模型

维修工、冲车、十件手持武器及战斗特效由项目原创制模。维修工以图像生成的 A 案设定为参考，武器及冲车的材质均由项目生成并打包进 Blender 文件。资产目录记录源文件、导出路径、较早版本的来源和各类代码生成模型的修改入口。 [3D 资产目录](../art/workshop/prototype3d/README.md)
