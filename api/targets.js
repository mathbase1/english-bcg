import fs from "node:fs";
import path from "node:path";
import { handleOptions, parseBody, requireAccess, setCors } from "../server/auth.js";
import { callOpenAI } from "../server/openai.js";

let cachedTargets = null;

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST is allowed." });
  }
  if (!requireAccess(req, res)) return;

  try {
    const body = parseBody(req);
    const paper = String(body?.paper || "");
    const results = Array.isArray(body?.results) ? body.results.slice(0, 4) : [];

    if (!results.length || results.some((entry) => !["ok", "local", "blank"].includes(entry?.status))) {
      return res.status(400).json({ error: "Mark every question successfully before generating targets." });
    }

    const allTargets = loadTargets();
    const candidates = buildCandidatePool(allTargets, paper, results);
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        heading: { type: "string" },
        targets: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              code: { type: "string" },
              name: { type: "string" },
              reason: { type: "string" },
              action: { type: "string" }
            },
            required: ["code", "name", "reason", "action"]
          }
        }
      },
      required: ["heading", "targets"]
    };

    const generated = await callOpenAI({
      model: process.env.OPENAI_TARGET_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: TARGET_INSTRUCTIONS,
      input: buildTargetPrompt(paper, results, candidates),
      schemaName: "century_targets",
      schema,
      maxOutputTokens: 1000
    });

    const validated = validateTargets(generated, candidates);
    return res.status(200).json(validated);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: error?.message || "Unexpected target-generation error.",
      retry_after_seconds: error?.retryAfter || undefined
    });
  }
}

const TARGET_INSTRUCTIONS = `You are an English teacher assigning CENTURY nuggets after an AQA-style GCSE English Language practice paper.
Use only the supplied examiner feedback and the supplied candidate nugget list.
Select exactly four unique nuggets that address the most important weaknesses across the paper.
Prioritise the lowest-scoring assessment objectives and recurring gaps. Choose a balanced set rather than four near-duplicates.
Each code and name must exactly match an item in the candidate list. Never invent or alter a code.
For each target, explain briefly why it fits the feedback and give one concrete action the student should complete in CENTURY or their next practice response.
Return only the required JSON.`;

function buildTargetPrompt(paper, results, candidates) {
  const feedback = results.map((entry, index) => {
    const result = entry?.result || {};
    const question = entry?.question || {};
    return [
      `Q${index + 1}: ${question.questionType || "question"}; AO ${question.assessmentObjective || "unknown"}; ${result.score || 0}/${result.max_score || question.markCategory || 0}; ${result.level || ""}`,
      `Weaknesses: ${(Array.isArray(result.weaknesses) ? result.weaknesses : []).join(" | ")}`,
      `Next step: ${result.next_level || ""}`
    ].join("\n");
  }).join("\n\n");

  const list = candidates.map((item) => `${item.code} | ${item.name} | ${item.topic}`).join("\n");
  return `Paper: ${paper}\n\nEXAMINER FEEDBACK\n${feedback}\n\nALLOWED CENTURY NUGGETS\n${list}`;
}

function loadTargets() {
  if (cachedTargets) return cachedTargets;
  const filename = path.join(process.cwd(), "data", "century-nuggets.json");
  const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
  cachedTargets = Array.isArray(parsed?.targets) ? parsed.targets : [];
  return cachedTargets;
}

