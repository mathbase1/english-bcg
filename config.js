/*
  After Vercel gives you the permanent production domain, replace the placeholder below.
  Example: https://english-bcg.vercel.app
  This is not a secret. Never place OPENAI_API_KEY or the access password in this file.
*/
window.ENGLISH_MARKER_CONFIG = Object.freeze({
  backendBaseUrl:
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? window.location.origin
      : "ff"
});
