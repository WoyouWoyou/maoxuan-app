# 毛选实用工具箱

带着问题读《毛选》：明确问题、聚焦核心、联系自身、反复应用。

基于 Electron、React 和 SQLite 的桌面应用。支持导入 EPUB/TXT、为问题选择书籍，沿用问题输入 → 阅读原文与感受 → 联系自身 → 反复应用；保留毛选专用读法和毛选工作台。

v0.3.0 新增书架、来源校验、后台索引、多模型配置与 Token 用量统计。完整说明见 [实施记录](docs/multi-book-implementation.md)。

详细功能和截图见 [产品介绍](docs/介绍.md)。

## 开发

使用 Node.js 22：

```sh
npm ci
npm run dev
```

在应用设置中配置 AI 服务。开发环境也可通过本地 `.env` 配置；不要提交 API 密钥。

```sh
npm run verify
npm run test:smoke
```

## 打包

- macOS：`npm run dist`，生成当前架构的 DMG。
- Windows：GitHub Actions 自动生成 x64 EXE 安装包；在 Actions → Build Windows installer 的运行页面下载 `maoxuan-windows-x64`。详见 [Windows 打包说明](docs/windows-build.md)。

构建产物位于 `dist/`。当前安装包未配置代码签名。

## 许可证

本项目原创程序代码使用 [MIT License](LICENSE)。第三方依赖及收录的文章内容不在本项目 MIT 授权范围内，其权利归各自权利人所有。
