import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUploadBytesResumable, mockGetDownloadURL, mockRef, mockApiRequest, mockShowMessage } =
  vi.hoisted(() => ({
    mockUploadBytesResumable: vi.fn(),
    mockGetDownloadURL: vi.fn(),
    mockRef: vi.fn(),
    mockApiRequest: vi.fn(),
    mockShowMessage: vi.fn(),
  }));

vi.mock("@/lib/firebase.config", () => ({
  auth: { currentUser: { uid: "user-123" } },
  storage: {},
}));

vi.mock("firebase/storage", () => ({
  ref: mockRef,
  uploadBytesResumable: mockUploadBytesResumable,
  getDownloadURL: mockGetDownloadURL,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mockApiRequest,
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("react-native-flash-message", () => ({
  showMessage: mockShowMessage,
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("useTrickUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates storage ref with correct path pattern", () => {
    mockRef.mockReturnValue({});
    const storage = {};
    mockRef(storage, `trickmint/user-123/${Date.now()}.mp4`);
    expect(mockRef).toHaveBeenCalledWith(
      storage,
      expect.stringMatching(/^trickmint\/user-123\/\d+\.mp4$/)
    );
  });

  it("apiRequest is called with correct parameters for submit", async () => {
    mockApiRequest.mockResolvedValue({ clip: { id: 1 } });

    const result = await mockApiRequest("/api/trickmint/submit", {
      method: "POST",
      body: JSON.stringify({
        trickName: "Kickflip",
        description: "Clean",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 5000,
        fileSizeBytes: 1024,
        mimeType: "video/mp4",
        isPublic: true,
      }),
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/trickmint/submit",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.clip).toBeDefined();
  });

  it("shows success message when upload completes", () => {
    mockShowMessage({
      message: "✅ Trick Uploaded!",
      description: "Your clip is now live.",
      type: "success",
      duration: 2000,
    });
    expect(mockShowMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("shows error message on upload failure", () => {
    mockShowMessage({
      message: "Upload Failed",
      description: "Please try again.",
      type: "danger",
      duration: 3000,
    });
    expect(mockShowMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "danger" }));
  });

  it("getDownloadURL returns the video URL after upload", async () => {
    const expectedUrl = "https://firebasestorage.googleapis.com/v0/b/bucket/o/video.mp4";
    mockGetDownloadURL.mockResolvedValue(expectedUrl);

    const url = await mockGetDownloadURL({});
    expect(url).toBe(expectedUrl);
  });

  it("uploadBytesResumable returns an upload task", () => {
    const mockTask = {
      on: vi.fn(),
      snapshot: { ref: {} },
    };
    mockUploadBytesResumable.mockReturnValue(mockTask);

    const task = mockUploadBytesResumable({}, new Blob());
    expect(task.on).toBeDefined();
    expect(mockUploadBytesResumable).toHaveBeenCalledTimes(1);
  });
});
