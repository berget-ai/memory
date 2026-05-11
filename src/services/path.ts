import { InvalidPathError } from "../domain/errors";

function normalize(segments: string[]): string {
  const stack: string[] = [];

  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      stack.pop();
    } else {
      stack.push(seg);
    }
  }

  return "/" + stack.join("/");
}

export function resolvePath(currentPath: string, targetPath: string): string {
  if (targetPath.startsWith("/")) {
    return normalize(targetPath.split("/"));
  }

  const currentSegments = currentPath.split("/").filter(Boolean);
  const targetSegments = targetPath.split("/").filter(Boolean);

  return normalize([...currentSegments, ...targetSegments]);
}

export function getParentPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return "/" + segments.join("/");
}

export function getName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export function validatePath(path: string): void {
  if (path.includes("..") || path.includes("~")) {
    throw new InvalidPathError(path);
  }
}
