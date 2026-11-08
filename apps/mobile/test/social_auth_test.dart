import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:salonkit/core/auth/social_auth.dart';

void main() {
  test('a real cancel is quiet; a setup problem reported as a cancel is shown', () {
    expect(googleClosedByUser(GoogleSignInExceptionCode.canceled, 'activity is cancelled by the user.'), isTrue);
    expect(googleClosedByUser(GoogleSignInExceptionCode.canceled, null), isTrue);
    expect(googleClosedByUser(GoogleSignInExceptionCode.interrupted, 'x'), isTrue);
    expect(googleClosedByUser(GoogleSignInExceptionCode.canceled, '[16] Account reauth failed.'), isFalse);
    expect(googleErrorText(GoogleSignInExceptionCode.canceled, '[16] Account reauth failed.'), contains("isn't set up for this version"));
    expect(googleErrorText(GoogleSignInExceptionCode.unknownError, 'boom'), "Google sign-in didn't work: boom");
  });
}
