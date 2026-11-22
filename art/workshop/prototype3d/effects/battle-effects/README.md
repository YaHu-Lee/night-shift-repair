# 战斗 3D 特效

`battle-effects.blend` 包含九个项目原创网格和顶点色，按名称导入 Cocos。透明度沿轨迹收边，主光、亮芯和外沿使用同一个网格。运行时复用网格和透明材质，在战斗步上更新尺寸、朝向与透明度。

| 网格 | 用途 |
| --- | --- |
| `SwingRibbon`、`HookRibbon` | 双手扳手朝各自动作方向扫出的青色弧光 |
| `StrikeBurst` | 真实命中点的钢屑和火花，近战撞击使用暖色 |
| `ArcLink` | 电弧枪与连锁跳点间的分叉电弧 |
| `RivetTracer`、`EnemyRound` | 铆钉、液压钉与探针的弹道，以及敌机飞行弹 |
| `HeatJet` | 喷火管、脉冲喷管在有效扇形内的多束热流 |
| `FluxRing`、`FluxTether` | 感应扩散、回收磁吸、牵引线圈与敌机拉索 |

网格局部 +X 朝前，Blender +Z 向上。导出切换到 glTF 的 +Y 向上。连线和弹迹压到一单位长，环形和斩光以一单位半径建模，Cocos 根据实际事件缩放。攻击范围和敌方预警仍由原有地面轮廓显示，特效不会改变伤害、穿透或拖拽判定。

在仓库根目录执行以下命令可以从脚本重新生成源模型及 GLB。脚本会覆盖同名的源文件，从 Blender 手工修改后可直接导出 GLB，使顶点色保持启用。

```powershell
$fxSource = "$PWD/art/workshop/prototype3d/effects/battle-effects"
$fxScratch = 'D:/playground/.night-shift-mechanic-qa/battle-effects'
& 'D:/tools/blender-portable/Blender.cmd' --background --factory-startup --python-exit-code 7 --python "$fxSource/build-battle-effects.py" -- $fxSource $fxScratch
Copy-Item -LiteralPath "$fxScratch/battle-effects.glb" -Destination 'creator-m0/assets/resources/prototype3d/effects/battle-effects.glb'
```
