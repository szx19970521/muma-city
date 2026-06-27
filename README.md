# 牧马城市 / Muma City

牧马城市是基于 [Hermes Desktop](https://github.com/fathah/hermes-desktop) 改造的第一人称 3D 智能体工作空间。它把 Hermes Agent 的聊天、任务、记忆、技能、工具和网关能力放进一个可探索的办公室与城市环境里，目标是让“使用智能体工作”更像进入一款游戏。

> 当前项目仍处于实验开发阶段。3D 场景、角色动画、碰撞、交通、天气和游戏化 UI 都在快速迭代中，稳定性优先于一次性做完所有效果。

## 当前方向

- 第一人称/第三人称 3D 工作空间
- 可视化智能体、任务白板、记忆库、技能与工具映射
- 办公室、停车场、餐厅、车行、公园和城市街区场景
- 智能体行为、玩家移动、HUD、背包和角色动画实验
- 基于 Hermes Agent 的本地/远程智能体连接能力

## 开发

```bash
npm install
npm run dev
```

常用验证命令：

```bash
npm run typecheck
npm test
npm run build:unpack
```

## 开源说明

本项目继承 Hermes Desktop 的 MIT License。上游项目信息和第三方 3D/动画资产说明见：

- [LICENSE](./LICENSE)
- [NOTICE.md](./NOTICE.md)
- `src/renderer/src/screens/Office/office3d/assets/THIRD_PARTY_ATTRIBUTION.json`
- `src/renderer/src/screens/Office/office3d/assets/FIRST_PERSON_ATTRIBUTION.json`

请不要提交 `.env`、API Key、私钥或本地个人数据。实验性大资源和临时下载内容应保留在 `work/` 等忽略目录中。
