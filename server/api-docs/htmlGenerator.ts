/**
 * API Documentation HTML Generator
 *
 * Creates a fully-styled, responsive HTML page documenting all API endpoints.
 */

import { apiDocumentation } from "./index";

/**
 * Generate a comprehensive HTML documentation page for the API
 *
 * Creates a fully-styled, responsive HTML page documenting all API endpoints.
 * The page includes:
 * - Visual categorization of endpoints by function
 * - Color-coded HTTP methods (GET, POST, PATCH, etc.)
 * - Parameter documentation with types and requirements
 * - Request/response examples with JSON formatting
 * - Authentication requirements
 * - Implementation notes and security considerations
 * - Mobile-responsive design
 *
 * @returns HTML string containing the complete documentation page
 */
export function generateHTMLDocs(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SkateHubba™ API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
      margin-bottom: 40px;
    }
    header h1 { font-size: 2.5em; margin-bottom: 10px; }
    header p { font-size: 1.2em; opacity: 0.9; }
    .category {
      background: white;
      border-radius: 8px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .category h2 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 1.8em;
    }
    .category > p {
      color: #666;
      margin-bottom: 30px;
    }
    .endpoint {
      border-left: 4px solid #667eea;
      padding: 20px;
      margin-bottom: 30px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }
    .method {
      padding: 6px 12px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.9em;
      color: white;
    }
    .method.GET { background: #10b981; }
    .method.POST { background: #3b82f6; }
    .method.PATCH { background: #f59e0b; }
    .method.PUT { background: #8b5cf6; }
    .method.DELETE { background: #ef4444; }
    .path {
      font-family: 'Courier New', monospace;
      font-size: 1.1em;
      color: #333;
      font-weight: 600;
    }
    .auth-badge {
      background: #fbbf24;
      color: #78350f;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
    }
    .description {
      color: #555;
      margin-bottom: 20px;
      font-size: 1.05em;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-weight: 600;
      color: #667eea;
      margin-bottom: 10px;
      font-size: 1.1em;
    }
    .parameter {
      background: white;
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }
    .param-name {
      font-family: 'Courier New', monospace;
      font-weight: 600;
      color: #667eea;
    }
    .param-type {
      font-family: 'Courier New', monospace;
      color: #666;
      font-size: 0.9em;
    }
    .param-required {
      background: #fee2e2;
      color: #991b1b;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.75em;
      font-weight: 600;
      margin-left: 8px;
    }
    .param-optional {
      background: #e0e7ff;
      color: #3730a3;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.75em;
      font-weight: 600;
      margin-left: 8px;
    }
    pre {
      background: #1f2937;
      color: #e5e7eb;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.9em;
    }
    code {
      font-family: 'Courier New', monospace;
    }
    .response {
      background: white;
      padding: 12px;
      margin-bottom: 12px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }
    .status-code {
      font-weight: 600;
      margin-right: 10px;
    }
    .status-code.success { color: #10b981; }
    .status-code.error { color: #ef4444; }
    .status-code.redirect { color: #f59e0b; }
    .notes {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      border-radius: 4px;
      margin-top: 15px;
    }
    .notes ul {
      margin-left: 20px;
    }
    .notes li {
      margin-bottom: 5px;
    }
    footer {
      text-align: center;
      padding: 40px 20px;
      color: #666;
      border-top: 1px solid #e5e7eb;
      margin-top: 60px;
    }
    @media (max-width: 768px) {
      header h1 { font-size: 1.8em; }
      .endpoint-header { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <h1>🛹 SkateHubba™ API</h1>
    <p>Complete REST API Documentation</p>
  </header>

  <div class="container">
    ${apiDocumentation
      .map(
        (category) => `
      <div class="category">
        <h2>${category.name}</h2>
        <p>${category.description}</p>

        ${category.endpoints
          .map(
            (endpoint) => `
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method ${endpoint.method}">${endpoint.method}</span>
              <span class="path">${endpoint.path}</span>
              ${endpoint.authentication ? `<span class="auth-badge">🔒 ${endpoint.authentication}</span>` : ""}
            </div>

            <div class="description">${endpoint.description}</div>

            ${
              endpoint.parameters && endpoint.parameters.length > 0
                ? `
              <div class="section">
                <div class="section-title">Parameters</div>
                ${endpoint.parameters
                  .map(
                    (param) => `
                  <div class="parameter">
                    <div>
                      <span class="param-name">${param.name}</span>
                      <span class="param-type">${param.type}</span>
                      <span class="${param.required ? "param-required" : "param-optional"}">
                        ${param.required ? "REQUIRED" : "OPTIONAL"}
                      </span>
                    </div>
                    <div style="margin-top: 5px; color: #666; font-size: 0.95em;">
                      ${param.description} <em>(${param.location})</em>
                    </div>
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
                : ""
            }

            ${
              endpoint.requestBody
                ? `
              <div class="section">
                <div class="section-title">Request Body</div>
                <pre><code>${JSON.stringify(endpoint.requestBody.example, null, 2)}</code></pre>
              </div>
            `
                : ""
            }

            <div class="section">
              <div class="section-title">Responses</div>
              ${endpoint.responses
                .map(
                  (response) => `
                <div class="response">
                  <div>
                    <span class="status-code ${response.status < 300 ? "success" : "error"}">
                      ${response.status}
                    </span>
                    <span>${response.description}</span>
                  </div>
                  ${
                    response.example
                      ? `
                    <pre style="margin-top: 10px;"><code>${JSON.stringify(response.example, null, 2)}</code></pre>
                  `
                      : ""
                  }
                </div>
              `
                )
                .join("")}
            </div>

            ${
              endpoint.notes && endpoint.notes.length > 0
                ? `
              <div class="notes">
                <strong>📌 Notes:</strong>
                <ul>
                  ${endpoint.notes.map((note) => `<li>${note}</li>`).join("")}
                </ul>
              </div>
            `
                : ""
            }
          </div>
        `
          )
          .join("")}
      </div>
    `
      )
      .join("")}
  </div>

  <footer>
    <p>SkateHubba™ API Documentation</p>
    <p>Built with ❤️ by Design Mainline LLC</p>
  </footer>
</body>
</html>
  `.trim();
}
