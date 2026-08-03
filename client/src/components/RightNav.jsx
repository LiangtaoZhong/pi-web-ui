import { useState } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { Forum as QuestionIcon, Menu as NavIcon } from "@mui/icons-material";

// 右侧提问导航：默认半透明窄条，鼠标移入展开显示历史提问，点击跳转到对应消息
export default function RightNav({ questions, onJump }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      sx={(theme) => ({
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: expanded ? 260 : 34,
        transition: "width .25s ease",
        zIndex: 15,
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
        boxShadow: expanded ? 4 : 0,
        opacity: expanded ? 1 : 0.35,
        "&:hover": { opacity: 1 },
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        [theme.breakpoints.down("sm")]: { display: "none" },
      })}
    >
      {expanded ? (
        <>
          <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 0.75 }}>
            <QuestionIcon sx={{ fontSize: 14, color: "primary.main" }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: "0.7rem" }}>
              提问导航 ({questions.length})
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", py: 0.5 }}>
            {questions.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, py: 1, display: "block" }}>
                暂无提问
              </Typography>
            ) : (
              questions.map((q, i) => (
                <Box
                  key={i}
                  onClick={() => onJump(q.idx)}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    cursor: "pointer",
                    display: "flex",
                    gap: 0.75,
                    alignItems: "flex-start",
                    borderLeft: 2,
                    borderColor: "transparent",
                    "&:hover": {
                      bgcolor: "action.hover",
                      borderColor: "primary.main",
                    },
                  }}
                >
                  <QuestionIcon sx={{ fontSize: 12, color: "text.secondary", mt: 0.25, flexShrink: 0 }} />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.72rem", lineHeight: 1.5, color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {q.text}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </>
      ) : (
        <Tooltip title="提问导航" placement="left">
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", cursor: "pointer" }}>
            <NavIcon sx={{ color: "text.secondary" }} />
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}
