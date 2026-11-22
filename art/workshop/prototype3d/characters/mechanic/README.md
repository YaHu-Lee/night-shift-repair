# 维修工 A · 线盘检修员

[A 案正面、背面和俯视设定](concept-a.webp)

模型以选定的 A 版正面、背面和俯视设定为依据。头盔是象牙色与橙色分色塑壳，偏置头灯带散热筋和沉头螺钉，单片护目镜在另一侧掀起。脸用连续的圆颊网格配合深棕小眼、短闭口笑和轻腮红，保留弯曲发束与双辫。深蓝连体工装保留卷袖、裸露小臂、斜带、橙色工具挂袋与石青裤缝。护膝、浅色手套、裤褶、后袋和鞋带各自成型。

背负线盘保留铸造轮缘、轴承、轮辐间开孔、六匝连续电缆、瓷绝缘件和悬挂的插头。侧向偏移和倾斜在角色俯视时露出青绿色绕线。五组头部朝向与倾斜的 Blender 网格检测均未发现头部和线盘相交。装配件、贴图和 Blender 关节支点均由项目制作。

## 文件

- `mechanic-dcc.blend` 保存可编辑装配件、四张内嵌材质图和展示机位。源文件中的网格可按单件编辑。
- `mechanic_body.py` 生成头部、服装、线盘与挂件。`mechanic_limbs.py` 生成四肢与护具。
- `build-mechanic.py` 生成贴图与装配文件，也能从编辑后的 .blend 导出游戏用 GLB。
- GLB 含 10 个部位网格和 37,712 个三角形，共用一份 PBR 材质。法线、底色、自发光和 ORM 都是 1024 × 1024，ORM 的 R、G、B 分别为遮蔽、粗糙度与金属度。Blender 的模型轴是 +X 前方、+Z 上方，导出 GLB 转为 +Y 上方。

## 导出

从仓库根目录运行以下命令。Blender 可执行文件、临时目录、贴图缓存和导出文件均在 D 盘。

```powershell
$mechanicSource = "$PWD/art/workshop/prototype3d/characters/mechanic"
$mechanicScratch = 'D:/playground/.night-shift-mechanic-qa/source-export'
& 'D:/tools/blender-portable/Blender.cmd' --background --factory-startup --python-exit-code 7 --python "$mechanicSource/build-mechanic.py" -- $mechanicSource $mechanicScratch --export-edited
```

默认以已有的 .blend 编辑稿重新导出。需要从程序重建时，省去 `--export-edited`，输出的 .blend 会覆盖同目录编辑稿。使用 `--render` 的重建模式会在 D 盘临时目录输出正面、背面、俯视和面部近景。验证导出后，将 GLB 复制到 `creator-m0/assets/resources/prototype3d/characters/mechanic-dcc.glb`。

保持 `Head`、`Torso`、`ShoulderMinus/Plus`、`ForearmMinus/Plus`、`ThighMinus/Plus`、`ShinMinus/Plus` 的锚点与命名。Cocos 将导入的网格挂到现有动画关节，并使用武器自身的挂点。

已从保存的 .blend 重新导出。两次输出的网格布局、贴图和索引相同，只有一个切线分量存在约 0.0001 的浮点差异。最终 GLB 的 SHA-256 为 `db7d34939db87d5a4ab036b6f63240be5bb5f48892f7442d5861463d36175d3b`。
