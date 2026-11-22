# 第 01 关冲车

`charger-stage01.blend` 是项目原创 Blender 模型。车体、撞板和橡胶履带按装配件建模，贴图由同目录的 `build-charger.py` 生成并打包进源文件。生成过程使用 Blender 4.5 LTS 自带的 Python 和 NumPy。模型与贴图随项目使用。

| 表面 | 做法 |
| --- | --- |
| 撞板 | 冷灰钢、折面和可更换的底部耐磨块。板面保留横向磨痕，切边和液压杆使用更低粗糙度、更高金属度的钢材。 |
| 喷漆外壳 | 赭色折板、滚边和局部漆面磨损。顶部散热格栅、检修编号和两侧翼板用于俯视辨形。 |
| 橡胶履带 | 高粗糙度石墨色橡胶，采用分体胎面和路轮，胶块方向与履带走向一致。 |

## 编辑和导出

源模型面向 +X，Blender 的 Z 轴朝上。GLB 以 Y-up 导出，统一使用 512 × 512 的底色、法线、自发光和 ORM 贴图。ORM 的 R、G、B 分别为环境遮蔽、粗糙度和金属度。

导出时每个动作支点合并为一份网格和一份材质，常态 3,144 个三角形，预警灯和尾焰全部启用时 3,288 个。保留 `TrackHousing`、`TrackLinks`、`Chassis`、`Ram`、`RamSignal`、`Jets` 六个支点的名称和层级。撞板跟随车身，亮灯随撞板，尾焰独立。灯和尾焰在源文件中默认隐藏，可在轮廓视图开启。

从仓库根目录运行以下命令，从编辑后的 Blender 源文件导出 GLB。程序将 GLB、贴图缓存和可选渲染写入 D 盘的临时目录。

```powershell
$chargerSource = "$PWD/art/workshop/prototype3d/enemies/charger-stage01"
$chargerScratch = 'D:/playground/.night-shift-charger-qa/blender'
& 'D:/tools/blender-portable/Blender.cmd' --background --factory-startup --python-exit-code 7 --python "$chargerSource/build-charger.py" -- $chargerSource $chargerScratch --export-edited
```

加上 `--render` 可同时渲染前后视角。去掉 `--export-edited` 会按脚本重新生成源文件，覆盖手工编辑。验证导出的资源后，将 `$chargerScratch/charger-stage01.glb` 复制到 `creator-m0/assets/resources/prototype3d/enemies/charger-stage01.glb`。
