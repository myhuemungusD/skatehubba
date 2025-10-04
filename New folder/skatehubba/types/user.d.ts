export interface User {
  id: string;
  username: string;
  avatar: string;
  isVerified: boolean;
  sponsors: string[];
  spotsSkated: number;
  clips: number;
  followers: number;
  following: number;
  bio: string;
}
