import 'package:flutter/material.dart';
import 'auth_layout.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';

/// "Forgot password?": a code to the email on their staff profile, then a new password; signed in with it after.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final auth = Get.find<AuthController>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _pass = TextEditingController();
  bool _sent = false, _busy = false, _show = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _pass.dispose();
    super.dispose();
  }

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

  Future<void> _send() async {
    if (!_email.text.contains('@')) return setState(() => _error = 'Enter the email on your staff profile');
    await _run(() async {
      await auth.requestCode(_email.text);
      if (mounted) setState(() => _sent = true);
    });
  }

  Future<void> _reset() async {
    if (_code.text.replaceAll(RegExp(r'\s'), '').length != 6) return setState(() => _error = 'Enter the 6-digit code from the email');
    if (_pass.text.length < 6) return setState(() => _error = 'New password: at least 6 characters');
    await _run(() => auth.resetPassword(_email.text, _code.text, _pass.text));
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    return SkAuthLayout(
      badge: Image.asset('assets/brand/icon.png', fit: BoxFit.cover),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Reset your password', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4)),
                  const SizedBox(height: 6),
                  Text(
                    _sent ? 'If ${_email.text.trim()} is on your staff profile, a code is on its way. Enter it and choose a new password.' : "We'll email a code to the address on your staff profile.",
                    style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    key: const ValueKey('fp-email'),
                    controller: _email,
                    readOnly: _sent,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  if (_sent) ...[
                    const SizedBox(height: 12),
                    TextField(
                      key: const ValueKey('fp-code'),
                      controller: _code,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      maxLength: 7,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w600),
                      decoration: const InputDecoration(labelText: '6-digit code', counterText: ''),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      key: const ValueKey('fp-pass'),
                      controller: _pass,
                      obscureText: !_show,
                      autofillHints: const [AutofillHints.newPassword],
                      onSubmitted: (_) => _reset(),
                      decoration: InputDecoration(
                        labelText: 'New password',
                        suffixIcon: IconButton(
                          tooltip: _show ? 'Hide password' : 'Show password',
                          icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                          onPressed: () => setState(() => _show = !_show),
                        ),
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    onPressed: _busy ? null : (_sent ? _reset : _send),
                    child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(_sent ? 'Save and sign in' : 'Email me a code'),
                  ),
                  if (_sent) TextButton(onPressed: _busy ? null : _send, child: const Text('Send a new code')),
                ]),
    );
  }
}
