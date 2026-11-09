import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/auth/social_auth.dart';
import '../core/config.dart';
import '../core/ui/google_mark.dart';
import '../core/ui/route.dart';
import '../core/ui/social_button.dart';
import 'salon_screen.dart';
import 'signup_screen.dart';

/// First screen: just your email. We email a 6-digit code and a one-tap link; the server finds your salon from the
/// email (one email = one salon). The salon ID + password way and a new salon's free trial are one tap away.
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final pill = OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: c.outlineVariant));
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light, // white status bar over the dark photo
      child: Scaffold(
        backgroundColor: c.surface,
        body: SingleChildScrollView(
          child: Column(children: [
            const _Hero(),
            Transform.translate(
              offset: const Offset(0, -32),
              child: Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(color: c.surface, borderRadius: const BorderRadius.vertical(top: Radius.circular(32))),
                  padding: EdgeInsets.fromLTRB(24, 52, 24, 24 + MediaQuery.paddingOf(context).bottom),
                  child: AutofillGroup(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text(_sent ? 'Check your email' : 'Welcome back', textAlign: TextAlign.center, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4)),
                      const SizedBox(height: 6),
                      Text(
                        _sent
                            ? 'If ${_email.text.trim()} is on a salon\'s team, we sent a code. Tap the link in the email on this phone, or type the code.'
                            : 'Sign in to your salon. No salon ID needed.',
                        textAlign: TextAlign.center,
                        style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant),
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
                        Stack(alignment: Alignment.center, children: [
                          const Divider(),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                            decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(999)),
                            child: Text('OR USE YOUR EMAIL', style: t.labelSmall?.copyWith(color: c.onSurfaceVariant, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
                          ),
                        ]),
                        const SizedBox(height: 18),
                      ],
                      if (!_sent) ...[
                        Padding(padding: const EdgeInsets.only(left: 4, bottom: 6), child: Text('Email', style: t.labelLarge?.copyWith(fontWeight: FontWeight.w700))),
                        TextField(
                          key: const ValueKey('start-email'),
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          enableSuggestions: false,
                          autofillHints: const [AutofillHints.email],
                          textInputAction: TextInputAction.go,
                          onSubmitted: (_) => _send(),
                          decoration: InputDecoration(
                            hintText: 'you@salon.com',
                            prefixIcon: const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.mail_outline_rounded, size: 20)),
                            fillColor: c.surface,
                            contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 18),
                            border: pill,
                            enabledBorder: pill,
                            focusedBorder: pill.copyWith(borderSide: BorderSide(color: c.primary, width: 1.6)),
                          ),
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
                          decoration: InputDecoration(
                            hintText: '6-digit code',
                            hintStyle: TextStyle(fontSize: 16, letterSpacing: 0, color: c.onSurfaceVariant, fontWeight: FontWeight.w400),
                            counterText: '',
                            fillColor: c.surface,
                            border: pill,
                            enabledBorder: pill,
                            focusedBorder: pill.copyWith(borderSide: BorderSide(color: c.primary, width: 1.6)),
                          ),
                        ),
                      Obx(() {
                        final msg = _error ?? auth.linkMessage.value;
                        return msg == null
                            ? const SizedBox(height: 0)
                            : Padding(padding: const EdgeInsets.only(top: 12), child: Text(msg, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)));
                      }),
                      const SizedBox(height: 16),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          boxShadow: [BoxShadow(color: c.primary.withValues(alpha: dark ? 0.25 : 0.32), blurRadius: 20, offset: const Offset(0, 8), spreadRadius: -6)],
                        ),
                        child: FilledButton(
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: const StadiumBorder(), textStyle: t.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w600)),
                          onPressed: _busy ? null : (_sent ? _verify : _send),
                          child: _busy
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                              : Row(mainAxisSize: MainAxisSize.min, children: [
                                  Text(_sent ? 'Sign in' : 'Email me a sign-in code'),
                                  const SizedBox(width: 8),
                                  const Icon(Icons.arrow_forward_rounded, size: 18),
                                ]),
                        ),
                      ),
                      if (_sent) ...[
                        const SizedBox(height: 8),
                        TextButton(onPressed: _busy ? null : _send, child: const Text('Send a new code')),
                        TextButton(onPressed: _busy ? null : _restart, child: const Text('Use a different email')),
                      ] else ...[
                        const SizedBox(height: 12),
                        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(Icons.schedule_rounded, size: 16, color: c.onSurfaceVariant),
                          const SizedBox(width: 6),
                          Flexible(child: Text("We'll email a 6-digit code. Works for 10 minutes.", style: t.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                        ]),
                        const SizedBox(height: 10),
                        TextButton.icon(
                          onPressed: () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const SalonScreen())),
                          icon: const Icon(Icons.verified_user_outlined, size: 18),
                          label: const Text('Use salon ID and password', style: TextStyle(fontWeight: FontWeight.w600)),
                        ),
                      ],
                      const SizedBox(height: 14),
                      _TrialPill(onTap: () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const SignupScreen()))),
                      const SizedBox(height: 18),
                      _Legal(style: t.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                    ]),
                  ),
                ),
                const Positioned(top: -36, child: _Badge()),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// The salon photo with "Your salon. Smarter." on a dark green wash (dark in both themes, so the text stays white).
