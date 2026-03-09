import { Popover } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

interface GlossaryTermProps {
  term: string;
  content: ReactNode;
}

export default function GlossaryTerm({ term, content }: GlossaryTermProps) {
  return (
    <Popover trigger="click" content={<div className="glossary-popover">{content}</div>}>
      <button type="button" className="glossary-term" aria-label={term}>
        <span>{term}</span>
        <InfoCircleOutlined />
      </button>
    </Popover>
  );
}
