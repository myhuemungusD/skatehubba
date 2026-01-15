import type { Express } from 'express';
import { AuthService } from './service.ts';
import { authenticateUser, recordRecentAuth } from './middleware.ts';
import { authLimiter } from '../middleware/rateLimit.ts';
import { requireCsrfToken } from '../middleware/csrf.ts';
import { admin } from '../admin.ts';
import { AuditLogger, getClientIP } from './audit.ts';
import { LockoutService } from './lockout.ts';
import { MfaService } from './mfa.ts';

/**
 * Setup authentication routes for Firebase-based authentication
 * 
 * Configures endpoints for:
 * - Login/Registration with Firebase ID token
 * - Current user information retrieval
 * - Logout and session management
 * 
 * @param app - Express application instance
 */
export function setupAuthRoutes(app: Express) {
  // Single login/register endpoint - Firebase ID token only (with rate limiting)
  app.post('/api/auth/login', authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    
    try {
      const authHeader = req.headers.authorization ?? '';

      if (!authHeader.startsWith('Bearer ')) {
        await AuditLogger.logLoginFailure(null, ipAddress, userAgent, 'Missing Firebase ID token');
        return res.status(401).json({ error: 'Authentication failed' });
      }

      const idToken = authHeader.slice('Bearer '.length).trim();

      try {
        let decoded;
        // Handle mock tokens ONLY in development mode (no Firebase configured)
        // SECURITY: Mock tokens are blocked in production
        const isMockToken = idToken === 'mock-guest-token' || idToken === 'mock-google-token' || idToken === 'mock-token';
        const isDevelopment = process.env.NODE_ENV !== 'production';
        
        if (isMockToken && isDevelopment) {
          // Use deterministic UIDs so that subsequent logins find the existing user
          const isGoogle = idToken.includes('google');
          decoded = {
            uid: isGoogle ? 'mock-google-uid-12345' : 'mock-guest-uid-12345',
            email: isGoogle ? 'google@skatehubba.local' : 'guest@skatehubba.local',
            name: isGoogle ? 'Google Skater' : 'Guest Skater'
          };
        } else if (isMockToken && !isDevelopment) {
          // Block mock tokens in production
          await AuditLogger.logLoginFailure(null, ipAddress, userAgent, 'Mock token rejected in production');
          return res.status(401).json({ error: 'Authentication failed' });
        } else {
          // Verify Firebase ID token (without revocation check for better reliability)
          decoded = await admin.auth().verifyIdToken(idToken);
        }
        
        // Check for account lockout before proceeding
        const email = decoded.email || '';
        if (email) {
          const lockoutStatus = await LockoutService.checkLockout(email);
          if (lockoutStatus.isLocked && lockoutStatus.unlockAt) {
            await AuditLogger.logLoginFailure(email, ipAddress, userAgent, 'Account locked');
            return res.status(429).json({ 
              error: LockoutService.getLockoutMessage(lockoutStatus.unlockAt),
              code: 'ACCOUNT_LOCKED',
              unlockAt: lockoutStatus.unlockAt.toISOString(),
            });
          }
        }
        
        const uid = decoded.uid;
        const { firstName, lastName, isRegistration } = req.body;

        // Find or create user record
        let user = await AuthService.findUserByFirebaseUid(uid);

        if (!user) {
          // Create new user from Firebase token data
          const { user: newUser } = await AuthService.createUser({
            email: decoded.email || `user${uid.slice(0,8)}@firebase.local`,
            password: 'firebase-auth-user', // Placeholder
            firstName: firstName || decoded.name?.split(' ')[0] || 'User',
            lastName: lastName || decoded.name?.split(' ').slice(1).join(' ') || '',
            firebaseUid: uid,
          });
          user = newUser;
        }

        // Create session token for API access
        const { token: sessionJwt } = await AuthService.createSession(user.id);

        // Update last login
        await AuthService.updateLastLogin(user.id);
        
        // Clear any failed login attempts on success
        if (email) {
          await LockoutService.recordAttempt(email, ipAddress, true);
        }

        // Log successful login
        await AuditLogger.logLoginSuccess(
          user.id,
          user.email,
          ipAddress,
          userAgent,
          'firebase'
        );

        // Set HttpOnly cookie (XSS-safe, auto-sent with requests)
        res.cookie('sessionToken', sessionJwt, {
          httpOnly: true,       // JavaScript can't access (XSS protection)
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'lax',      // CSRF protection
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/',
        });

        return res.status(200).json({
          user: {
            id: user.id,
            email: user.email,
            displayName: `${user.firstName} ${user.lastName}`.trim(),
            photoUrl: decoded.picture || null,
            roles: [],
            createdAt: user.createdAt,
            provider: 'firebase',
          },
          strategy: 'firebase',
          // NOTE: Token is in HttpOnly cookie, not returned in response for security
        });
      } catch (firebaseError) {
        console.error('Firebase ID token verification failed:', firebaseError);
        await AuditLogger.logLoginFailure(null, ipAddress, userAgent, 'Invalid Firebase token');
        return res.status(401).json({ error: 'Authentication failed' });
      }
    } catch (error) {
      console.error('Login error:', error);
      await AuditLogger.logLoginFailure(null, ipAddress, userAgent, 'Internal server error');
      return res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Get current user endpoint
  app.get('/api/auth/me', authenticateUser, async (req, res) => {
    try {
      const user = req.currentUser!;
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        error: 'Failed to get user information',
      });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    const user = req.currentUser!;
    
    try {
      // Delete session from cookie or Authorization header
      const sessionToken = req.cookies?.sessionToken;
      const authHeader = req.headers.authorization;
      
      if (sessionToken) {
        await AuthService.deleteSession(sessionToken);
      } else if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        await AuthService.deleteSession(token);
      }

      // Log the logout event
      await AuditLogger.logLogout(user.id, user.email, ipAddress, userAgent);

      // Clear the HttpOnly cookie
      res.clearCookie('sessionToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        error: 'Logout failed',
      });
    }
  });

  // =========================================================================
  // MFA (Multi-Factor Authentication) Routes
  // =========================================================================

  /**
   * Check if user has MFA enabled
   */
  app.get('/api/auth/mfa/status', authenticateUser, async (req, res) => {
    try {
      const user = req.currentUser!;
      const enabled = await MfaService.isEnabled(user.id);
      
      res.json({ 
        enabled,
        userId: user.id,
      });
    } catch (error) {
      console.error('MFA status error:', error);
      res.status(500).json({ error: 'Failed to check MFA status' });
    }
  });

  /**
   * Initiate MFA setup - returns secret and QR code URL
   */
  app.post('/api/auth/mfa/setup', authenticateUser, requireCsrfToken, async (req, res) => {
    try {
      const user = req.currentUser!;
      
      // Check if MFA is already enabled
      const isEnabled = await MfaService.isEnabled(user.id);
      if (isEnabled) {
        return res.status(400).json({ 
          error: 'MFA is already enabled. Disable it first to set up again.',
          code: 'MFA_ALREADY_ENABLED',
        });
      }
      
      const setup = await MfaService.initiateSetup(user.id, user.email);
      
      res.json({
        secret: setup.secret,
        qrCodeUrl: setup.qrCodeUrl,
        backupCodes: setup.backupCodes,
        message: 'Scan the QR code with your authenticator app, then verify with a code.',
      });
    } catch (error) {
      console.error('MFA setup error:', error);
      res.status(500).json({ error: 'Failed to initiate MFA setup' });
    }
  });

  /**
   * Complete MFA setup by verifying first code
   */
  app.post('/api/auth/mfa/verify-setup', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    
    try {
      const user = req.currentUser!;
      const { code } = req.body;
      
      if (!code || typeof code !== 'string' || code.length !== 6) {
        return res.status(400).json({ 
          error: 'Valid 6-digit code required',
          code: 'INVALID_CODE_FORMAT',
        });
      }
      
      const success = await MfaService.verifySetup(
        user.id,
        user.email,
        code,
        ipAddress,
        userAgent
      );
      
      if (success) {
        res.json({
          success: true,
          message: 'MFA has been enabled successfully.',
        });
      } else {
        res.status(400).json({
          error: 'Invalid verification code. Please try again.',
          code: 'INVALID_CODE',
        });
      }
    } catch (error) {
      console.error('MFA verify setup error:', error);
      res.status(500).json({ error: 'Failed to verify MFA setup' });
    }
  });

  /**
   * Verify MFA code during login
   */
  app.post('/api/auth/mfa/verify', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    
    try {
      const user = req.currentUser!;
      const { code, isBackupCode } = req.body;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ 
          error: 'Code is required',
          code: 'MISSING_CODE',
        });
      }
      
      let success: boolean;
      
      if (isBackupCode) {
        success = await MfaService.verifyBackupCode(
          user.id,
          user.email,
          code,
          ipAddress,
          userAgent
        );
      } else {
        success = await MfaService.verifyCode(
          user.id,
          user.email,
          code,
          ipAddress,
          userAgent
        );
      }
      
      if (success) {
        res.json({
          success: true,
          message: 'MFA verification successful.',
        });
      } else {
        res.status(401).json({
          error: 'Invalid code. Please try again.',
          code: 'INVALID_CODE',
        });
      }
    } catch (error) {
      console.error('MFA verify error:', error);
      res.status(500).json({ error: 'MFA verification failed' });
    }
  });

  /**
   * Disable MFA for user
   */
  app.post('/api/auth/mfa/disable', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    
    try {
      const user = req.currentUser!;
      const { code } = req.body;
      
      // Require current MFA code to disable
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ 
          error: 'Current MFA code required to disable',
          code: 'MISSING_CODE',
        });
      }
      
      const isValid = await MfaService.verifyCode(
        user.id,
        user.email,
        code,
        ipAddress,
        userAgent
      );
      
      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid MFA code',
          code: 'INVALID_CODE',
        });
      }
      
      await MfaService.disable(user.id, user.email, ipAddress, userAgent);
      
      res.json({
        success: true,
        message: 'MFA has been disabled.',
      });
    } catch (error) {
      console.error('MFA disable error:', error);
      res.status(500).json({ error: 'Failed to disable MFA' });
    }
  });

  /**
   * Regenerate backup codes
   */
  app.post('/api/auth/mfa/backup-codes', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    
    try {
      const user = req.currentUser!;
      const { code } = req.body;
      
      // Require current MFA code to regenerate backup codes
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ 
          error: 'Current MFA code required',
          code: 'MISSING_CODE',
        });
      }
      
      const isValid = await MfaService.verifyCode(
        user.id,
        user.email,
        code,
        ipAddress,
        userAgent
      );
      
      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid MFA code',
          code: 'INVALID_CODE',
        });
      }
      
      const backupCodes = await MfaService.regenerateBackupCodes(
        user.id,
        user.email,
        ipAddress,
        userAgent
      );
      
      if (!backupCodes) {
        return res.status(400).json({
          error: 'MFA is not enabled',
          code: 'MFA_NOT_ENABLED',
        });
      }
      
      res.json({
        success: true,
        backupCodes,
        message: 'New backup codes generated. Please save them securely.',
      });
    } catch (error) {
      console.error('MFA backup codes error:', error);
      res.status(500).json({ error: 'Failed to regenerate backup codes' });
    }
  });

  // =========================================================================
  // Password Management Routes
  // =========================================================================

  /**
   * Change password (authenticated users)
   * Invalidates all other sessions for security
   */
  app.post('/api/auth/change-password', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    const sessionToken = req.cookies?.sessionToken;
    
    try {
      const user = req.currentUser!;
      const { currentPassword, newPassword } = req.body;
      
      // Validate input
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({
          error: 'Password must be at least 8 characters',
          code: 'INVALID_PASSWORD',
        });
      }
      
      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return res.status(400).json({
          error: 'Password must contain uppercase, lowercase, and number',
          code: 'WEAK_PASSWORD',
        });
      }
      
      const result = await AuthService.changePassword(
        user.id,
        currentPassword || '',
        newPassword,
        sessionToken
      );
      
      if (!result.success) {
        return res.status(400).json({
          error: result.message,
          code: 'PASSWORD_CHANGE_FAILED',
        });
      }
      
      // Log the password change
      await AuditLogger.logPasswordChanged(user.id, user.email, ipAddress, userAgent);
      
      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: 'Password change failed' });
    }
  });

  /**
   * Request password reset (unauthenticated)
   */
  app.post('/api/auth/forgot-password', authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      // Generate reset token (returns null if user not found, but we don't reveal this)
      const resetToken = await AuthService.generatePasswordResetToken(email);
      
      // Log the request (internally track if user exists)
      await AuditLogger.logPasswordResetRequested(email, ipAddress, !!resetToken);
      
      // TODO: Send email with reset link
      // if (resetToken) {
      //   await sendPasswordResetEmail(email, resetToken);
      // }
      
      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account with that email exists, you will receive a password reset link.',
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  /**
   * Reset password with token (unauthenticated)
   */
  app.post('/api/auth/reset-password', authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    
    try {
      const { token, newPassword } = req.body;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Reset token is required' });
      }
      
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({
          error: 'Password must be at least 8 characters',
          code: 'INVALID_PASSWORD',
        });
      }
      
      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return res.status(400).json({
          error: 'Password must contain uppercase, lowercase, and number',
          code: 'WEAK_PASSWORD',
        });
      }
      
      const user = await AuthService.resetPassword(token, newPassword);
      
      if (!user) {
        // Generic error to prevent token enumeration
        return res.status(400).json({
          error: 'Invalid or expired reset link. Please request a new one.',
          code: 'INVALID_TOKEN',
        });
      }
      
      // Log the password reset
      await AuditLogger.logPasswordChanged(user.id, user.email, ipAddress);
      await AuditLogger.logSessionsInvalidated(user.id, user.email, ipAddress, 'password_reset');
      
      res.json({
        success: true,
        message: 'Password has been reset successfully. All sessions have been logged out.',
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Password reset failed' });
    }
  });

  // =========================================================================
  // Re-authentication for Sensitive Operations
  // =========================================================================

  /**
   * Verify identity for sensitive operations
   * Call this before operations that require recent authentication
   * Valid for 5 minutes after successful verification
   */
  app.post('/api/auth/verify-identity', authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || undefined;
    
    try {
      const user = req.currentUser!;
      const { password, mfaCode } = req.body;
      
      // Check if MFA is enabled
      const mfaEnabled = await MfaService.isEnabled(user.id);
      
      if (mfaEnabled) {
        // If MFA is enabled, require MFA code
        if (!mfaCode || typeof mfaCode !== 'string') {
          return res.status(400).json({
            error: 'MFA code required for identity verification',
            code: 'MFA_REQUIRED',
            mfaEnabled: true,
          });
        }
        
        const mfaValid = await MfaService.verifyCode(
          user.id,
          user.email,
          mfaCode,
          ipAddress,
          userAgent
        );
        
        if (!mfaValid) {
          return res.status(401).json({
            error: 'Invalid MFA code',
            code: 'INVALID_MFA',
          });
        }
      } else {
        // If no MFA, require password (for non-Firebase users)
        // Firebase users can use their Firebase ID token as proof
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          // Firebase user - verify their token is fresh
          try {
            const token = authHeader.substring(7);
            const decoded = await admin.auth().verifyIdToken(token);
            
            // Check if token was issued recently (within 5 minutes)
            const authTime = decoded.auth_time ? decoded.auth_time * 1000 : 0;
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            
            if (authTime < fiveMinutesAgo) {
              return res.status(401).json({
                error: 'Please sign in again to continue',
                code: 'STALE_TOKEN',
              });
            }
          } catch (err) {
            return res.status(401).json({
              error: 'Identity verification failed',
              code: 'INVALID_TOKEN',
            });
          }
        } else if (password) {
          // Traditional password verification
          const dbUser = await AuthService.findUserById(user.id);
          
          if (dbUser && dbUser.passwordHash !== 'firebase-auth-user') {
            const isValid = await AuthService.verifyPassword(password, dbUser.passwordHash);
            
            if (!isValid) {
              return res.status(401).json({
                error: 'Invalid password',
                code: 'INVALID_PASSWORD',
              });
            }
          }
        } else {
          return res.status(400).json({
            error: 'Password required for identity verification',
            code: 'PASSWORD_REQUIRED',
          });
        }
      }
      
      // Record successful re-authentication
      recordRecentAuth(user.id);
      
      await AuditLogger.log({
        eventType: 'AUTH_REAUTH_SUCCESS' as any,
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        success: true,
      });
      
      res.json({
        success: true,
        message: 'Identity verified. You can proceed with sensitive operations.',
        expiresIn: 5 * 60, // 5 minutes in seconds
      });
    } catch (error) {
      console.error('Identity verification error:', error);
      res.status(500).json({ error: 'Identity verification failed' });
    }
  });
}
