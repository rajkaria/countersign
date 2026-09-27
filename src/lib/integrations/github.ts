import { z } from "zod";
import { boundedJson, type Fetcher } from "./http";
import { commitment } from "../domain/receipt";
const inputSchema = z.object({
  owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
  repo: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
    .refine((s) => s !== "." && s !== ".."),
  number: z.number().int().positive(),
  token: z.string().optional(),
});
const pullSchema = z.object({
  number: z.number().int(),
  title: z.string().max(1000),
  state: z.enum(["open", "closed"]),
  merged: z.boolean(),
  merged_at: z.string().nullable(),
  updated_at: z.string(),
  user: z.object({ login: z.string().max(100) }),
  html_url: z.string().url(),
});
/** Read-only repository-scoped retrieval. Never interprets contributor text as authorization. */
export async function githubPullRequest(
  input: z.infer<typeof inputSchema>,
  fetcher: Fetcher = fetch,
) {
  const p = inputSchema.parse(input);
  const url = `https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.number}`;
  const response = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(p.token ? { Authorization: `Bearer ${p.token}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  const source = pullSchema.parse(await boundedJson(response));
  if (
    source.number !== p.number ||
    source.html_url !==
      `https://github.com/${p.owner}/${p.repo}/pull/${p.number}`
  )
    throw new Error("GitHub evidence target mismatch");
  const observedAt = new Date().toISOString();
  return {
    kind: "activity" as const,
    provider: "github",
    sourceUrl: source.html_url,
    title: source.title,
    actor: source.user.login,
    merged: source.merged,
    mergedAt: source.merged_at,
    updatedAt: source.updated_at,
    observedAt,
    hash: commitment(source),
    acceptance: false as const,
  };
}
