# Releasing

1. Move the "Unreleased" section of `CHANGELOG.md` under the new version and date.
2. Set the version in `package.json` (and `src/version.ts`, which the user agent reports).
3. Commit, then tag that commit `v<version>`, such as `v0.1.1`, and push the tag.
4. The tag's workflow runs the tests again and publishes `@websitescreenshotworld/sdk` to npm through trusted
   publishing, with a provenance statement. No token is stored anywhere.

The libraries for the other languages share the version number, so a change made in all of them is released at
the same version in each.
