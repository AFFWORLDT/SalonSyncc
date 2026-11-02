import { ApiError, errorMessage } from "./api";

/** Toast text for a staff save; the plan's staff limit (409 staff_limit) gets a clear upgrade hint. */
export function staffError(err: unknown, maxStaff: number | null): string {
  if (err instanceof ApiError && err.code === "staff_limit")
    return maxStaff === null ? "Staff limit reached for your plan" : `Your plan allows ${maxStaff} active staff. Upgrade your plan to add more.`;
  return errorMessage(err);
}
