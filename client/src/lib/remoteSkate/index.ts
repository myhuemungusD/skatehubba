/**
 * Remote S.K.A.T.E. Module
 *
 * Video-verified remote SKATE battles.
 *
 * @module lib/remoteSkate
 */

export { RemoteSkateService } from "./remoteSkateService";
export type {
  GameDoc,
  RoundDoc,
  VideoDoc,
  GameStatus,
  RoundStatus,
  RoundResult,
  VideoRole,
  VideoStatus,
} from "./remoteSkateService";

export {
  validateVideo,
  uploadVideo,
  type VideoUploadParams,
  type VideoUploadCallbacks,
  type VideoValidationResult,
} from "./videoUpload";
