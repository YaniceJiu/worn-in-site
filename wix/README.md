# 植物拼贴生成器 · JavaScript 版（Wix 用）

## 这是什么
一个**纯浏览器 JavaScript / Canvas** 的植物拼贴生成器，不再依赖 Python。
功能与之前的 Python 版一致：

- 从 18 个香水配方中随机抽 1 个配方
- 从配方原料里随机抽 **4 种**香料
- 用手调位置库摆放，自动**解重叠**（大重叠绕瓶转 180°、小重叠微调旋转/受限外推，目标 <5%）
- **环绕度平衡**（把最挤方位的一株搬到最空方位）
- 合成到香草布料背景 + 香水瓶上，可导出 PNG

## 文件清单
- `wix/botanical-builder.html` —— 生成器本体（数据、算法、渲染全部内嵌，单文件）
- `assets/botanicals/plants/*.png` —— 38 张植物图
- `assets/botanicals/perfume-bottle.png` —— 香水瓶
- `assets/botanicals/fabric-vanilla.jpg` —— 布料背景
- `botanical-plant-editor.html` —— 手调位置库的编辑器（可选）

## 本地预览
解压后，把整个目录放到任意静态服务器，浏览器打开：

```
wix/botanical-builder.html
```

> 因为要读图片，直接用 `file://` 双击打开会被浏览器安全策略挡住，
> 建议用静态服务器（例如 `python -m http.server` 或 VS Code Live Server）。

## 接入 Wix
Wix 用的是 JavaScript，所以这个文件可以直接用。两种方式：

### 方式 A：HTML 嵌入组件（最简单）
1. Wix 编辑器 → 添加 → 嵌入 → **Embed HTML**（iframe）
2. 选择「代码」模式，把 `wix/botanical-builder.html` 里 `<body>...</body>` 的全部内容贴进去
3. 图片资源：把 `assets/` 下所有图片上传到 Wix 媒体管理器（或任意图床），
   然后把 HTML 里的这一行改成你的图片地址前缀：
   ```js
   const ASSET = '../assets/botanicals/';
   // 改成例如：
   const ASSET = 'https://你的域名/植物图片/';
   ```
   要求：`plants/` 下文件名保持 `01_柑橘.png` 这种格式，`perfume-bottle.png`、`fabric-vanilla.jpg` 同名。

### 方式 B：整页 iframe
把整个解压目录部署到任意静态托管（GitHub Pages / Netlify / Wix 的托管），
然后在 Wix 页面里放一个 iframe 指向 `wix/botanical-builder.html` 的完整 URL。

## 修改要点
- 想改抽取数量：搜 `min(4,`，把 4 改成别的数字
- 想改重叠阈值：搜 `0.05`（当前 5%）
- 想改配方：搜 `const RECIPES`，按 top/mid/base 数组改
- 想改植物位置/大小：搜 `const PLANTS`，或先在手调编辑器里改好后导出 JSON 再替换
