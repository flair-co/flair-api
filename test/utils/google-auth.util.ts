import {Profile} from 'passport-google-oauth20';

export const mockTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
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

  const jsonData = {
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
  };

  return {
    id,
    displayName: name,
    name: {familyName, givenName},
    emails: [{value: email, verified: true}],
    photos: [{value: 'https://example.com/photo.jpg'}],
    provider: 'google',
    profileUrl: `https://plus.google.com/${id}`,
    _raw: JSON.stringify(jsonData),
    _json: jsonData,
  };
}
