# 3D 资产目录

Blender 源文件包含可编辑分件和内嵌贴图。游戏使用导出的 GLB，放在 Creator 的 `assets/resources/prototype3d` 下。每个分类的说明里有导出命令、材质和动作支点。

| 分类 | 可编辑源文件与导出 | Creator 资产 |
| --- | --- | --- |
| 角色 | [维修工 A](characters/mechanic/README.md) · [A 案设定](characters/mechanic/concept-a.webp) | [维修工 GLB](../../../creator-m0/assets/resources/prototype3d/characters/mechanic-dcc.glb) · [早期维修工网格](../../../creator-m0/assets/resources/prototype3d/characters/mechanic-ai.json) |
| 敌机 | [第 01 关冲车](enemies/charger-stage01/README.md) | [冲车 GLB](../../../creator-m0/assets/resources/prototype3d/enemies/charger-stage01.glb) |
| 武器 | [十件手持工具](weapons/README.md) | [武器 GLB](../../../creator-m0/assets/resources/prototype3d/weapons/weapons-dcc.glb) |
| 战斗特效 | [斩光、弹迹、电弧与命中效果](effects/battle-effects/README.md) | [战斗特效 GLB](../../../creator-m0/assets/resources/prototype3d/effects/battle-effects.glb) |

修改模型时，从分类目录打开 `.blend`，导出到 D 盘的工作目录，再更新对应 GLB。携带武器使用自己的局部握点，两手按武器槽位驱动。角色关节和特效网格的名称与运行时代码对应，编辑和再导出时保留这些名称。

## 代码生成的 3D 模型

| 分类 | 修改入口 |
| --- | --- |
| 其余小型敌机与首领 | [小型敌机](../../../assets/scripts/cocos/PrototypeRegularMeshes.ts) · [首领](../../../assets/scripts/cocos/PrototypeBossMeshes.ts) · [旧版冲车](../../../assets/scripts/cocos/PrototypeChargerMesh.ts) |
| 战斗场景 | [场景装配](../../../assets/scripts/cocos/PrototypeArenaMeshes.ts) · [前两章](../../../assets/scripts/cocos/PrototypeArenaEarly.ts) · [后两章](../../../assets/scripts/cocos/PrototypeArenaLate.ts) |
| 局外场景 | [值班室](../../../assets/scripts/cocos/PrototypeDepotMeshes.ts) · [路线图](../../../assets/scripts/cocos/PrototypeRouteMeshes.ts) · [江岸终幕](../../../assets/scripts/cocos/PrototypeEndingMeshes.ts) |
| 道具和人物图 | [配件与装备](../../../assets/scripts/cocos/PrototypeItemMeshes.ts) · [电台人物](../../../assets/scripts/cocos/PrototypeRadioMeshes.ts) |
| 战场设施与标记 | [战场设施](../../../assets/scripts/cocos/PrototypeFieldView.ts) · [技能特效调度](../../../assets/scripts/cocos/PrototypeSkillView.ts) |

## 早期维修工重建

[重建脚本](characters/mechanic/reconstruct-mechanic.py) 取项目自有的 `art/workshop/source/crew.png` 左上格（SHA-256 `c902333e3d585e9a64c0794aec9b40bd330de6a76585c6d78fab083cc7c91b48`），通过 TripoSR 从原画推理带顶点色的网格，裁切头部和上身，分别减到 1,599 和 1,200 个三角形。构建预览加 `?mechanic=legacy` 可查看这一版。

TripoSR 代码与权重采用 MIT。项目使用提交 `107cefdc244c39106fa830359024f6a2f1c78871` 和权重 `429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee`。 [代码](https://github.com/VAST-AI-Research/TripoSR/tree/107cefdc244c39106fa830359024f6a2f1c78871) · [权重](https://huggingface.co/stabilityai/TripoSR)

在独立 Python 环境安装适配 CUDA 的 PyTorch，以及 `numpy Pillow omegaconf einops transformers==4.44.2 trimesh scikit-image fast-simplification huggingface-hub imageio rembg[cpu]`。将权重仓库的 `config.yaml` 保存为 `triposr-config.yaml`，与 `model.ckpt` 放在同一目录。以下命令从仓库根目录运行。已有原始 PLY 时会复用原始网格，可用 `--device cpu` 运行或用 `--output` 指定对照文件。

```powershell
python art/workshop/prototype3d/characters/mechanic/reconstruct-mechanic.py --triposr <TripoSR检出位置> --weights <权重目录> --raw <D盘工作目录>/mechanic-raw.ply
```
