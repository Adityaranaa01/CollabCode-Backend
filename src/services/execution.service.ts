import { ApiError } from "../utils/ApiError.js";

const JUDGE0_URL = "https://ce.judge0.com";

const LANGUAGE_MAP: Record<string, number> = {
  javascript: 102,
  typescript: 101,
  python: 109,
  java: 91,
  go: 107,
  rust: 108,
  cpp: 105,
  csharp: 51,
  ruby: 72,
  php: 98,
};

interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  status: { id: number; description: string };
  time: string | null;
  memory: number | null;
}

export function getLanguageId(language: string): number | null {
  return LANGUAGE_MAP[language] ?? null;
}

export function isExecutable(language: string): boolean {
  return language in LANGUAGE_MAP;
}

export async function executeCode(
  language: string,
  sourceCode: string,
  stdin?: string
): Promise<ExecutionResult> {
  const languageId = getLanguageId(language);

  if (!languageId) {
    throw ApiError.badRequest(
      `Language "${language}" is not supported for execution`
    );
  }

  const payload = {
    language_id: languageId,
    source_code: Buffer.from(sourceCode).toString("base64"),
    stdin: stdin ? Buffer.from(stdin).toString("base64") : undefined,
  };

  const response = await fetch(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true&fields=stdout,stderr,compile_output,status,time,memory`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw ApiError.internal(`Code execution service error: ${text}`);
  }

  const result = await response.json() as {
    stdout?: string;
    stderr?: string;
    compile_output?: string;
    status: { id: number; description: string };
    time?: string;
    memory?: number;
  };

  return {
    stdout: result.stdout ? Buffer.from(result.stdout, "base64").toString("utf-8") : null,
    stderr: result.stderr ? Buffer.from(result.stderr, "base64").toString("utf-8") : null,
    compileOutput: result.compile_output
      ? Buffer.from(result.compile_output, "base64").toString("utf-8")
      : null,
    status: result.status,
    time: result.time ?? null,
    memory: result.memory ?? null,
  };
}
