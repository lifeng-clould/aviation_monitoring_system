import { Button, Space, Typography } from "antd";
import { useSearchParams } from "react-router-dom";

interface QuickNavItem {
  key: string;
  label: string;
  targetId: string;
}

interface PageQuickNavProps {
  title: string;
  description?: string;
  items: QuickNavItem[];
}

export default function PageQuickNav({ title, items }: PageQuickNavProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get("view") || items[0]?.key || "";

  const switchView = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === items[0]?.key) {
      next.delete("view");
    } else {
      next.set("view", key);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <section className="page-quick-nav">
      <div className="page-quick-nav-head">
        <Typography.Title level={5} style={{ margin: 0, color: "#0f3976" }}>
          {title}
        </Typography.Title>
      </div>
      <Space wrap>
        {items.map((item) => (
          <Button
            key={item.key}
            onClick={() => switchView(item.key)}
            className={`page-quick-nav-button ${activeKey === item.key ? "is-active" : ""}`}
            type={activeKey === item.key ? "primary" : "default"}
          >
            {item.label}
          </Button>
        ))}
      </Space>
    </section>
  );
}
