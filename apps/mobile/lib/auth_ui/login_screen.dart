import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/ui/background.dart';
import '../core/ui/glass.dart';
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
      setState(() => _error = 'Enter your username and password');
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
    return Scaffold(
      body: SkBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: SkGlass(
                padding: const EdgeInsets.all(24),
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Center(child: Hero(tag: 'salon-logo', child: SalonLogo(slug: s.slug, name: s.name, logoUrl: s.logoUrl, size: 64))),
                    const SizedBox(height: 16),
                    Text('Sign in to ${s.name}', textAlign: TextAlign.center, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 24),
                    if (!_codeMode) ...[
                    TextField(
                      controller: _user,
                      autocorrect: false,
                      enableSuggestions: false,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Username'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _pass,
                      obscureText: !_show,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        suffixIcon: IconButton(
                          tooltip: _show ? 'Hide password' : 'Show password',
                          icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                          onPressed: () => setState(() => _show = !_show),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                      onPressed: _busy ? null : _submit,
                      child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in'),
                    ),
                    ] else ...[
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
                      decoration: const InputDecoration(labelText: 'Email'),
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
                        decoration: const InputDecoration(labelText: '6-digit code', counterText: ''),
                      ),
                    ],
                    if (_notice != null && _error == null) ...[
                      const SizedBox(height: 12),
                      Text(_notice!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                      onPressed: _busy ? null : (_codeSent ? _submitCode : _sendCode),
                      child: _busy
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_codeSent ? 'Sign in' : 'Email me a code'),
                    ),
                    if (_codeSent) TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Send a new code')),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)),
                    ],
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : _switchMode,
                      child: Text(_codeMode ? 'Sign in with your password instead' : 'Sign in with an email code instead'),
                    ),
                    TextButton(onPressed: () => auth.switchSalon(), child: const Text('Not your salon?')),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
