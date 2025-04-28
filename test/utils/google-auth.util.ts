import {Profile} from 'passport-google-oauth20';

const now = Math.floor(Date.now() / 1000);

export const defaultMockGoogleProfile: Profile = {
  id: 'google123456789',
  displayName: 'Test User',
  name: {familyName: 'User', givenName: 'Test'},
  emails: [{value: 'verified@example.com', verified: true}],
  photos: [{value: 'https://example.com/photo.jpg'}],
  provider: 'google',
  profileUrl: 'https://plus.google.com/google123456789',
  _raw: JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: 'client-id.apps.googleusercontent.com',
    sub: 'google123456789',
    email: 'verified@example.com',
    email_verified: true,
    at_hash: 'hash_value',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    picture: 'https://example.com/photo.jpg',
    locale: 'en',
    iat: now,
    exp: now + 3600,
  }),
  _json: {
    iss: 'https://accounts.google.com',
    aud: 'client-id.apps.googleusercontent.com',
    sub: 'google123456789',
    email: 'verified@example.com',
    email_verified: true,
    at_hash: 'hash_value',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    picture: 'https://example.com/photo.jpg',
    locale: 'en',
    iat: now,
    exp: now + 3600,
  },
};

export type GoogleProfileArgs = {
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
};
export function createMockGoogleProfile({
  id,
  email,
  name,
  givenName,
  familyName,
}: GoogleProfileArgs): Profile {
  const now = Math.floor(Date.now() / 1000);
  return {
    ...defaultMockGoogleProfile,
    id,
    displayName: name,
    emails: [{value: email, verified: true}],
    name: {familyName, givenName},
    _raw: JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: 'client-id.apps.googleusercontent.com',
      sub: id,
      email,
      email_verified: true,
      at_hash: 'hash_value',
      name,
      given_name: givenName,
      family_name: familyName,
      picture: 'https://example.com/photo.jpg',
      locale: 'en',
      iat: now,
      exp: now + 3600,
    }),
    _json: {
      iss: 'https://accounts.google.com',
      aud: 'client-id.apps.googleusercontent.com',
      sub: id,
      email,
      email_verified: true,
      at_hash: 'hash_value',
      name,
      given_name: givenName,
      family_name: familyName,
      picture: 'https://example.com/photo.jpg',
      locale: 'en',
      iat: now,
      exp: now + 3600,
    },
  };
}

export const mockTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};
