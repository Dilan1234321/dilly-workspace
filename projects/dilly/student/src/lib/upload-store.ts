// Module-level singleton — survives client-side navigation within the same session.
// The File object cannot be serialized, so it lives here instead of sessionStorage.

let pendingFile: File | null = null;

export function setPendingFile(file: File | null): void {
  pendingFile = file;
}

export function getPendingFile(): File | null {
  return pendingFile;
}
