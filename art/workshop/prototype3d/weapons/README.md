# 维修工的手持工具

`weapons-dcc.blend` 收录十件项目原创的可编辑工具。电弧扳手对应角色 A 方案的银钢活动扳口和青色嵌条，电弧枪沿用该套配色的橙色壳体和青色发光端。其余工具按各自在战斗中的作用刻画轮廓。

| 工具 | 识别细节 | 三角形 |
| --- | --- | ---: |
| 电弧扳手 | 磨亮的钢钳口、接触台阶、调节滚轮和青色绝缘嵌条 | 1,604 |
| 电弧枪 | 橙色铸壳、检修密封条、侧窗、铜色组件和双护轨 | 3,204 |
| 铆钉枪 | 短机壳、压铸导槽和银色定位杯 | 1,720 |
| 喷火管 | 暗红隔热片、下挂铜罐、黑化陶瓷喷口 | 1,872 |
| 感应线圈 | 竖直线圈、五道铜环和浅色陶瓷帽 | 2,036 |
| 液压钉枪 | 加长杆和两根外露的亮钢缓冲杆 | 1,496 |
| 脉冲喷管 | 宽口导波筒、青色内衬和发光环 | 1,756 |
| 牵引线圈 | 卷轴两侧的磁极和 U 形发光端 | 1,380 |
| 分束探针 | 浅色外壳、分叉探头和双通道指示条 | 1,844 |
| 旁路扳手 | 铜色活动钳口、外露导电桥和白色夹口 | 1,980 |

## 编辑与导出

每件工具以 `ToolId` 命名，手掌握点位于该工具的局部原点。Blender 为 Z 向上，GLB 为 Y 向上，+X 指向前方。扳手沿局部 −Y 伸出，方便继续沿用挥击姿态，感应线圈的陶瓷帽沿 +Y 伸出。源文件把零件分开保留，导出后每件工具合为一张网格，全套共用四张 512 × 512 贴图，用于底色、法线、环境遮蔽与粗糙度及金属度、自发光。

从项目根目录运行下面的命令，可把已编辑的 `.blend` 导出成 GLB。随 Blender 4.5 LTS 提供的 Python 与 NumPy 即可运行。

```powershell
$toolSource = "$PWD/art/workshop/prototype3d/weapons"
$toolScratch = 'D:/playground/.night-shift-mechanic-qa/weapons'
& 'D:/tools/blender-portable/Blender.cmd' --background --factory-startup --python-exit-code 7 --python "$toolSource/build-weapons.py" -- $toolSource $toolScratch --export-edited
```

加上 `--render` 可在临时目录生成同机位的核对图。去掉 `--export-edited` 会重新生成源文件，覆盖此前编辑。检查后，将 `$toolScratch/weapons-dcc.glb` 复制到 `creator-m0/assets/resources/prototype3d/weapons/weapons-dcc.glb`。
