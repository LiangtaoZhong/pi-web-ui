import { useEffect, useRef, useCallback, useState } from "react";
import { io } from "socket.io-client";

const LS_KEY_SID = "pi-web-ui-sid";

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io();
    socketRef.current = s;
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    return () => { s.disconnect(); };
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
    return () => { socketRef.current?.off(event, handler); };
  }, []);

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const saveActiveSid = useCallback((sid) => {
    if (sid) localStorage.setItem(LS_KEY_SID, sid);
    else localStorage.removeItem(LS_KEY_SID);
  }, []);

  const getSavedSid = useCallback(() => {
    return localStorage.getItem(LS_KEY_SID);
  }, []);

  return { socket: socketRef, connected, emit, on, off, saveActiveSid, getSavedSid };
}