class _Hero extends StatelessWidget {
  const _Hero();
  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return SizedBox(
      height: 250 + top,
      width: double.infinity,
      child: Stack(fit: StackFit.expand, children: [
        Image.asset('assets/brand/sign-in-hero.jpg', fit: BoxFit.cover, alignment: const Alignment(0.5, 0)),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xF2031D17), Color(0xBF04241D), Color(0x0004241D)],
              stops: [0, 0.5, 1],
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(24, top + 20, 24, 0),
          child: FractionallySizedBox(
            widthFactor: 0.66,
            alignment: Alignment.topLeft,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const _Wordmark(color: Colors.white, size: 17),
              const SizedBox(height: 16),
              const Text('Your salon.\nSmarter.', style: TextStyle(color: Colors.white, fontSize: 28, height: 1.12, fontWeight: FontWeight.w800, letterSpacing: -0.6)),
              const SizedBox(height: 10),
              Text('Bills, staff and daily reports, all in one app.', style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 13, height: 1.35, fontWeight: FontWeight.w500)),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// "SalonKit" with the gold spark.
class _Wordmark extends StatelessWidget {
  const _Wordmark({required this.color, required this.size});
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('SalonKit', style: TextStyle(color: color, fontSize: size, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
        Icon(Icons.auto_awesome, size: size * 0.6, color: const Color(0xFFE6A852)),
      ]);
}

/// The SalonKit logo in a white ring, sitting on the seam between the photo and the sheet.
class _Badge extends StatelessWidget {
  const _Badge();
  @override
  Widget build(BuildContext context) => Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Theme.of(context).colorScheme.surface, width: 3.5),
          boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 14, offset: Offset(0, 4))],
        ),
        child: ClipOval(child: Image.asset('assets/brand/icon.png', fit: BoxFit.cover)),
      );
}

/// "New salon? Start a 7-day free trial" on a soft sage pill.
class _TrialPill extends StatelessWidget {
  const _TrialPill({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? c.onSurface : const Color(0xFF0E523F);
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: LinearGradient(
            colors: dark ? [c.primary.withValues(alpha: 0.16), c.primary.withValues(alpha: 0.28)] : const [Color(0xFFE7F5EC), Color(0xFFD8F0E2)],
          ),
          border: Border.all(color: dark ? c.primary.withValues(alpha: 0.35) : const Color(0xFFD2EDD9)),
        ),
        child: InkWell(
          key: const ValueKey('start-trial'),
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: SizedBox(
            height: 54,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.edit_calendar_outlined, size: 22, color: fg),
              const SizedBox(width: 10),
              Flexible(child: Text('New salon? Start a 7-day free trial', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.onSurface))),
              const SizedBox(width: 6),
              Icon(Icons.arrow_forward_rounded, size: 18, color: fg),
            ]),
          ),
        ),
      ),
    );
  }
}

/// "By continuing you agree to our Terms and Privacy Policy", linking to the site.
class _Legal extends StatelessWidget {
  const _Legal({this.style});
  final TextStyle? style;
  @override
  Widget build(BuildContext context) {
    final link = style?.copyWith(decoration: TextDecoration.underline, color: Theme.of(context).colorScheme.onSurface);
    Widget a(String label, String path) => GestureDetector(
          onTap: () => launchUrl(Uri.https(kRootDomain, path), mode: LaunchMode.externalApplication),
          child: Text(label, style: link),
        );
    return Wrap(alignment: WrapAlignment.center, children: [
      Text('By continuing you agree to our ', style: style),
      a('Terms', '/terms/'),
      Text(' and ', style: style),
      a('Privacy Policy', '/privacy/'),
      Text('.', style: style),
    ]);
  }
}
