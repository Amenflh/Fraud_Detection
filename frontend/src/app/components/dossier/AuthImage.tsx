"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { authedFetch } from "../../lib/api";
import { fetchDocumentBlob } from "../../lib/dossiers";

function fetchBlob(path: string) {
  return authedFetch(path).then((r) => {
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    return r.blob();
  });
}

/** Files require the bearer token, so they are fetched as blobs rather than <img src>.
 * Pass `docId` for a claim document, or `path` for any other protected image endpoint. */
export default function AuthImage({ docId, path, alt, className }: { docId?: number; path?: string; alt: string; className?: string }) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (path ? fetchBlob(path) : fetchDocumentBlob(docId!))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
      })
      .catch(() => !cancelled && setState({ url: null, failed: true }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId, path]);

  if (state.failed) {
    return (
      <div className={cn("grid place-items-center bg-white/5 text-muted-foreground", className)}>
        <ImageOff className="size-6" />
      </div>
    );
  }
  if (!state.url) return <Skeleton className={className} />;
  // eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image cannot optimize it
  return <img src={state.url} alt={alt} className={cn("object-cover", className)} />;
}

export async function downloadDocument(docId: number, filename: string) {
  const blob = await fetchDocumentBlob(docId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
