/**
 * API Documentation Types
 */

export interface APIEndpoint {
  method: string;
  path: string;
  description: string;
  authentication?: string;
  parameters?: Array<{
    name: string;
    type: string;
    location: "path" | "query" | "body" | "header";
    required: boolean;
    description: string;
  }>;
  requestBody?: {
    type: string;
    example: any;
  };
  responses: Array<{
    status: number;
    description: string;
    example: any;
  }>;
  notes?: string[];
}

export interface APICategory {
  name: string;
  description: string;
  endpoints: APIEndpoint[];
}
