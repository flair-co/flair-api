import {Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {Profile, Strategy, VerifyCallback} from 'passport-google-oauth20';

import {ConfigurationService} from '@core/config/config.service';
import {AuthMethodService} from '@modules/auth-method/auth-method.service';
import {AuthMethodType} from '@modules/auth-method/constants/auth-method.enum';
import {UserService} from '@modules/user/user.service';

/**
 * Implements the Passport strategy for Google OAuth 2.0 authentication.
 * Handles the verification of the user profile received from Google,
 * finds or creates the corresponding user profile and Google authentication method
 * in the local database, and returns the authenticated User object.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigurationService,
    private readonly userService: UserService,
    private readonly authMethodService: AuthMethodService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get('API_BASE_URL') + configService.get('GOOGLE_CALLBACK_PATH'),
      scope: ['email', 'profile'],
    });
  }

  /**
   * Validates the user profile received from Google after successful authentication.
   * This method is automatically called by Passport during the OAuth callback phase.
   * It attempts to find an existing user linked to the Google ID, or creates a new one.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(
        new UnauthorizedException('Could not retrieve email from Google profile.'),
        false,
      );
    }

    const existingAuthMethod = await this.authMethodService.findByProvider(
      AuthMethodType.GOOGLE,
      profile.id,
    );
    if (existingAuthMethod) {
      return done(null, existingAuthMethod.user);
    }

    let user = await this.userService.findByEmail(email);

    if (user) {
      await this.authMethodService.createOAuthMethod(user.id, profile.id, AuthMethodType.GOOGLE);
      if (!user.isEmailVerified) {
        user = await this.userService.update(user.id, {isEmailVerified: true});
      }
    } else {
      user = await this.userService.save(profile.displayName, email, true);
      await this.authMethodService.createOAuthMethod(user.id, profile.id, AuthMethodType.GOOGLE);
    }

    return done(null, user);
  }
}
