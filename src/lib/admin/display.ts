/** The item title an order recorded when it was placed. */
export function snapshotTitle(snapshot: string) {
  try {
    return String(JSON.parse(snapshot).title ?? "");
  } catch {
    return "";
  }
}
