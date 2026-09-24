[![English](https://img.shields.io/badge/English-555555?style=flat)](README.md) [![简体中文](https://img.shields.io/badge/简体中文-555555?style=flat)](README.zh-CN.md)

# Oscar Zhu — 作品集

[zhuhroscar-tech.github.io](https://zhuhroscar-tech.github.io/) 的源码仓库。这是一个静态作品集网站，展示有公开依据的软件项目，并包含个人介绍、工作原则和公开联系链接。

![作品集首页](docs/images/homepage.png)

## 本地预览

需要 Git、Python 3 和浏览器。无需安装额外包、构建前端框架或启动后端服务。

```bash
git clone https://github.com/zhuhroscar-tech/zhuhroscar-tech.github.io.git
cd zhuhroscar-tech.github.io
python3 -m http.server 8000 --bind 127.0.0.1
```

打开 <http://localhost:8000>。请在仓库根目录启动服务，确保相对资源路径正确解析。按 Ctrl+C 停止。绑定回环地址可将开发服务限制在本机；此命令不用于生产部署。

## 仓库结构

- [`index.html`](index.html)：作品集内容和页面元数据。
- [`styles.css`](styles.css)：布局与视觉样式。
- [`script.js`](script.js)：移动端导航、当前年份和兼顾 reduced-motion 偏好的渐入效果。
- [`assets/`](assets/)：项目图片、favicon 和社交分享预览图。
- [`404.html`](404.html)、[`robots.txt`](robots.txt)、[`sitemap.xml`](sitemap.xml)：网站辅助文件。
- [`tests/test_site.py`](tests/test_site.py)：静态网站约束测试。
- [`LICENSE`](LICENSE)：仓库源码的 MIT 许可证。

网站使用原生 HTML、CSS 和 JavaScript，预览前不需要生成额外的构建目录。

## 验证

```bash
python3 -m unittest discover -s tests -v
```

测试覆盖身份与搜索元数据、结构化数据 JSON、manifest 与 sitemap 一致性、必要页面区块与项目链接、本地图片及 alt 文本、导航目标、辅助文件、部分颜色对比度，以及旧版未经验证的经历描述是否已移除。[验证工作流](.github/workflows/validate.yml)在 push 和 pull request 时运行这些检查。

测试通过不等于完成了视觉或无障碍审查。修改后仍需在浏览器中预览，检查窄屏导航，确认链接和图片正常且有意义。

## 内容规范

仅链接公开项目和已批准公开的个人资料。不要提交私人工作产物、内部分析、录音转写或求职材料。项目描述应有公开证据支持，不添加无依据的经历或成果。

英文和简体中文 README 仅用于说明仓库，不会改变已发布网站的语言或内容。
