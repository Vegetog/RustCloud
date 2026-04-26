# RustCloud Thesis Figures

This folder contains Mermaid source files for the figures that can be inserted
into `04正文.docx`.

Recommended workflow:

1. Open a `.mmd` file in VS Code with the Mermaid extension, Mermaid Live Editor,
   or draw.io's Mermaid import.
2. Export as SVG or PNG.
3. Insert the exported image into Word.
4. Use Word's "引用 -> 插入题注" to create captions such as `图 4.1 ...`.
5. Update the figure list after all figures are inserted.

Font configuration:

- Each `.mmd` file includes a Mermaid `init` block that sets the font stack to
  `"Times New Roman", SimSun, "Songti SC", STSong, serif`.
- The order is intentional: English letters and digits use Times New Roman
  first, while Chinese characters fall back to SimSun or Songti-compatible
  fonts.
- If exporting with Mermaid CLI, use:

```bash
mmdc -i fig-4-3-key-hierarchy.mmd -o fig-4-3-key-hierarchy.png -c mermaid-config.json -b white
```

- On macOS, Microsoft SimSun may not be installed by default. If SimSun is
  unavailable, the rendered image will usually fall back to Songti SC/STSong.
  For strict "宋体" compliance, install SimSun locally before exporting PNGs.

Suggested caption mapping:

| File | Caption |
| --- | --- |
| `fig-4-1-system-architecture.mmd` | 图 4.1 RustCloud 系统总体架构图 |
| `fig-4-2-er-diagram.mmd` | 图 4.2 RustCloud 核心实体关系图 |
| `fig-4-3-key-hierarchy.mmd` | 图 4.3 RustCloud 端到端加密密钥体系 |
| `fig-4-4-registration-sequence.mmd` | 图 4.4 用户注册流程时序图 |
| `fig-4-5-login-sequence.mmd` | 图 4.5 用户登录流程时序图 |
| `fig-4-6-upload-flow.mmd` | 图 4.6 文件上传加密流程图 |
| `fig-4-7-download-flow.mmd` | 图 4.7 文件下载解密流程图 |
| `fig-4-8-public-share-flow.mmd` | 图 4.8 文件夹公开分享流程图 |
| `fig-5-1-workspace-modules.mmd` | 图 5.1 后端 Cargo Workspace 模块依赖图 |
| `fig-5-2-local-vector-search.mmd` | 图 5.2 浏览器端语义检索流程图 |
| `fig-6-1-encryption-performance.mmd` | 图 6.1 不同文件规模下的前端加解密耗时 |
| `fig-6-2-api-latency.mmd` | 图 6.2 主要 API 在不同并发下的响应延迟 |

The two test screenshots mentioned in the thesis should be captured from the
running system instead of drawn:

- Main document list page.
- Public folder share page.
- Database ciphertext query result.
- Browser Network panel showing that URL fragment is not sent to the server.
