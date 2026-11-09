import 'package:flutter/material.dart';

/// A full-width pill with the provider's mark ("Continue with Google / Apple"), as Google's and Apple's guidelines
/// ask: mark on the left, label centred, a chevron on the right.
class SkSocialButton extends StatelessWidget {
  const SkSocialButton({super.key, required this.label, required this.icon, required this.onPressed});
  final String label;
  final Widget icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        backgroundColor: c.surface,
        foregroundColor: c.onSurface,
        side: BorderSide(color: c.outlineVariant),
      ),
      onPressed: onPressed,
      child: Row(children: [
        SizedBox(width: 24, child: Center(child: icon)),
        Expanded(child: Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
        Icon(Icons.chevron_right_rounded, size: 20, color: c.onSurfaceVariant),
      ]),
    );
  }
}
