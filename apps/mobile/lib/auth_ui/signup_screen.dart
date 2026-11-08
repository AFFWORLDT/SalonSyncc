import 'dart:async';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/config.dart';
import '../core/ui/background.dart';
import '../core/ui/glass.dart';

/// The countries a new salon can start in (the server's COUNTRY_DEFAULTS: currency, time zone, phone code).
const kSignupCountries = <(String, String)>[
  ('AE', 'United Arab Emirates'),
  ('SA', 'Saudi Arabia'),
  ('QA', 'Qatar'),
  ('KW', 'Kuwait'),
  ('OM', 'Oman'),
  ('BH', 'Bahrain'),
  ('IN', 'India'),
  ('PK', 'Pakistan'),
  ('BD', 'Bangladesh'),
  ('EG', 'Egypt'),
  ('GB', 'United Kingdom'),
  ('US', 'United States'),
];

/// A suggested salon ID from its name: "Super Salon & Spa" -> "super-salon-spa".
String slugFromName(String name) {
  final s = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');
  return s.length > 30 ? s.substring(0, 30).replaceAll(RegExp(r'-+$'), '') : s;
}

/// A new salon from the phone: 7 days free, signed in as its owner straight away (the web's sign-up, same server).
class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});
  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final auth = Get.find<AuthController>();
  final _salon = TextEditingController();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _slug = TextEditingController();
  final _pass = TextEditingController();
  late String _country;
  bool _slugEdited = false;
  bool _show = false;
  bool _busy = false;
  String? _error;
  String? _slugNote; // null = not checked yet; '' = available
  Timer? _debounce;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    final region = PlatformDispatcher.instance.locale.countryCode?.toUpperCase();
    _country = kSignupCountries.any((c) => c.$1 == region) ? region! : 'AE';
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_salon, _name, _email, _phone, _slug, _pass]) {
      c.dispose();
    }
    super.dispose();
  }

  void _salonChanged(String v) {
    if (_slugEdited) return;
    _slug.text = slugFromName(v);
    _checkSlugSoon();
  }

  void _checkSlugSoon() {
    _debounce?.cancel();
    setState(() => _slugNote = null);
    final s = normalizeSlug(_slug.text);
    if (s.isEmpty) return;
    if (!isValidSlug(s)) {
      setState(() => _slugNote = '3–30 letters, numbers or dashes');
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      final seq = ++_seq;
      String? note;
      try {
        final p = await auth.slugProblem(s);
        note = switch (p) { null => '', 'invalid' => '3–30 letters, numbers or dashes', 'reserved' => "That salon ID can't be used", _ => 'That salon ID is taken' };
      } on ApiError {
        note = null;
      }
      if (mounted && seq == _seq) setState(() => _slugNote = note);
    });
  }

  Future<void> _submit() async {
    if (_busy) return;
    final problem = _salon.text.trim().length < 2
        ? "Enter your salon's name"
        : _name.text.trim().length < 2
            ? 'Enter your name'
            : !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(_email.text.trim())
                ? 'Enter a valid email'
                : !isValidSlug(normalizeSlug(_slug.text))
                    ? 'Choose a salon ID (3–30 letters, numbers or dashes)'
                    : _pass.text.length < 8
                        ? 'Password must be at least 8 characters'
                        : null;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.signUp(
        salonName: _salon.text,
        ownerName: _name.text,
        email: _email.text,
        slug: _slug.text,
        password: _pass.text,
        phone: _phone.text,
        country: _country,
      );
    } on Offline {
      if (mounted) setState(() => _error = "You're offline");
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    const gap = SizedBox(height: 12);
    final note = _slugNote;
    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent, scrolledUnderElevation: 0),
      extendBodyBehindAppBar: true,
      body: SkBackground(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
            child: SkGlass(
              padding: const EdgeInsets.all(24),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Start your free trial', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Text('7 days free, every feature. No card needed.', style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  const SizedBox(height: 20),
                  TextField(
                    key: const ValueKey('su-salon'),
                    controller: _salon,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    onChanged: _salonChanged,
                    decoration: const InputDecoration(labelText: "Salon's name"),
                  ),
                  gap,
                  TextField(
                    key: const ValueKey('su-name'),
                    controller: _name,
                    textCapitalization: TextCapitalization.words,
                    autofillHints: const [AutofillHints.name],
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Your name'),
                  ),
                  gap,
                  TextField(
                    key: const ValueKey('su-email'),
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    autofillHints: const [AutofillHints.email],
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Email', helperText: 'You sign in with this'),
                  ),
                  gap,
                  TextField(
                    key: const ValueKey('su-phone'),
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Mobile (optional)'),
                  ),
                  gap,
                  DropdownButtonFormField<String>(
                    initialValue: _country,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Country'),
                    items: [for (final (code, name) in kSignupCountries) DropdownMenuItem(value: code, child: Text(name))],
                    onChanged: (v) => setState(() => _country = v ?? _country),
                  ),
                  gap,
                  TextField(
                    key: const ValueKey('su-slug'),
                    controller: _slug,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) {
                      _slugEdited = true;
                      _checkSlugSoon();
                    },
                    decoration: InputDecoration(
                      labelText: 'Salon ID',
                      helperText: note == '' ? '${normalizeSlug(_slug.text)}.$kRootDomain is yours' : (note == null ? 'Your salon\'s web address' : null),
                      errorText: note != null && note.isNotEmpty ? note : null,
                      suffixIcon: note == '' ? Icon(Icons.check_circle_rounded, color: c.primary) : null,
                    ),
                  ),
                  gap,
                  TextField(
                    key: const ValueKey('su-pass'),
                    controller: _pass,
                    obscureText: !_show,
                    autofillHints: const [AutofillHints.newPassword],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: 'Password (8+ characters)',
                      suffixIcon: IconButton(
                        tooltip: _show ? 'Hide password' : 'Show password',
                        icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                        onPressed: () => setState(() => _show = !_show),
                      ),
                    ),
                  ),
                  if (_error != null) ...[
                    gap,
                    Text(_error!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    onPressed: _busy ? null : _submit,
                    child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Start free trial'),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
