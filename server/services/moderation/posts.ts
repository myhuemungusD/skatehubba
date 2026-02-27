/**
 * Moderation Store — Post Creation Helper
 *
 * Thin wrapper used by the posts route and moderation test helpers.
 * Kept here for backwards compatibility with the original moderationStore import path.
 */

import { getDb } from "../../db";
import { posts } from "@shared/schema";

/**
 * Create a post record
 *
 * @param userId - User ID creating the post
 * @param payload - Post content (flexible JSON structure)
 * @returns Created post record
 */
export const createPost = async (userId: string, payload: Record<string, unknown>) => {
  const db = getDb();
  const [post] = await db
    .insert(posts)
    .values({
      userId,
      status: "active",
      content: payload,
    })
    .returning();

  return post;
};
