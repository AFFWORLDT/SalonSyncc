import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/ui/background.dart';
import '../core/ui/glass.dart';
import '../core/ui/route.dart';
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
    const wide = Size.fromHeight(50);
    return Scaffold(
      body: SkBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(children: [
                SkGlass(
                  padding: const EdgeInsets.all(24),
                  child: AutofillGroup(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Center(child: ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.asset('assets/brand/icon.png', width: 64, height: 64))),
                      const SizedBox(height: 16),
                      Text(_sent ? 'Check your email' : 'Sign in to your salon', textAlign: TextAlign.center, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      Text(
                        _sent
                            ? 'If ${_email.text.trim()} is on a salon\'s team, we sent a code. Tap the link in the email on this phone, or type the code.'
                            : 'Enter your email. We\'ll send you a code, no salon ID needed.',
                        textAlign: TextAlign.center,
                        style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                      ),
                      const SizedBox(height: 20),
                      if (!_sent)
                        TextField(
                          key: const ValueKey('start-email'),
                          controller: _email,
                          autofocus: true,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          enableSuggestions: false,
                          autofillHints: const [AutofillHints.email],
                          textInputAction: TextInputAction.go,
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(labelText: 'Email'),
                        )
                      else
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
                          decoration: const InputDecoration(labelText: '6-digit code', counterText: ''),
                        ),
                      Obx(() {
                        final msg = _error ?? auth.linkMessage.value;
                        return msg == null
                            ? const SizedBox(height: 0)
                            : Padding(padding: const EdgeInsets.only(top: 12), child: Text(msg, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)));
                      }),
                      const SizedBox(height: 20),
                      FilledButton(
                        style: FilledButton.styleFrom(minimumSize: wide),
                        onPressed: _busy ? null : (_sent ? _verify : _send),
                        child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(_sent ? 'Sign in' : 'Continue'),
                      ),
                      if (_sent) ...[
                        TextButton(onPressed: _busy ? null : _send, child: const Text('Send a new code')),
                        TextButton(onPressed: _busy ? null : _restart, child: const Text('Use a different email')),
                      ] else
                        TextButton(
                          onPressed: () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const SalonScreen())),
                          child: const Text('Use salon ID and password'),
                        ),
                    ]),
                  ),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  key: const ValueKey('start-trial'),
                  style: OutlinedButton.styleFrom(minimumSize: wide),
                  onPressed: () => Navigator.of(context).push(SkRoute<void>(builder: (_) => const SignupScreen())),
                  icon: const Icon(Icons.storefront_outlined),
                  label: const Text('New salon? Start a 7-day free trial'),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
