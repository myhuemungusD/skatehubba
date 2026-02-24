/**
 * VideoUploader - File picker + progress bar + validation UI
 *
 * Handles file selection, shows validation errors inline,
 * displays upload progress, and supports retry on failure.
 */

import { useRef, useState, useCallback } from "react";
import { Upload, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Progress } from "../ui/progress";
import { cn } from "@/lib/utils";

interface VideoUploaderProps {
  onFileSelected: (file: File) => Promise<void>;
  uploadProgress: number | null;
  isUploading: boolean;
  disabled?: boolean;
  label?: string;
}

export function VideoUploader({
  onFileSelected,
  uploadProgress,
  isUploading,
  disabled = false,
  label = "Upload Video",
}: VideoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setLocalError(null);
      setUploadDone(false);
      setFileName(file.name);

      try {
        await onFileSelected(file);
        setUploadDone(true);
      } catch (err) {
        // Error is handled via toast in the hook, but show local state too
        setLocalError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [onFileSelected]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const isDisabled = disabled || isUploading;

  return (
    <div className="w-full space-y-3">
      {/* Drop zone / file picker */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer",
          dragActive && !isDisabled
            ? "border-yellow-400 bg-yellow-400/5"
            : "border-neutral-700 hover:border-neutral-500",
          isDisabled && "opacity-50 cursor-not-allowed",
          uploadDone && !isUploading && "border-green-500/50 bg-green-500/5"
        )}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label="Upload video file"
        onDragEnter={isDisabled ? undefined : handleDrag}
        onDragLeave={isDisabled ? undefined : handleDrag}
        onDragOver={isDisabled ? undefined : handleDrag}
        onDrop={isDisabled ? undefined : handleDrop}
        onClick={() => !isDisabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!isDisabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={handleInputChange}
          disabled={isDisabled}
        />

        {isUploading ? (
          <RefreshCw className="h-8 w-8 text-yellow-400 animate-spin" />
        ) : uploadDone ? (
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        ) : (
          <Upload className="h-8 w-8 text-neutral-400" />
        )}

        <span className="text-sm text-neutral-300">
          {isUploading ? "Uploading..." : uploadDone ? "Upload complete" : label}
        </span>

        {!isUploading && !uploadDone && (
          <span className="text-xs text-neutral-500">
            MP4, MOV, or WebM. Max 100MB, 60 seconds.
          </span>
        )}

        {fileName && (
          <span className="text-xs text-neutral-400 truncate max-w-[200px]">{fileName}</span>
        )}
      </div>

      {/* Progress bar */}
      {isUploading && uploadProgress !== null && (
        <div className="space-y-1">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-neutral-400 text-center">{uploadProgress}%</p>
        </div>
      )}

      {/* Error */}
      {localError && (
        <div className="flex items-start gap-2 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{localError}</span>
        </div>
      )}
    </div>
  );
}
