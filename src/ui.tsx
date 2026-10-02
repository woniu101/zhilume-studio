import { ConnectionForm } from './ConnectionControl';
import { hasOverlays } from './overlays';
import brandIcon from "../assets/icon.svg";
import { useEffect, useState, type ReactNode } from "react";
import { Monitor, Moon, Sun, X } from "lucide-react";

export function ThemeButton() {
  const [mode, setMode] = useState(
    localStorage.getItem("zhilume.theme") || "dark",
  );
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        mode === "system" ? (query.matches ? "dark" : "light") : mode;
    };
    apply();
    localStorage.setItem("zhilume.theme", mode);
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [mode]);
  return (
    <button
      className="icon-button"
      title={`主题：${{ dark: "深色", light: "浅色", system: "跟随系统" }[mode]}（点击切换）`}
      aria-label="切换主题"
      onClick={() =>
        setMode(
          mode === "dark" ? "light" : mode === "light" ? "system" : "dark",
        )
      }
    >
      {mode === "dark" ? (
        <Moon size={17} />
      ) : mode === "light" ? (
        <Sun size={17} />
      ) : (
        <Monitor size={17} />
      )}
    </button>
  );
}
export function Brand({ subtitle = "STUDIO" }: { subtitle?: string }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img src={brandIcon} width={30} height={30} alt="" />
      </span>
      <span>
        Zhilume <small>{subtitle}</small>
      </span>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hasOverlays()) close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭" onClick={close}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Login({
  connected,
  server = false,
}: {
  connected: () => void;
  server?: boolean;
}) {
  return <div className="login-page"><div className="login-theme"><ThemeButton/></div><section className="login-card"><Brand subtitle={server?'SERVER':'STUDIO'}/><p className="eyebrow">YOUR SPACE TO CREATE</p><h1>连接你的创作服务</h1><p className="muted">选择最近使用的 Server，或连接新的创作空间。</p><ConnectionForm done={connected}/></section></div>;
}
