const API_URL = import.meta.env.VITE_API_URL || getDefaultApiUrl();

function getDefaultApiUrl() {
  if (!import.meta.env.DEV) return "";
  if (typeof window === "undefined") return "http://localhost:4000";

  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  return request("/upload", {
    method: "POST",
    body: formData
  });
}

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}
