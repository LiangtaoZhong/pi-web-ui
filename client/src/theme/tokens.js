// Claude 设计系统 token（来自 claude.ai 的 CSS 设计变量）
// HSL 值与 claude.ai 的 --bg-*/--text-*/--brand-* 一致

export const claudeTokens = {
  dark: {
    // 背景层级（由深到浅）
    bg000: "hsl(60 2.1% 18.4%)", // 主表面 #2E2E2D
    bg100: "hsl(60 2.7% 14.5%)", // 页面/侧栏 #262625
    bg200: "hsl(30 3.3% 11.8%)", // 更深面板 #1F1F1E
    bg300: "hsl(60 2.6% 7.6%)", // #141413
    // 文字层级
    text000: "hsl(48 33.3% 97.1%)", // 主文字 #F7F7F2
    text100: "hsl(48 33.3% 97.1%)",
    text200: "hsl(50 9% 73.7%)", // 次级 #BCBCB3
    text300: "hsl(50 9% 73.7%)",
    text400: "hsl(48 4.8% 59.2%)", // 弱化 #97978F
    text500: "hsl(48 4.8% 59.2%)",
    // 品牌与强调
    brand000: "hsl(15 54.2% 51.2%)", // 深橙
    brand100: "hsl(15 63.1% 59.6%)", // Claude 橙 #E58A52
    brand200: "hsl(15 63.1% 59.6%)",
    accent000: "hsl(210 65.5% 67.1%)", // 链接蓝
    accent100: "hsl(210 70.9% 51.6%)",
    // 边框
    border100: "hsl(51 16.5% 84.5%)",
    // 语义色
    success: "hsl(97 75% 32.9%)",
    danger: "hsl(0 98.4% 75.1%)",
    warning: "hsl(39 93.4% 35.9%)",
  },
  light: {
    bg000: "hsl(0 0% 100%)", // 主表面 #FFFFFF
    bg100: "hsl(48 33.3% 97.1%)", // 页面/侧栏 #F9F9F7
    bg200: "hsl(53 28.6% 94.5%)", // 面板 #F5F4EC
    bg300: "hsl(48 25% 92.2%)",
    text000: "hsl(60 2.6% 7.6%)", // 主文字 #141413
    text100: "hsl(60 2.6% 7.6%)",
    text200: "hsl(60 2.5% 23.3%)", // #3D3D3A
    text300: "hsl(60 2.5% 23.3%)",
    text400: "hsl(51 3.1% 43.7%)", // #70706C
    text500: "hsl(51 3.1% 43.7%)",
    brand000: "hsl(15 54.2% 51.2%)", // 深橙
    brand100: "hsl(15 54.2% 51.2%)",
    brand200: "hsl(15 63.1% 59.6%)", // Claude 橙
    accent000: "hsl(210 73.7% 40.2%)", // 链接蓝
    accent100: "hsl(210 70.9% 51.6%)",
    border100: "hsl(30 3.3% 11.8%)",
    success: "hsl(103 72.3% 26.9%)",
    danger: "hsl(0 56.2% 45.4%)",
    warning: "hsl(39 88.8% 28%)",
  },
};

// 字体栈（含中文回退，与 claude.ai 分享页一致）
export const fontSans =
  '"Anthropic Sans", system-ui, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
export const fontSerif =
  '"Anthropic Serif", Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", "SimSun", serif';
export const fontMono =
  '"Anthropic Mono", "SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';
