/**
 * Authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './error-handler';
import { HTTP_STATUS, ERROR_CODES, ResearcherRole, AccountStatus } from '@ariadne/shared';

export interface AuthRequest extends Request {
  researcher?: {
    id: string;
    email: string;
    role: ResearcherRole;
    status: AccountStatus;
  };
  participant?: {
    id: string;
  };
}

/**
 * Verify researcher JWT token
 */
export function authenticateResearcher(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'No token provided'
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    const decoded = jwt.verify(token, config.jwt.secret) as {
      researcherId: string;
      email: string;
      role: ResearcherRole;
      status: AccountStatus;
    };

    // Check account status
    if (decoded.status === AccountStatus.SUSPENDED) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Account suspended'
      );
    }

    req.researcher = {
      id: decoded.researcherId,
      email: decoded.email,
      role: decoded.role || ResearcherRole.RESEARCHER, // Default for legacy tokens
      status: decoded.status || AccountStatus.ACTIVE // Default for legacy tokens
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_EXPIRED,
        'Token expired'
      ));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_TOKEN,
        'Invalid token'
      ));
    } else {
      next(error);
    }
  }
}

/**
 * Require specific role(s) - must be used after authenticateResearcher
 */
export function requireRole(...roles: ResearcherRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.researcher) {
      return next(new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Not authenticated'
      ));
    }

    if (!roles.includes(req.researcher.role)) {
      return next(new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        `Requires role: ${roles.join(' or ')}`
      ));
    }

    next();
  };
}

/**
 * Require admin role - convenience middleware
 */
export const requireAdmin = requireRole(ResearcherRole.ADMIN);

/**
 * Verify participant session token
 */
export function authenticateParticipant(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'No token provided'
      );
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, config.jwt.secret) as {
      participantId: string;
    };

    req.participant = {
      id: decoded.participantId
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_EXPIRED,
        'Session expired'
      ));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_TOKEN,
        'Invalid session'
      ));
    } else {
      next(error);
    }
  }
}

/**
 * Generate JWT token for researcher
 */
export function generateResearcherToken(
  researcherId: string,
  email: string,
  role: ResearcherRole = ResearcherRole.RESEARCHER,
  status: AccountStatus = AccountStatus.ACTIVE
): string {
  return jwt.sign(
    { researcherId, email, role, status },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Generate session token for participant
 */
export function generateParticipantToken(participantId: string): string {
  return jwt.sign(
    { participantId },
    config.jwt.secret,
    { expiresIn: '7d' as jwt.SignOptions['expiresIn'] } // Participants get longer sessions
  );
}
