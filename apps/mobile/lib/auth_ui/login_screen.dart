import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/auth/social_auth.dart';
import '../core/ui/google_mark.dart';
import '../core/ui/social_button.dart';
import 'auth_layout.dart';
import 'signup_screen.dart';
import '../core/ui/route.dart';
import 'forgot_password_screen.dart';
import '../core/ui/salon_logo.dart';

/// Sign in, branded with the chosen salon so it feels like the salon's own app.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final auth = Get.find<AuthController>();
  final _user = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  bool _show = false;
  String? _error;

  // Sign in with a code emailed to the staff member instead of a password: email first, then the 6 digits.
  bool _codeMode = false;
  bool _codeSent = false;
  String? _notice;
  final _email = TextEditingController();
  final _code = TextEditingController();

  @override
  void dispose() {
    _user.dispose();
    _pass.dispose();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  void _switchMode() => setState(() {
        _codeMode = !_codeMode;
        _codeSent = false;
        _error = null;
        _notice = null;
        _code.clear();
      });

  Future<void> _run(Future<void> Function() job) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await job();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  SocialAuth? get _social => Get.isRegistered<SocialAuth>() ? Get.find<SocialAuth>() : null;

  /// Google / Apple, same as the first screen: signed in to the salon the email is on; a new email starts a salon.
  Future<void> _socially(Future<String?> Function(SocialAuth s) sheet) async {
    final s = _social;
    if (s == null) return;
    await _run(() async {
      final String? token;
      try {
        token = await sheet(s);
      } on SocialAuthError catch (e) {
        if (mounted) setState(() => _error = e.message);
        return;
      }
      if (token == null) return; // closed the sheet
      final fresh = await auth.socialSignIn(token);
      if (fresh != null && mounted) {
        await Navigator.of(context).push(SkRoute<void>(builder: (_) => SignupScreen(social: fresh)));
      }
    });
  }

  Future<void> _sendCode() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'Enter the email on your staff profile');
      return;
    }
    await _run(() async {
      await auth.requestCode(email);
      if (mounted) {
        setState(() {
          _codeSent = true;
          _notice = 'If $email is on your staff profile, a 6-digit code is on its way. It works for 10 minutes.';
        });
      }
    });
  }

  Future<void> _submitCode() async {
    if (_code.text.replaceAll(RegExp(r'\s'), '').length != 6) {
      setState(() => _error = 'Enter the 6-digit code from the email');
      return;
    }
    await _run(() => auth.signInWithCode(_email.text, _code.text));
  }

  Future<void> _submit() async {
    if (_busy) return;
    if (_user.text.trim().isEmpty || _pass.text.isEmpty) {
      setState(() => _error = 'Enter your email or username, and your password');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.signIn(_user.text, _pass.text);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = auth.salon.value!;
    final t = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return SkAuthLayout(
      badge: Hero(tag: 'salon-logo', child: SalonLogo(slug: s.slug, name: s.name, logoUrl: s.logoUrl, size: 72)),
      child: AutofillGroup(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SkAuthTitle(
            title: _codeSent ? 'Check your email' : 'Sign in to ${s.name}',
            subtitle: _codeMode ? 'We\'ll email you a 6-digit code instead of a password.' : 'Use your staff email or username.',
          ),
          const SizedBox(height: 22),
          if (!_codeMode && _social != null) ...[
            SkSocialButton(
              key: const ValueKey('login-google'),
              label: 'Continue with Google',
              icon: const GoogleMark(size: 20),
              onPressed: _busy ? null : () => _socially((s) => s.google()),
            ),
            if (_social!.appleAvailable) ...[
              const SizedBox(height: 12),
              SkSocialButton(
                key: const ValueKey('login-apple'),
                label: 'Continue with Apple',
                icon: const Icon(Icons.apple, size: 22),
                onPressed: _busy ? null : () => _socially((s) => s.apple()),
              ),
            ],
            const SizedBox(height: 12),
            SkSocialButton(
              key: const ValueKey('login-code-mode'),
              label: 'Email me a sign-in code',
              icon: const Icon(Icons.mail_outline_rounded, size: 22),
              onPressed: _busy ? null : _switchMode,
            ),
            const SizedBox(height: 20),
            const SkPillDivider('Or use your password'),
            const SizedBox(height: 18),
          ],
          if (!_codeMode) ...[
            const SkFieldLabel('Email or username'),
            TextField(
              key: const ValueKey('login-user'),
              controller: _user,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.username],
              textInputAction: TextInputAction.next,
              decoration: skPillDecoration(context, hint: 'you@salon.com or ali', icon: Icons.person_outline_rounded),
            ),
            const SizedBox(height: 14),
            const SkFieldLabel('Password'),
            TextField(
              key: const ValueKey('login-pass'),
              controller: _pass,
              obscureText: !_show,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              decoration: skPillDecoration(
                context,
                hint: 'Your password',
                icon: Icons.lock_outline_rounded,
                suffix: IconButton(
                  tooltip: _show ? 'Hide password' : 'Show password',
                  icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                  onPressed: () => setState(() => _show = !_show),
                ),
              ),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                key: const ValueKey('login-forgot'),
                onPressed: _busy ? null : () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const ForgotPasswordScreen())),
                child: const Text('Forgot password?'),
              ),
            ),
            const SizedBox(height: 4),
            SkPrimaryPill(label: 'Sign in', busy: _busy, onPressed: _submit),
          ] else ...[
            const SkFieldLabel('Email'),
            TextField(
              key: const ValueKey('login-email'),
              controller: _email,
              readOnly: _codeSent,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _codeSent ? null : _sendCode(),
              decoration: skPillDecoration(context, hint: 'you@salon.com', icon: Icons.mail_outline_rounded),
            ),
            if (_codeSent) ...[
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('login-code'),
                controller: _code,
                autofocus: true,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: 7,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w600),
                onSubmitted: (_) => _submitCode(),
                decoration: skPillDecoration(context, hint: '6-digit code', hintStyle: TextStyle(fontSize: 16, letterSpacing: 0, color: c.onSurfaceVariant, fontWeight: FontWeight.w400)),
              ),
            ],
            if (_notice != null && _error == null) ...[
              const SizedBox(height: 12),
              Text(_notice!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            ],
            const SizedBox(height: 16),
            SkPrimaryPill(label: _codeSent ? 'Sign in' : 'Email me a code', busy: _busy, onPressed: _codeSent ? _submitCode : _sendCode),
            if (_codeSent) TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Send a new code')),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)),
          ],
          const SizedBox(height: 8),
          // With Google shown, the code has its own button at the top; going back to the password stays here.
          if (_codeMode || _social == null)
            TextButton(
              onPressed: _busy ? null : _switchMode,
              child: Text(_codeMode ? 'Sign in with your password instead' : 'Sign in with an email code instead'),
            ),
          const SizedBox(height: 6),
          SkSoftPill(icon: Icons.storefront_outlined, label: 'Not your salon? Choose another', onTap: () => auth.switchSalon()),
          const SizedBox(height: 18),
          const SkLegal(),
        ]),
      ),
    );
  }
}
