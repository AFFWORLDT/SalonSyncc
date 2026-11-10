import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/auth/social_auth.dart';
import '../core/ui/google_mark.dart';
import '../core/ui/route.dart';
import '../core/ui/social_button.dart';
import 'auth_layout.dart';
import 'salon_screen.dart';
import 'signup_screen.dart';

/// First screen: just your email. We email a 6-digit code and a one-tap link; the server finds your salon from the
/// email (one email = one salon). The salon ID + password way and creating a new salon are one tap away.
class EmailStartScreen extends StatefulWidget {
  const EmailStartScreen({super.key});
  @override
  State<EmailStartScreen> createState() => _EmailStartScreenState();
}

class _EmailStartScreenState extends State<EmailStartScreen> {
  final auth = Get.find<AuthController>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() job) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    auth.linkMessage.value = null;
    try {
      await job();
    } on Offline {
      if (mounted) setState(() => _error = "You're offline");
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  SocialAuth? get _social => Get.isRegistered<SocialAuth>() ? Get.find<SocialAuth>() : null;

  /// Google / Apple: signed in when the email is on a team; a new email goes on to start a salon.
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

  Future<void> _send() async {
    final email = _email.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) {
      setState(() => _error = 'Enter your email address');
      return;
    }
    await _run(() async {
      await auth.requestEmailCode(email);
      if (mounted) setState(() => _sent = true);
    });
  }

  Future<void> _verify() async {
    if (_code.text.replaceAll(RegExp(r'\s'), '').length != 6) {
      setState(() => _error = 'Enter the 6-digit code from the email');
      return;
    }
    await _run(() => auth.signInWithEmailCode(_email.text, _code.text));
  }

  void _restart() => setState(() {
        _sent = false;
        _error = null;
        _code.clear();
      });

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    return SkAuthLayout(
      badge: Image.asset('assets/brand/icon.png', fit: BoxFit.cover),
      child: AutofillGroup(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SkAuthTitle(
            title: _sent ? 'Check your email' : 'Welcome back',
            subtitle: _sent
                ? 'If ${_email.text.trim()} is on a salon\'s team, we sent a code. Tap the link in the email on this phone, or type the code.'
                : 'Sign in to your salon. No salon ID needed.',
          ),
          const SizedBox(height: 22),
          if (!_sent && _social != null) ...[
            SkSocialButton(
              key: const ValueKey('start-google'),
              label: 'Continue with Google',
              icon: const GoogleMark(size: 20),
              onPressed: _busy ? null : () => _socially((s) => s.google()),
            ),
            if (_social!.appleAvailable) ...[
              const SizedBox(height: 12),
              SkSocialButton(
                key: const ValueKey('start-apple'),
                label: 'Continue with Apple',
                icon: const Icon(Icons.apple, size: 22),
                onPressed: _busy ? null : () => _socially((s) => s.apple()),
              ),
            ],
            const SizedBox(height: 20),
            const SkPillDivider('Or use your email'),
            const SizedBox(height: 18),
          ],
          if (!_sent) ...[
            const SkFieldLabel('Email'),
            TextField(
              key: const ValueKey('start-email'),
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _send(),
              decoration: skPillDecoration(context, hint: 'you@salon.com', icon: Icons.mail_outline_rounded),
            ),
          ] else
            TextField(
              key: const ValueKey('start-code'),
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: 7,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w600),
              onSubmitted: (_) => _verify(),
              decoration: skPillDecoration(context, hint: '6-digit code', hintStyle: TextStyle(fontSize: 16, letterSpacing: 0, color: c.onSurfaceVariant, fontWeight: FontWeight.w400)),
            ),
          Obx(() {
            final msg = _error ?? auth.linkMessage.value;
            return msg == null
                ? const SizedBox(height: 0)
                : Padding(padding: const EdgeInsets.only(top: 12), child: Text(msg, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)));
          }),
          const SizedBox(height: 16),
          SkPrimaryPill(label: _sent ? 'Sign in' : 'Email me a sign-in code', busy: _busy, onPressed: _sent ? _verify : _send),
          if (_sent) ...[
            const SizedBox(height: 8),
            TextButton(onPressed: _busy ? null : _send, child: const Text('Send a new code')),
            TextButton(onPressed: _busy ? null : _restart, child: const Text('Use a different email')),
          ] else ...[
            const SizedBox(height: 12),
            const SkNote(icon: Icons.schedule_rounded, text: "We'll email a 6-digit code. Works for 10 minutes."),
            const SizedBox(height: 10),
            TextButton.icon(
              onPressed: () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const SalonScreen())),
              icon: const Icon(Icons.verified_user_outlined, size: 18),
              label: const Text('Use salon ID and password', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
          const SizedBox(height: 14),
          SkSoftPill(
            key: const ValueKey('start-trial'),
            icon: Icons.edit_calendar_outlined,
            label: 'New salon? Create your salon',
            onTap: () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const SignupScreen())),
          ),
          const SizedBox(height: 18),
          const SkLegal(),
        ]),
      ),
    );
  }
}
