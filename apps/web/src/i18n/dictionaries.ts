import type { Locale } from "./config";

export const en = {
  common: {
    tagline: "Open ticketing that never sells the same seat twice.",
    logIn: "Log in",
    getStarted: "Get started",
    logOut: "Log out",
    language: "Language",
  },
  nav: {
    demoEvent: "Demo event",
    github: "GitHub",
    apiDocs: "API docs",
  },
  landing: {
    status: "live · milestone 6 — the full build",
    title1: "Every seat, ",
    title2: "exactly once.",
    lead: "OpenSeat is open ticketing built to survive on-sale rushes. Create an event, share the link, and issue QR tickets — without ever selling the same spot twice.",
    viewDemo: "View the demo event",
    createOwn: "Create your own",
    noSignup: "No sign-up needed — jump in as a",
    demoBuyer: "demo buyer",
    or: "or a",
    demoOrganizer: "demo organizer",
  },
  auth: {
    loginTitle: "Welcome back",
    loginSubtitle: "Log in to manage your events and tickets.",
    registerTitle: "Create your account",
    registerSubtitle: "Start issuing tickets in minutes.",
    email: "Email",
    password: "Password",
    displayName: "Display name",
    login: "Log in",
    register: "Create account",
    noAccount: "New here?",
    haveAccount: "Already have an account?",
    signUp: "Sign up",
    signIn: "Sign in",
  },
  queue: {
    live: "On-sale live",
    title: "You're in the queue",
    place: "your place",
    of: "of",
    ahead: "ahead of you. The line moves automatically.",
    youreNext: "You're next — hold tight.",
    simulate: "Simulate a crowd",
    simulating: "Summoning…",
    leave: "Leave the queue",
    keepOpen:
      "Keep this tab open — you'll enter automatically when it's your turn.",
  },
};

export type Dictionary = typeof en;

export const th: Dictionary = {
  common: {
    tagline: "ระบบขายบัตรที่ไม่มีวันขายที่นั่งซ้ำ",
    logIn: "เข้าสู่ระบบ",
    getStarted: "เริ่มต้นใช้งาน",
    logOut: "ออกจากระบบ",
    language: "ภาษา",
  },
  nav: {
    demoEvent: "อีเวนต์ตัวอย่าง",
    github: "GitHub",
    apiDocs: "เอกสาร API",
  },
  landing: {
    status: "ใช้งานจริง · milestone 6 — ครบทุกฟีเจอร์",
    title1: "ทุกที่นั่ง ",
    title2: "ขายครั้งเดียวเป๊ะ",
    lead: "OpenSeat คือระบบขายบัตรที่สร้างมาเพื่อรับมือช่วงเปิดขายที่คนแห่เข้าพร้อมกัน สร้างอีเวนต์ แชร์ลิงก์ แล้วออกบัตร QR ได้ทันที โดยไม่ขายที่นั่งเดิมซ้ำ",
    viewDemo: "ดูอีเวนต์ตัวอย่าง",
    createOwn: "สร้างของคุณเอง",
    noSignup: "ไม่ต้องสมัคร — ลองเป็น",
    demoBuyer: "ผู้ซื้อตัวอย่าง",
    or: "หรือ",
    demoOrganizer: "ผู้จัดตัวอย่าง",
  },
  auth: {
    loginTitle: "ยินดีต้อนรับกลับ",
    loginSubtitle: "เข้าสู่ระบบเพื่อจัดการอีเวนต์และบัตรของคุณ",
    registerTitle: "สร้างบัญชีของคุณ",
    registerSubtitle: "เริ่มออกบัตรได้ในไม่กี่นาที",
    email: "อีเมล",
    password: "รหัสผ่าน",
    displayName: "ชื่อที่แสดง",
    login: "เข้าสู่ระบบ",
    register: "สร้างบัญชี",
    noAccount: "ยังไม่มีบัญชี?",
    haveAccount: "มีบัญชีอยู่แล้ว?",
    signUp: "สมัคร",
    signIn: "เข้าสู่ระบบ",
  },
  queue: {
    live: "กำลังเปิดขาย",
    title: "คุณอยู่ในคิวแล้ว",
    place: "ลำดับของคุณ",
    of: "จาก",
    ahead: "คนอยู่หน้าคุณ · คิวขยับอัตโนมัติ",
    youreNext: "คุณคือคนถัดไป — รอสักครู่",
    simulate: "จำลองฝูงชน",
    simulating: "กำลังเรียก…",
    leave: "ออกจากคิว",
    keepOpen: "เปิดแท็บนี้ไว้ — ระบบจะพาคุณเข้าเมื่อถึงคิวโดยอัตโนมัติ",
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return locale === "th" ? th : en;
}
