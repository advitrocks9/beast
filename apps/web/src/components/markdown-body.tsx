import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const baseComponents: Components = {
  table: ({ children }) => (
    <div className="doc-table">
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function MarkdownBody({
  source,
  components,
}: {
  source: string;
  components?: Components;
}) {
  return (
    <div className="doc-body">
      <Markdown remarkPlugins={[remarkGfm]} components={{ ...baseComponents, ...components }}>
        {source}
      </Markdown>
    </div>
  );
}
