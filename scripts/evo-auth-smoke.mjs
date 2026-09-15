const base = (process.env.EVO_API_BASE_URL || "https://evo-integracao.w12app.com.br").replace(/\/$/, "");
const path = process.env.EVO_MEMBERS_PATH || "/api/v1/members";
const emailParam = process.env.EVO_MEMBER_EMAIL_QUERY_PARAM || "email";

const profiles = [
  { name: "CONDOR", user: process.env.EVO_CONDOR_API_USERNAME, token: process.env.EVO_CONDOR_API_TOKEN },
  { name: "UMARIZAL", user: process.env.EVO_UMARIZAL_API_USERNAME, token: process.env.EVO_UMARIZAL_API_TOKEN },
].filter(p => p.user && p.token);

if (!profiles.length) {
  console.error("[EVO_SMOKE] no unit credentials configured");
  process.exit(1);
}

let failed = false;
for (const profile of profiles) {
  const url = new URL(path, `${base}/`);
  url.searchParams.set(emailParam, `ec360-smoke-${Date.now()}@invalid.example`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const auth = Buffer.from(`${profile.user}:${profile.token}`).toString("base64");
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
      signal: controller.signal,
      redirect: "error",
    });
    const status = response.status;
    if (status === 401 || status === 403) {
      failed = true;
      console.error(`[EVO_SMOKE] ${profile.name}: AUTH_FAIL HTTP_${status}`);
    } else if (status >= 500) {
      failed = true;
      console.error(`[EVO_SMOKE] ${profile.name}: SERVICE_FAIL HTTP_${status}`);
    } else {
      console.log(`[EVO_SMOKE] ${profile.name}: AUTH_REACHABLE HTTP_${status}`);
    }
  } catch (error) {
    failed = true;
    console.error(`[EVO_SMOKE] ${profile.name}: NETWORK_FAIL ${error?.name || "Error"}`);
  } finally {
    clearTimeout(timeout);
  }
}

if (failed) process.exit(1);
console.log("[EVO_SMOKE] all configured unit credentials reached EVO without auth failure");
