import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import googleOauthConfig from '../config/google-oauth.config';
import type { ConfigType } from '@nestjs/config';
import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { UserRole } from 'src/generated/prisma/enums';
import { User } from 'src/generated/prisma/client';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(googleOauthConfig.KEY)
    private googleConfiguration: ConfigType<typeof googleOauthConfig>,
    private authService: AuthService
  ) {
    super({
      clientID: googleConfiguration.clientID,
      clientSecret: googleConfiguration.clientSecret,
      callbackURL: googleConfiguration.callbackURL,
      scope: ['email', 'profile'], // the data we need to get back from the google API
    });
  }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
    console.log('profile..', profile)
    const user = await this.authService.validateGoogleUser({
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      email: profile.emails[0].value,
      passwordHash: null, 
    //   NOTE: Make passwordHash nullable in the Prisma schema (passwordHash String?) and pass null for OAuth-created users.
    //   avatarUrl: profile.photos[0].value,
      role: UserRole.USER,
    //   isSocialAuth: true
    })
    // return user;
    done(null, user ?? false) // first arg: error object, second arg: user arg that will be passed to the request object.

    // to check if the user is registered in the db, if not we create a record in the db
  }
}