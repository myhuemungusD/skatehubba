/**
 * Multi-Factor Authentication (MFA) Service
 *
 * Implements TOTP-based two-factor authentication using industry-standard
 * algorithms compatible with Google Authenticator, Authy, 1Password, etc.
 *
 * Features:
 * - TOTP (Time-based One-Time Password) generation and verification
 * - Encrypted secret storage
 * - Backup codes for account recovery
 * - QR code generation for easy setup
 *
 * Security:
 * - Secrets encrypted at rest with AES-256-GCM
 * - Backup codes hashed with bcrypt
 * - 30-second TOTP window with 1-step tolerance
 *
 * @module auth/mfa
 */

import { MfaService } from "./service";

export { MfaService };
export default MfaService;
