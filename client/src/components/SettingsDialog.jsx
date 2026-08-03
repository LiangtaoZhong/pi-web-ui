import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Button,
  TextField,
  Alert,
  Divider,
  Chip,
  CircularProgress,
  Switch,
} from "@mui/material";
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  RestartAlt as RestartIcon,
  Extension as SkillIcon,
  Dns as McpIcon,
  DarkMode as DarkIcon,
  LightMode as LightIcon,
  SmartToy as ModelIcon,
} from "@mui/icons-material";

function TabPanel({ children, value, index }) {
  return (
    <Box hidden={value !== index} sx={{ pt: 1 }}>
      {value === index && children}
    </Box>
  );
}

async function api(url, options) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export default function SettingsDialog({ open, onClose, addToast, mode, onToggleTheme, models, model, onSelectModel }) {
  const [tab, setTab] = useState(0);
  const [skills, setSkills] = useState([]);
  const [mcps, setMcps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // New skill form
  const [sName, setSName] = useState("");
  const [sDesc, setSDesc] = useState("");
  const [sContent, setSContent] = useState("");

  // New MCP form
  const [mName, setMName] = useState("");
  const [mCommand, setMCommand] = useState("");
  const [mArgs, setMArgs] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([api("/api/skills"), api("/api/mcp")]);
      setSkills(s.skills || []);
      setMcps(m.servers || []);
    } catch (e) {
      addToast("加载失败: " + e.message, true);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (open && (tab === 2 || tab === 3)) load();
  }, [open, tab, load]);

  async function installSkill() {
    if (!sName.trim() || !sDesc.trim()) {
      addToast("请输入 Skill 名称和描述", true);
      return;
    }
    setBusy(true);
    try {
      await api("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sName.trim(), description: sDesc.trim(), content: sContent }),
      });
      addToast("✅ Skill 已安装，重启会话后生效");
      setSName(""); setSDesc(""); setSContent("");
      load();
    } catch (e) {
      addToast("安装失败: " + e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSkill(name) {
    if (!confirm(`确定删除 Skill「${name}」？`)) return;
    setBusy(true);
    try {
      await api(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      addToast("Skill 已删除");
      load();
    } catch (e) {
      addToast("删除失败: " + e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function addMcp() {
    if (!mName.trim() || !mCommand.trim()) {
      addToast("请输入 MCP 服务器名称和命令", true);
      return;
    }
    setBusy(true);
    try {
      const args = mArgs.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      await api("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mName.trim(), command: mCommand.trim(), args }),
      });
      addToast("✅ MCP 服务器已添加，重启会话后生效");
      setMName(""); setMCommand(""); setMArgs("");
      load();
    } catch (e) {
      addToast("添加失败: " + e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMcp(name) {
    if (!confirm(`确定删除 MCP 服务器「${name}」？`)) return;
    setBusy(true);
    try {
      await api(`/api/mcp/${encodeURIComponent(name)}`, { method: "DELETE" });
      addToast("MCP 服务器已删除");
      load();
    } catch (e) {
      addToast("删除失败: " + e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setBusy(true);
    try {
      const d = await api("/api/restart", { method: "POST" });
      addToast(`已重启 ${d.restarted || 0} 个会话进程，下次交互时自动恢复`);
    } catch (e) {
      addToast("重启失败: " + e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 0 }}>
        <Typography variant="subtitle1" fontWeight={700}>设置</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
        <Tab label="外观" />
        <Tab label="模型" />
        <Tab icon={<SkillIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Skills" />
        <Tab icon={<McpIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="MCP" />
      </Tabs>
      <Divider />

      <DialogContent sx={{ minHeight: 320 }}>
        {/* 外观 */}
        <TabPanel value={tab} index={0}>
          <List dense disablePadding>
            <ListItem>
              <ListItemIcon>
                {mode === "dark" ? <DarkIcon /> : <LightIcon />}
              </ListItemIcon>
              <ListItemText
                primary="主题"
                secondary={mode === "dark" ? "深色模式" : "浅色模式"}
                slotProps={{
                  primary: { fontSize: 13, fontWeight: 600 },
                  secondary: { fontSize: 12 },
                }}
              />
              <Switch checked={mode === "dark"} onChange={onToggleTheme} />
            </ListItem>
            <ListItem>
              <ListItemIcon><RestartIcon /></ListItemIcon>
              <ListItemText
                primary="重启会话进程"
                secondary="安装 Skill / MCP 或修改配置后生效"
                slotProps={{
                  primary: { fontSize: 13, fontWeight: 600 },
                  secondary: { fontSize: 12 },
                }}
              />
              <Button size="small" variant="outlined" color="warning" onClick={restart} disabled={busy}>
                重启
              </Button>
            </ListItem>
          </List>
          <Alert severity="info" sx={{ mt: 1, fontSize: 12 }}>
            当前版本：v2.1.0 · 数据保存在 ~/.pi/agent/ 下
          </Alert>
        </TabPanel>

        {/* 模型 */}
        <TabPanel value={tab} index={1}>
          <Typography variant="caption" color="text.secondary">
            当前会话模型：{model || "-"}
          </Typography>
          <List dense disablePadding sx={{ mt: 1 }}>
            {(models || []).map((m) => (
              <ListItem
                key={m.provider + "/" + m.id}
                secondaryAction={
                  <Button
                    size="small"
                    variant={model === (m.name || m.id) ? "contained" : "outlined"}
                    disabled={model === (m.name || m.id)}
                    onClick={() => { onSelectModel(m); addToast("已切换模型: " + (m.name || m.id)); }}
                  >
                    {model === (m.name || m.id) ? "使用中" : "切换"}
                  </Button>
                }
              >
                <ListItemIcon><ModelIcon fontSize="small" /></ListItemIcon>
                <ListItemText
                  primary={m.name || m.id}
                  secondary={m.provider}
                  slotProps={{
                    primary: { fontSize: 13, fontWeight: 600 },
                    secondary: { fontSize: 11 },
                  }}
                />
              </ListItem>
            ))}
            {!models?.length && (
              <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: "center" }}>
                暂无可用模型
              </Typography>
            )}
          </List>
        </TabPanel>

        {/* Skills */}
        <TabPanel value={tab} index={2}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                已安装 ({skills.length}) — ~/.pi/agent/skills/
              </Typography>
              <List dense disablePadding>
                {skills.map((s) => (
                  <ListItem
                    key={s.name}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => deleteSkill(s.name)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={s.name}
                      secondary={s.description || "（无描述）"}
                      slotProps={{
                        primary: { fontSize: 13, fontWeight: 600 },
                        secondary: { fontSize: 11 },
                      }}
                    />
                  </ListItem>
                ))}
                {skills.length === 0 && (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: "center" }}>
                    暂无已安装 Skill
                  </Typography>
                )}
              </List>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>安装新 Skill</Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <TextField size="small" label="名称 (小写字母/数字/连字符)" value={sName} onChange={(e) => setSName(e.target.value)} />
                <TextField size="small" label="描述" value={sDesc} onChange={(e) => setSDesc(e.target.value)} />
                <TextField
                  size="small" label="SKILL.md 内容 (可选，留空自动生成)"
                  multiline minRows={2} maxRows={5}
                  value={sContent} onChange={(e) => setSContent(e.target.value)}
                />
                <Button variant="contained" startIcon={<AddIcon />} onClick={installSkill} disabled={busy} size="small" sx={{ alignSelf: "flex-start" }}>
                  安装
                </Button>
              </Box>
            </>
          )}
        </TabPanel>

        {/* MCP */}
        <TabPanel value={tab} index={3}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                已配置 ({mcps.length}) — ~/.pi/agent/mcp.json
              </Typography>
              <List dense disablePadding>
                {mcps.map((m) => (
                  <ListItem
                    key={m.name}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => deleteMcp(m.name)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={m.name}
                      secondary={
                        <Box component="span" sx={{ fontSize: 11 }}>
                          <Chip label={m.command} size="small" variant="outlined" sx={{ fontSize: 10, height: 20, mr: 0.5 }} />
                          {m.args?.join(" ") || ""}
                        </Box>
                      }
                      slotProps={{ primary: { fontSize: 13, fontWeight: 600 } }}
                    />
                  </ListItem>
                ))}
                {mcps.length === 0 && (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: "center" }}>
                    暂无 MCP 服务器
                  </Typography>
                )}
              </List>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>添加 MCP 服务器</Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <TextField size="small" label="名称 (如 mui-mcp)" value={mName} onChange={(e) => setMName(e.target.value)} />
                <TextField size="small" label="启动命令 (如 npx)" value={mCommand} onChange={(e) => setMCommand(e.target.value)} />
                <TextField size="small" label="参数 (空格分隔，如 -y @mui/mcp@latest)" value={mArgs} onChange={(e) => setMArgs(e.target.value)} />
                <Button variant="contained" startIcon={<AddIcon />} onClick={addMcp} disabled={busy} size="small" sx={{ alignSelf: "flex-start" }}>
                  添加
                </Button>
              </Box>
            </>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button variant="contained" onClick={onClose} size="small">关闭</Button>
      </DialogActions>
    </Dialog>
  );
}
