import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DEMO_USERS } from "../constants/demoUsers";
import { useAuthStore } from "../store/useAuthStore";

const ROLE_OPTIONS = [
  { value: "机场运控", label: "机场运控" },
  { value: "地服公司", label: "地服公司" },
  { value: "航空公司", label: "航空公司" },
  { value: "监管审计", label: "监管审计" }
];

interface AuthFormState {
  username: string;
  password: string;
  display_name: string;
  role: string;
  org_name: string;
}

const INITIAL_FORM: AuthFormState = {
  username: "",
  password: "",
  display_name: "",
  role: ROLE_OPTIONS[0].value,
  org_name: ""
};

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [errorText, setErrorText] = useState("");
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM);
  const { loginWithPassword, registerAccount, loading, switchRole } = useAuthStore();

  const updateField = (key: keyof AuthFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    if (!form.username.trim() || !form.password.trim()) {
      return "请输入账号和密码";
    }
    if (mode === "register") {
      if (!form.display_name.trim()) return "请输入姓名";
      if (!form.org_name.trim()) return "请输入所属主体";
      if (!form.role.trim()) return "请选择账号角色";
    }
    return "";
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setErrorText(validationError);
      return;
    }
    setErrorText("");
    try {
      if (mode === "login") {
        const response = await loginWithPassword({ username: form.username, password: form.password, account: form.username });
        navigate((location.state as { from?: string } | null)?.from || response.user.home_path || "/workspace", { replace: true });
      } else {
        const response = await registerAccount({
          username: form.username,
          password: form.password,
          display_name: form.display_name,
          role: form.role,
          org_name: form.org_name
        });
        navigate(response.user.home_path || "/workspace", { replace: true });
      }
    } catch (error) {
      setErrorText((error as Error).message || "账号操作失败");
    }
  };

  const enterDemo = (role: string) => {
    switchRole(role);
    navigate("/workspace", { replace: true });
  };

  return (
    <div className="auth-stage">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="section-kicker">账号入口</span>
          <h1 className="auth-title">机坪牵引作业监管平台</h1>
          <p className="auth-subtitle">支持账号登录，也支持直接进入演示工作台。</p>
        </div>

        <div className="auth-card-shell auth-card-shell-plain">
          <div className="auth-card-head auth-card-head-plain">
            <div className="auth-segmented">
              <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>登录</button>
              <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => setMode("register")}>注册</button>
            </div>
            <div className="auth-chip-row">
              <span className="auth-chip">链上留痕</span>
              <span className="auth-chip">多主体协同</span>
            </div>
          </div>

          <form className="auth-native-form" onSubmit={onSubmit}>
            {mode === "register" ? (
              <>
                <label className="auth-field">
                  <span>姓名</span>
                  <input value={form.display_name} onChange={(event) => updateField("display_name", event.target.value)} placeholder="例如：王磊" />
                </label>
                <label className="auth-field">
                  <span>所属主体</span>
                  <input value={form.org_name} onChange={(event) => updateField("org_name", event.target.value)} placeholder="例如：机场运控中心" />
                </label>
                <label className="auth-field">
                  <span>账号角色</span>
                  <select value={form.role} onChange={(event) => updateField("role", event.target.value)}>
                    {ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </>
            ) : null}

            <label className="auth-field">
              <span>账号</span>
              <input value={form.username} onChange={(event) => updateField("username", event.target.value)} placeholder="请输入账号" autoComplete="username" />
            </label>
            <label className="auth-field">
              <span>密码</span>
              <input type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="请输入密码" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </label>

            {errorText ? <div className="auth-error-banner">{errorText}</div> : null}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "处理中..." : mode === "login" ? "进入平台" : "创建账号"}
            </button>
          </form>

          <div className="auth-demo-strip auth-demo-strip-plain">
            <span>直接进入演示</span>
            {DEMO_USERS.map((item) => (
              <button key={item.role} type="button" className="auth-demo-role" onClick={() => enterDemo(item.role)}>
                {item.role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
