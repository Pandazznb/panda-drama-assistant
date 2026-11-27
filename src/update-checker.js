import fs from "node:fs";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const APP_VERSION = String(packageJson.version || "0.0.0");
export const APP_REPOSITORY_URL =
  "https://github.com/Pandazznb/panda-drama-assistant";
export const APP_RELEASES_URL = `${APP_REPOSITORY_URL}/releases`;

const LATEST_RELEASE_API =
  "https://api.github.com/repos/Pandazznb/panda-drama-assistant/releases/latest";
const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeVersion(value) {
  const match = String(value || "")
    .trim()
    .match(/^v?(\d+(?:\.\d+){0,3})(?:[-+].*)?$/i);
  return match?.[1] || "";
}

function versionParts(value) {
  return normalizeVersion(value)
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }
  return 0;
}

function updateError(code, message) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = code;
  return error;
}

export class UpdateChecker {
  constructor({
    currentVersion = APP_VERSION,
    repositoryUrl = APP_REPOSITORY_URL,
    releasesUrl = APP_RELEASES_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = () => Date.now(),
  } = {}) {
    this.currentVersion = currentVersion;
    this.repositoryUrl = repositoryUrl;
    this.releasesUrl = releasesUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1_000, Number(timeoutMs) || 0);
    this.now = now;
  }

  info() {
    return {
      version: this.currentVersion,
      repositoryUrl: this.repositoryUrl,
      releasesUrl: this.releasesUrl,
    };
  }

  async check() {
    if (typeof this.fetchImpl !== "function") {
      throw updateError(
        "UPDATE_CHECK_UNAVAILABLE",
        "当前环境无法检查更新。",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(LATEST_RELEASE_API, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "panda-drama-assistant-update-check",
          "x-github-api-version": "2022-11-28",
        },
        signal: controller.signal,
      });
      if (response.status === 404) {
        return {
          ok: true,
          available: false,
          currentVersion: this.currentVersion,
          latestVersion: this.currentVersion,
          releaseUrl: this.releasesUrl,
          publishedAt: null,
          checkedAt: new Date(this.now()).toISOString(),
          message: "GitHub 上暂时没有正式版本。",
        };
      }
      if (!response.ok) {
        throw updateError(
          "UPDATE_CHECK_FAILED",
          `GitHub 返回 HTTP ${response.status}，暂时无法检查更新。`,
        );
      }

      let release;
      try {
        release = await response.json();
      } catch (error) {
        if (error?.name === "AbortError") {
          throw error;
        }
        throw updateError(
          "UPDATE_RESPONSE_INVALID",
          "GitHub 返回的版本信息无法解析。",
        );
      }
      if (!release || typeof release !== "object") {
        throw updateError(
          "UPDATE_RESPONSE_INVALID",
          "GitHub 返回的版本信息格式不正确。",
        );
      }
      const latestVersion = normalizeVersion(
        release.tag_name || release.name || "",
      );
      if (!latestVersion) {
        throw updateError(
          "UPDATE_VERSION_MISSING",
          "GitHub 最新版本缺少版本号。",
        );
      }
      const available =
        compareVersions(latestVersion, this.currentVersion) > 0;
      return {
        ok: true,
        available,
        currentVersion: this.currentVersion,
        latestVersion,
        releaseUrl:
          String(release.html_url || "").startsWith("https://")
            ? String(release.html_url)
            : this.releasesUrl,
        publishedAt: release.published_at || null,
        checkedAt: new Date(this.now()).toISOString(),
        message: available
          ? `发现新版本 ${latestVersion}。`
          : "当前已是最新版本。",
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw updateError(
          "UPDATE_CHECK_TIMEOUT",
          "检查更新超时，请稍后重试。",
        );
      }
      if (error?.statusCode) {
        throw error;
      }
      throw updateError(
        "UPDATE_CHECK_FAILED",
        `检查更新失败：${error?.message || "网络不可用"}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
