/**
 * Standardized API response wrappers.
 *
 * All controllers should use these to ensure consistent response shapes
 * across the application.
 *
 * Single item:  { success: true, data }
 * List:         { success: true, data, count }
 * Paginated:    { success: true, data, count, page, limit, totalPages }
 * Message:      { success: true, message }
 */

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiListResponse<T> extends ApiResponse<T[]> {
  count: number;
}

export interface ApiPaginatedResponse<T> extends ApiListResponse<T> {
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiMessageResponse {
  success: true;
  message: string;
}

export function apiResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function apiListResponse<T>(data: T[]): ApiListResponse<T> {
  return { success: true, data, count: data.length };
}

export function apiPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): ApiPaginatedResponse<T> {
  return {
    success: true,
    data,
    count: data.length,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function apiMessageResponse(message: string): ApiMessageResponse {
  return { success: true, message };
}
