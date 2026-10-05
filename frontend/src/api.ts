export function errorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const loc =
            "loc" in item && Array.isArray(item.loc)
              ? item.loc.filter((x: unknown) => x !== "body").join(" → ")
              : "";
          return `${loc ? `${loc}: ` : ""}${String(item.msg)}`;
        }
        return "Invalid request";
      })
      .join("; ");
  return "The request could not be completed.";
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(errorMessage(result.detail));
  return result as T;
}
export function isActive(status: string): boolean {
  return status === "queued" || status === "running";
}
export function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
