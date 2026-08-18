import {
  getAccessPassword,
  handleOptions,
  issueAccessToken,
  parseBody,
  safeEqualText,
  setCors
} from "../server/auth.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST is allowed." });
  }

  try {
    const { password } = parseBody(req);
    const expectedPassword = getAccessPassword();

    if (!safeEqualText(String(password || ""), expectedPassword)) {
      await delay(700);
      return res.status(401).json({ error: "The access password is incorrect." });
    }

    const session = issueAccessToken();
    return res.status(200).json({
      token: session.token,
      expires_in: session.expiresIn
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Authentication failed." });
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
