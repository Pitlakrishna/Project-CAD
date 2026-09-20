"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconCopy, IconCheck } from "./icons";

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function CodeSnippet({ inline, className, children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeString = String(children).replace(/\n$/, "");

  // If inline code
  if (inline || (!match && !codeString.includes("\n"))) {
    return (
      <code
        className="px-1.5 py-0.5 mx-0.5 rounded bg-[#1c1c1c] text-[#f2c97d] font-mono text-xs border border-[#2e2e2e]"
        {...props}
      >
        {children}
      </code>
    );
  }

  // Do not render Replicad 3D CAD scripts in the chat text response
  const isReplicadScript =
    codeString.includes("replicad") ||
    codeString.includes("export default function main") ||
    codeString.includes("defaultParams") ||
    codeString.includes("drawRoundedRectangle") ||
    codeString.includes("makeCylinder") ||
    codeString.includes("sketchCircle") ||
    codeString.includes("drawCircle") ||
    codeString.includes("makeBox") ||
    codeString.includes("makeSphere") ||
    language === "replicad" ||
    language === "typescript" ||
    language === "ts";

  if (isReplicadScript) {
    // Hide raw CAD code completely from chat message text
    return null;
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#121212] shadow-sm group">
      {/* Code Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181818] border-b border-[#262626] text-[11px] text-[#8e8e8e]">
        <span className="font-mono uppercase font-semibold text-[#a3a3a3]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1 text-[11px] text-[#a3a3a3] hover:text-white px-2 py-0.5 rounded hover:bg-[#262626] transition-colors cursor-pointer"
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <IconCheck className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <IconCopy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-xs font-mono text-[#dcdcdc] leading-relaxed">
        <pre className="m-0">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content text-sm text-[#dcdcdc] leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-white mt-4 mb-2 pb-1 border-b border-[#2b2b2b]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-white mt-3.5 mb-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-[#f0f0f0] mt-3 mb-1">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 mb-2.5 space-y-1 text-[#d8d8d8]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 mb-2.5 space-y-1 text-[#d8d8d8]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#404040] pl-3 py-1 my-2 text-[#a3a3a3] italic bg-[#171717]/40 rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors cursor-pointer"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-[#f4f4f4]">{children}</em>,
          hr: () => <hr className="my-3.5 border-[#282828]" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-[#2b2b2b]">
              <table className="w-full text-xs text-left border-collapse bg-[#141414]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1c1c1c] text-[#f4f4f4] border-b border-[#2b2b2b]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#262626]">{children}</tbody>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-semibold text-[#f4f4f4] border-r border-[#2b2b2b] last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#d1d1d1] border-r border-[#262626] last:border-r-0">
              {children}
            </td>
          ),
          code: (props: any) => <CodeSnippet {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