function buildCandidatePool(allTargets, paper, results) {
  const requested = new Set();
  const feedbackText = JSON.stringify(results).toLowerCase();

  const add = (...codes) => codes.forEach((code) => requested.add(code));
  add("EN1.01", "EN1.02", "EN1.03", "EN8.02", "EN8.03", "EN8.04");

  for (const entry of results) {
    const type = String(entry?.question?.questionType || "");
    const ao = String(entry?.question?.assessmentObjective || "");

    if (type === "select-true-statements" || ao.includes("AO1")) {
      add("EN1.01", "EN1.02", "EN1.03");
    }
    if (type === "summary-compare") {
      add("EN1.04", "EN1.05", "EN6.04", "EN10.08", "EN10.09");
    }
    if (type === "language-analysis" || ao.includes("AO2")) {
      add("EN6.01", "EN6.03", "EN4.01", "EN4.02", "EN4.03", "EN4.05", "EN4.13", "EN4.15", "EN4.19", "EN4.20", "EN2.24", "EN2.25");
    }
    if (type === "structure-analysis") {
      add("EN5.01", "EN5.02", "EN5.03", "EN5.04", "EN5.05", "EN5.06", "EN6.02");
    }
    if (type === "evaluation") {
      add("EN7.01", "EN7.02", "EN7.03", "EN7.04", "EN10.04");
    }
    if (type === "compare-perspectives" || ao.includes("AO3")) {
      add("EN6.04", "EN1.04", "EN1.05", "EN7.02", "EN7.03", "EN10.11");
    }
    if (type === "creative-writing") {
      add("EN3.01", "EN3.02", "EN3.03", "EN3.15", "EN3.16", "EN3.19", "EN3.23", "EN5.02", "EN5.03", "EN5.05", "EN8.01", "EN8.02", "EN8.03", "EN8.04", "EN9.08", "EN10.05", "EN10.06");
    }
    if (type === "viewpoint-writing") {
      add("EN3.05", "EN3.07", "EN3.09", "EN3.11", "EN3.12", "EN3.13", "EN3.14", "EN3.21", "EN3.22", "EN3.23", "EN3.24", "EN8.01", "EN8.02", "EN8.03", "EN8.04", "EN9.01", "EN9.02", "EN9.04", "EN10.12");
    }
  }

  if (feedbackText.includes("quotation") || feedbackText.includes("evidence") || feedbackText.includes("reference")) {
    add("EN1.02", "EN7.03");
  }
  if (feedbackText.includes("structure") || feedbackText.includes("whole-text") || feedbackText.includes("organisation")) {
    add("EN5.01", "EN5.02", "EN5.03", "EN5.05");
  }
  if (feedbackText.includes("punctuation") || feedbackText.includes("sentence") || feedbackText.includes("spelling") || feedbackText.includes("technical")) {
    add("EN8.03", "EN8.04");
  }

  if (paper.includes("Paper 1")) add("EN10.01", "EN10.02", "EN10.04", "EN10.05", "EN10.06", "EN11.01");
  if (paper.includes("Paper 2")) add("EN10.07", "EN10.08", "EN10.09", "EN10.11", "EN10.12", "EN11.02");

  const selected = allTargets.filter((item) => requested.has(item.code));
  if (selected.length >= 12) return selected.slice(0, 42);
  return allTargets.filter((item) => requested.has(item.code) || item.topic === "Writing skills").slice(0, 42);
}

function validateTargets(value, candidates) {
  const byCode = new Map(candidates.map((item) => [item.code, item]));
  const chosen = [];
  const seen = new Set();

  for (const item of Array.isArray(value?.targets) ? value.targets : []) {
    const canonical = byCode.get(String(item?.code || "").trim());
    if (!canonical || seen.has(canonical.code)) continue;
    seen.add(canonical.code);
    chosen.push({
      code: canonical.code,
      name: canonical.name,
      topic: canonical.topic,
      reason: clean(item?.reason || "This nugget addresses a priority identified in the examiner feedback."),
      action: clean(item?.action || `Complete ${canonical.name} and apply it in the next practice response.`)
    });
    if (chosen.length === 4) break;
  }

  for (const canonical of candidates) {
    if (chosen.length === 4) break;
    if (seen.has(canonical.code)) continue;
    seen.add(canonical.code);
    chosen.push({
      code: canonical.code,
      name: canonical.name,
      topic: canonical.topic,
      reason: "This nugget supports a core skill assessed in the paper.",
      action: `Complete ${canonical.name} and use the skill in the next practice response.`
    });
  }

  return {
    heading: clean(value?.heading || "Your CENTURY Nugget targets"),
    targets: chosen.slice(0, 4)
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
