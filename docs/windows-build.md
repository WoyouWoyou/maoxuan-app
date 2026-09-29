# Windows 安装包

GitHub Actions 工作流：`.github/workflows/build-windows.yml`。

将代码推送到 GitHub 后，构建相关文件变更或推送 `v*` 标签会触发 Windows x64 打包。
工作流进入默认分支后，也可以在 Actions → Build Windows installer → Run workflow 手动选择分支构建。

构建成功后，在对应运行页面的 Artifacts 下载 `maoxuan-windows-x64`，解压得到：

- `maoxuan-0.1.0-windows-x64-setup.exe`（版本号随 package.json 更新）
- `SHA256SUMS.txt`

安装向导允许选择安装目录。产物保留 30 天，不会自动发布 GitHub Release。
当前未配置 Windows 代码签名证书，安装包为未签名版本。

Windows 本地复现：使用 Node.js 22，执行 `npm ci`、`npm run typecheck`、`npm run dist:win`。
依赖安装会为 Electron 重建 better-sqlite3；需要原生编译时，须安装 Visual Studio C++ 构建工具和 Python。GitHub 工作流使用 Windows 2022 托管 runner。
