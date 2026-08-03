import { io } from "socket.io-client";

// Singleton socket connection
const socket = io();

const LS_KEY_SID = "pi-web-ui-sid";

export function getSocket() {
  return socket;
}

export function saveActiveSid(sid) {
  if (sid) localStorage.setItem(LS_KEY_SID, sid);
  else localStorage.removeItem(LS_KEY_SID);
}

export function getSavedSid() {
  return localStorage.getItem(LS_KEY_SID);
}
